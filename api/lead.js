// Fonction serverless Vercel : capture d'email vers Brevo (assistant de chat,
// newsletter, extraits de matière, cas pratique corrigé offert).
// La clé Brevo reste côté serveur (variable d'environnement BREVO_API_KEY).
// BREVO_LIST_ID (optionnel) range le contact dans une liste précise.
//
// Sans `matiere`, le comportement est celui d'origine : le contact est inscrit
// avec l'attribut SOURCE et rien d'autre ne se passe.
// Pour une ressource offerte, le site envoie le PDF demandé par email transactionnel
// puis ajoute le contact à la liste de suivi Brevo.

const PRODUITS = require("./_produits");
const ESSAI = require("./_essai-majeures");
const { attributsExercice, suggestionEmail, emailDepuisAttributs, COMPTES } = require('./_corriges-exercices');
const { SUJETS, sujetDe } = require('./_offres-matieres');
// Plan du commentaire offert sur les pages d'arrêts les plus vues (test du 20/10/2026).
// Liste blanche écrite par livrables/automatisation/test-arrets-conversion-2026-10-20/generer_liste_plans.py.
const PLANS = require('./_plans-commentaires.json');
const RECOMMANDATIONS_ARRETS = require('./_recommandations-arrets.json');
const recommandationsParPage = new Map();
for (const [produit, recommandation] of Object.entries(RECOMMANDATIONS_ARRETS)) {
  for (const plan of recommandation.plans) {
    const entree = PLANS[plan];
    if (entree) recommandationsParPage.set(entree.page, { produit, ...recommandation });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// La liste 17 lance le suivi au deuxième mail, puis ajoute le contact à la liste 3.
const LISTE_NEWSLETTER = 3;
const LISTE_SUIVI_PDF = 17;
const R2_PUBLIC = "https://pub-45b53167be7548aca62650d34a771b47.r2.dev";
function urlRecueil(matiere) {
  const params = new URLSearchParams({ matiere, utm_source: 'brevo', utm_medium: 'email',
    utm_campaign: 'corrige-offert', utm_content: 'recueil-' + matiere });
  return 'https://trajectoiredroit.com/cas-pratiques-corriges.html?' + params.toString() + '#recueils-cas-pratiques';
}

// Liste blanche des matières, avec le contenu de chaque recueil compté dans le PDF
// vendu le 10/10/2026 (signets « Cas pratique n » et « Partiel n »).
const CORRIGES_OFFERTS = {
  "cas-pratique-intro-droit-l1": { cas: 11, partiels: 3 },
  "cas-pratique-personnes-l1": { cas: 10, partiels: 3 },
  "cas-pratique-famille-l1-s2": { cas: 21, partiels: 3 },
  "cas-pratique-penal-general-l1": { cas: 10, partiels: 3 },
  "cas-pratique-da-l2-s1": { cas: 10, partiels: 3 },
  "cas-pratique-da-l2-s2": { cas: 10, partiels: 3 },
  "cas-pratique-contrats-l2-s1": { cas: 10, partiels: 3 },
  "cas-pratique-obligations-l2-s2": { cas: 10, partiels: 3 },
  "cas-pratique-penal-l2-s1": { cas: 10, partiels: 3 },
  "cas-pratique-biens-l2": { cas: 10, partiels: 3 },
  "cas-pratique-commercial-l3-s1": { cas: 10, partiels: 3 },
  "cas-pratique-commercial-l3-s2": { cas: 10, partiels: 3 },
  "cas-pratique-contrats-speciaux-l3": { cas: 15, partiels: 6 },
  "cas-pratique-societes-l3": { cas: 12, partiels: 4 },
  "cas-pratique-societes-l3-s2": { cas: 12, partiels: 4 },
  "cas-pratique-travail-l3": { cas: 10, partiels: 3 },
  "cas-pratique-procedure-penale-l3": { cas: 10, partiels: 3 },
};

// Limite simple par instance : un même visiteur ne déclenche pas plus de
// 5 envois de PDF en 10 minutes (protège la réputation d'envoi Brevo).
const FENETRE_MS = 10 * 60 * 1000;
const MAX_ENVOIS = 5;
const envoisRecents = new Map();

function limiteAtteinte(cle) {
  const maintenant = Date.now();
  const liste = (envoisRecents.get(cle) || []).filter(t => maintenant - t < FENETRE_MS);
  if (liste.length >= MAX_ENVOIS) {
    envoisRecents.set(cle, liste);
    return true;
  }
  liste.push(maintenant);
  envoisRecents.set(cle, liste);
  if (envoisRecents.size > 5000) envoisRecents.clear();
  return false;
}

function matiereValide(matiere) {
  return typeof matiere === "string"
    && Object.prototype.hasOwnProperty.call(CORRIGES_OFFERTS, matiere)
    && Boolean(PRODUITS[matiere]);
}

function euros(centimes) {
  return (centimes / 100).toFixed(2).replace(".", ",") + " €";
}

function urlPdf(matiere) {
  return `${R2_PUBLIC}/tjd/corrige-offert/${matiere}.pdf`;
}

// Textes passés par redaction-julien (checklist, passe adversariale, vale,
// verificateur_anti_ia.py, verificateur_style_positif.py) le 10/10/2026.
function construireEmailCorrigeOffert(matiere) {
  return emailDepuisAttributs(attributsCorrige(matiere));
}

// Attributs lus par le premier email de la séquence de bienvenue Brevo.
function attributsCorrige(matiere) {
  const produit = PRODUITS[matiere];
  const compte = CORRIGES_OFFERTS[matiere];
  return {
    SOURCE: "corrige-offert",
    MATIERE: matiere,
    CORRIGE_MATIERE: produit.nom.replace(/^Cas pratiques corrigés /, ""),
    CORRIGE_PDF: urlPdf(matiere),
    CORRIGE_RECUEIL: produit.nom,
    CORRIGE_CAS: String(compte.cas),
    CORRIGE_PARTIELS: String(compte.partiels),
    CORRIGE_PRIX: euros(produit.prix),
  };
}

async function inscrireContact(email, attributs, apiKey, listes) {
  const payload = { email, updateEnabled: true, attributes: attributs };
  const listId = parseInt(process.env.BREVO_LIST_ID || "", 10);
  if (listes === undefined && !Number.isNaN(listId)) payload.listIds = [listId];
  if (listes?.length) payload.listIds = listes;

  const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": apiKey,
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  // 201 = créé, 204 = mis à jour. Un contact déjà présent n'est pas une erreur.
  if (brevoRes.ok || brevoRes.status === 204) return { ok: true };
  const detail = await brevoRes.json().catch(() => ({}));
  if (detail && detail.code === "duplicate_parameter") return { ok: true };
  return { ok: false, status: brevoRes.status, detail };
}

async function lireContactBrevo(email, apiKey) {
  const reponse = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    headers: { "api-key": apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(2500),
  });
  if (!reponse.ok) throw new Error("Lecture du contact Brevo impossible");
  return reponse.json();
}

function prenomDuContact(attributs) {
  return [attributs?.PRENOM, attributs?.FIRSTNAME]
    .find(v => typeof v === "string" && v.trim() && v.trim().length <= 80)
    ?.trim() ?? "";
}

async function livrerPdf(email, attributs, apiKey, envoyer) {
  // Le scénario de bienvenue lit ce marqueur après l'ajout à sa liste.
  // On prépare le contact avant de déclencher le scénario.
  const contact = await inscrireContact(email, { ...attributs, LIVRAISON_PDF_SITE: true }, apiKey, []);
  if (!contact.ok) return false;

  // Le formulaire peut ne demander que l'email. Le prénom fiable vient du contact.
  const profil = await lireContactBrevo(email, apiKey).catch(() => null);
  await envoyer({ ...attributs, PRENOM: prenomDuContact(profil?.attributes) });

  const listId = parseInt(process.env.BREVO_LIST_ID || "", 10);
  if (!Number.isNaN(listId)) {
    try {
      // Le PDF est déjà accepté par Brevo. Un échec du suivi ne doit pas
      // demander à l'élève de relancer un envoi qui a réussi.
      let listeSuivi = listId;
      if (listId === LISTE_NEWSLETTER) {
        const { listIds } = profil ?? await lireContactBrevo(email, apiKey);
        if (listIds?.includes(listId)) return true;
        listeSuivi = LISTE_SUIVI_PDF;
      }
      const suivi = await inscrireContact(email, undefined, apiKey, [listeSuivi]);
      if (!suivi.ok) console.error("Inscription au suivi PDF impossible", suivi.status);
    } catch {
      console.error("Inscription au suivi PDF indisponible");
    }
  }
  return true;
}

async function envoyerCorrigeOffert(email, attributs, tags, apiKey) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Julien", email: "contact@trajectoiredroit.com" },
      to: [{ email }],
      // L'email invite à répondre : sans ce replyTo, la réponse partirait vers
      // contact@trajectoiredroit.com, jamais lue par Julien.
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      templateId: 33,
      params: attributs,
      tags,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${err}`);
  }
}

function planValide(plan) {
  return typeof plan === "string" && Object.prototype.hasOwnProperty.call(PLANS, plan)
    && Boolean(PRODUITS[PLANS[plan].produit]);
}

function recommandationArret(page, source, slug) {
  const recommandation = recommandationsParPage.get(page);
  if (!recommandation) return null;

  const { produit, destination, matiere } = recommandation;
  const url = new URL(destination, "https://trajectoiredroit.com");
  url.search = new URLSearchParams({
    utm_source: "brevo",
    utm_medium: "email",
    utm_campaign: source,
    utm_content: slug,
  });

  if (produit.startsWith("commentaire-arret-")) {
    const question = source === "plan-commentaire"
      ? "Tu veux voir comment passer du plan au commentaire rédigé ?"
      : "Tu veux voir comment rédiger le commentaire de cet arrêt ?";
    return {
      url: url.href,
      format: "compilation",
      texte: question + " Le corrigé de cet arrêt figure dans la compilation de la matière.",
      bouton: "Voir la compilation des commentaires corrigés de " + matiere,
    };
  }
  if (produit.startsWith("maj-")) {
    return {
      url: url.href,
      format: "majeures",
      texte: "Tu veux appliquer la règle de cet arrêt dans un cas pratique ? Les majeures préparées te donnent la règle déjà rédigée. Ensuite, tu peux vérifier chaque condition dans les faits de ton énoncé.",
      bouton: "Voir les majeures préparées de " + matiere,
    };
  }
  return {
    url: url.href,
    format: "fiche",
    texte: "Pour réviser le chapitre dans lequel tu étudies cet arrêt, tu peux reprendre les règles et leurs conditions dans la fiche complète du semestre.",
    bouton: "Voir la fiche complète de " + matiere,
  };
}

function attributsRecommandationArret(recommandation) {
  return {
    OFFRE_ARRET_TEXTE: recommandation?.texte ?? "",
    OFFRE_ARRET_BOUTON: recommandation?.bouton ?? "",
    OFFRE_ARRET_FORMAT: recommandation?.format ?? "",
  };
}

function offrePlan(plan, slug) {
  const compilation = plan.compilation;
  const produit = PRODUITS[compilation];
  const url = new URL(`commentaires-arret-corriges.html#${compilation}`, "https://trajectoiredroit.com");
  url.search = new URLSearchParams({ utm_source: "brevo", utm_medium: "email", utm_campaign: "plan-commentaire", utm_content: slug });
  const autres = COMPTES[compilation] - 1;
  const matiere = SUJETS[sujetDe(compilation)].de.replace(/ L[123](?: S[12])?$/, "");
  const niveau = produit.nom.match(/L[123](?: S[12])?$/)?.[0]?.replace(" S", ", S");
  return {
    url: url.href,
    format: "compilation",
    texte: `Si tu veux obtenir le commentaire rédigé en entier ainsi que ${autres} autres commentaires d’arrêt, clique sur le lien ci-dessous. Ces commentaires portent sur l’ensemble des thèmes qui reviennent souvent en partiel.`,
    bouton: `Voir la compilation des commentaires d’arrêt corrigés ${matiere}${niveau ? " (" + niveau + ")" : ""}`,
  };
}

function fichePourPlan(fiche, slug) {
  const chemin = new URL("formations.html", "https://trajectoiredroit.com");
  chemin.hash = fiche;
  chemin.search = new URLSearchParams({ utm_source: "brevo", utm_medium: "email", utm_campaign: "plan-commentaire", utm_content: slug });
  const matiere = SUJETS[sujetDe(fiche)].de.replace(/ L[123](?: S[12])?$/, "");
  return { PLAN_FICHE_URL: chemin.href, PLAN_FICHE_BOUTON: `Voir la fiche complète ${matiere}` };
}

function blocRecommandationArret(a, url) {
  if (!a.OFFRE_ARRET_FORMAT) return [];
  return [
    a.OFFRE_ARRET_TEXTE,
    { lien: url, texte: a.OFFRE_ARRET_BOUTON, format: a.OFFRE_ARRET_FORMAT },
  ];
}

const STYLES_LIENS_ARRET = {
  telechargement: "padding:12px 17px;background:#0E2A47;color:#FFFFFF;text-decoration:none;font-weight:700",
  compilation: "padding:8px 11px;background:#EAF5F0;color:#18564A;text-decoration:underline;font-weight:600",
  majeures: "padding:8px 11px;background:#F4EDF7;color:#583A6F;text-decoration:underline;font-weight:600",
  fiche: "padding:8px 11px;background:#EDF3FA;color:#0E2A47;text-decoration:underline;font-weight:600",
};

function construireEmailArret(sujet, paragraphes, groupesEnGras = [], apercu = "") {
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const corps = paragraphes.map(p => {
    if (typeof p === "string") {
      let texte = esc(p);
      for (const groupe of groupesEnGras) {
        texte = texte.replace(esc(groupe), '<strong style="color:#0E2A47">' + esc(groupe) + '</strong>');
      }
      return '<p>' + texte.replace(/\n/g, '<br>') + '</p>';
    }
    const style = STYLES_LIENS_ARRET[p.format] ?? "color:#1A2851;font-weight:700";
    return '<p><a href="' + esc(p.lien) + '" style="display:inline-block;box-sizing:border-box;max-width:100%;border-radius:6px;overflow-wrap:anywhere;' + style + '">' + esc(p.texte) + '</a></p>';
  }).join("");
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
    + '<body style="margin:0;font:16px Arial;line-height:1.6;color:#0F172A">'
    + (apercu ? '<div style="display:none;mso-hide:all;max-height:0;overflow:hidden">' + esc(apercu) + '</div>' : "")
    + '<div style="box-sizing:border-box;max-width:600px;margin:0 auto;padding:12px 18px">'
    + corps + '</div></body></html>';
  const texte = paragraphes.map(p => typeof p === "string" ? p : p.texte + "\n" + p.lien).join("\n\n");
  return { sujet, html, texte };
}

// Attributs lus par le premier email de la séquence de bienvenue Brevo (branche
// SOURCE == "plan-commentaire" du modèle 1) et par l'email transactionnel ci-dessous.
function attributsPlan(plan) {
  const x = PLANS[plan];
  const recommandation = x.extrait && x.compilation
    ? offrePlan(x, plan)
    : recommandationArret(x.page, "plan-commentaire", plan);
  return {
    SOURCE: "plan-commentaire",
    PLAN_SLUG: plan,
    PLAN_ARRET: x.arret,
    PLAN_PDF: x.pdf,
    PLAN_URL: recommandation?.url ?? "",
    ...(x.extrait ? { PLAN_EXTRAIT: true, ...fichePourPlan(x.fiche, plan) } : {}),
    ...attributsRecommandationArret(recommandation),
  };
}

const SALUT_PDF = a => a.PRENOM ? `Salut ${a.PRENOM},` : "Salut,";

function construireEmailPlan(a, salutation = SALUT_PDF(a)) {
  const sujet = `Ton plan offert pour commenter ${a.PLAN_ARRET}`;
  if (a.PLAN_EXTRAIT && a.OFFRE_ARRET_FORMAT !== "compilation") {
    return construireEmailArret(sujet, [
      salutation,
      `Tu as demandé le plan du commentaire de ${a.PLAN_ARRET}. Le PDF s’ouvre sur l’introduction rédigée, avec la problématique et la solution du juge. Il donne ensuite l’annonce du plan et la première sous-partie (I.A.) rédigée.`,
      { lien: a.PLAN_PDF, texte: "Télécharger le plan offert", format: "telechargement" },
      "Pour t’entraîner, il faut lire l’annonce du plan puis rédiger la première sous-partie à partir de l’arrêt, avant de regarder le modèle. La comparaison avec le modèle permet ensuite de vérifier que ta sous-partie explique ce que le juge a décidé et pourquoi.",
      ...blocRecommandationArret(a, a.PLAN_URL),
      "Si tu as une question sur le commentaire, tu peux m’envoyer un message en répondant à cet email.",
      "Respectueusement,\nJulien\nTrajectoire Droit",
    ], ["l’introduction", "la problématique", "la solution du juge", "la première sous-partie (I.A.) rédigée"], "L’introduction, l’annonce du plan et le I.A. rédigé.");
  }
  if (a.PLAN_EXTRAIT) {
    return construireEmailArret(sujet, [
      salutation,
      `Tu as demandé le plan du commentaire de ${a.PLAN_ARRET}, le voici.`,
      "Dans le PDF, j’ai repris l’introduction avec la problématique et la solution du juge. Tu trouveras ensuite l’annonce du plan et le I.A. rédigé, tel qu’il figure dans le commentaire complet.",
      { lien: a.PLAN_PDF, texte: "Télécharger le plan offert", format: "telechargement" },
      "Si tu veux t’améliorer en commentaire d’arrêt, fais le commentaire d’arrêt de ton côté à partir de l’arrêt. Ensuite, une fois que tu as fini, compare ce que tu as fait avec mon commentaire corrigé. En plus, ça te fera un petit rappel de cours sur le thème de l’arrêt.",
      "Cependant, avoir seulement le I.A. rédigé ne suffit pas pour bien t’entraîner. Il te faut des corrections complètes.",
      ...blocRecommandationArret(a, a.PLAN_URL),
      "Je travaille tous les jours depuis deux ans sur mes fiches afin de créer les meilleures fiches de droit en France. Donc si tu veux réviser avec mes fiches, n’hésite pas à prendre aussi celles de ta matière.",
      { lien: a.PLAN_FICHE_URL, texte: a.PLAN_FICHE_BOUTON, format: "fiche" },
      "Si tu as une question sur le commentaire, tu peux m’envoyer un message en répondant à cet email.",
      "Respectueusement,\nJulien\nTrajectoire Droit",
    ], [
      "l’introduction", "la problématique", "la solution du juge", "le I.A. rédigé",
      "compare ce que tu as fait", "corrections complètes", "tous les jours depuis deux ans",
    ], "L’introduction, l’annonce du plan et le I.A. rédigé.");
  }
  const paragraphes = [
    salutation,
    `Tu as demandé le plan du commentaire de ${a.PLAN_ARRET}. Le PDF commence par la problématique, c’est-à-dire la question juridique à laquelle le commentaire répond. Il rappelle aussi la solution du juge et annonce les deux parties du commentaire. Pour chaque partie, un paragraphe explique ce que tu peux y développer.`,
    { lien: a.PLAN_PDF, texte: "Télécharger le plan", format: "telechargement" },
    "Pour préparer ta séance de travaux dirigés, tu peux prendre une sous-partie du plan et essayer de la rédiger. Tu expliques ce que le juge a décidé et pourquoi, en utilisant les articles et les décisions de justice qui concernent cette question. Tu verras ainsi quels points tu arrives à expliquer seul et lesquels demandent de reprendre ton cours.",
    ...blocRecommandationArret(a, a.PLAN_URL),
    "Si tu as une question sur le plan, tu peux répondre à cet email. Je lis moi-même les réponses.",
    "Julien",
  ];
  return construireEmailArret(sujet, paragraphes, ["la problématique", "la solution du juge"]);
}

function construireModeleBrevoPlan() {
  const champs = [
    "PLAN_ARRET", "PLAN_PDF", "PLAN_URL", "OFFRE_ARRET_TEXTE", "OFFRE_ARRET_BOUTON",
    "PLAN_FICHE_URL", "PLAN_FICHE_BOUTON",
  ];
  const attributs = Object.fromEntries(champs.map(champ => [champ, `{{ params.${champ} }}`]));
  const salutation = "Salut{% if params.PRENOM %} {{ params.PRENOM }}{% endif %},";
  return construireEmailPlan({ ...attributs, PLAN_EXTRAIT: true, OFFRE_ARRET_FORMAT: "compilation" }, salutation);
}

const MODELE_PLAN_OFFERT_BREVO = 70;

async function envoyerPlan(email, attributs, apiKey) {
  const message = { to: [{ email }], tags: ["plan-commentaire", attributs.PLAN_SLUG] };
  if (attributs.PLAN_EXTRAIT && attributs.OFFRE_ARRET_FORMAT === "compilation") {
    message.templateId = MODELE_PLAN_OFFERT_BREVO;
    message.params = attributs;
  } else {
    const contenu = construireEmailPlan(attributs);
    Object.assign(message, {
      sender: { name: "Julien", email: "contact@trajectoiredroit.com" },
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      subject: contenu.sujet,
      htmlContent: contenu.html,
      textContent: contenu.texte,
    });
  }
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
    body: JSON.stringify(message),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}

// Fiche d'arrêt offerte en PDF sur les pages « arrêt expliqué » (composant
// assets/js/pdf-offert.js, 03/11/2026). Liste blanche écrite par
// livrables/automatisation/pdf-offert-premier-ecran/generer_fiches_arrets.py.
const FICHES = require('./_fiches-arrets.json');

function ficheValide(fiche) {
  return typeof fiche === "string" && Object.prototype.hasOwnProperty.call(FICHES, fiche)
    && Boolean(PRODUITS[FICHES[fiche].produit]);
}
function minusculeInitiale(t) {
  return t.charAt(0).toLowerCase() + t.slice(1);
}
// « l'arrêt Dauvin » donne « de l'arrêt Dauvin », « le jugement Ménard » donne « du jugement Ménard ».
function deNom(nom) {
  if (/^le /i.test(nom)) return "du " + nom.slice(3);
  if (/^les /i.test(nom)) return "des " + nom.slice(4);
  return "de " + nom;
}
// « Fiche complète Droit des biens L2 » donne « la fiche complète de droit des biens L2 ».
function produitDansPhrase(nom) {
  let m = nom.match(/^Fiche complète (.+)$/);
  if (m) return { phrase: "la fiche complète de " + minusculeInitiale(m[1]), bouton: "Voir la fiche complète" };
  m = nom.match(/^Majeures préparées (.+)$/);
  if (m) return { phrase: "les majeures préparées de " + minusculeInitiale(m[1]), bouton: "Voir les majeures préparées" };
  const titre = nom.split(" · ")[0];
  return { phrase: "le cours « " + titre + " »", bouton: "Voir le cours" };
}
// « Procédure civile · L3 » donne « procédure civile en L3 ».
function matiereDansPhrase(m) {
  const [matiere, niveau] = m.split(" · ");
  return minusculeInitiale(matiere) + (niveau ? " en " + niveau : "");
}
function urlOffreFiche(fiche) {
  const params = new URLSearchParams({ utm_source: 'brevo', utm_medium: 'email',
    utm_campaign: 'fiche-arret', utm_content: fiche });
  return 'https://trajectoiredroit.com/' + FICHES[fiche].page + '?' + params.toString() + '#offre-matiere';
}
// Attributs lus par le premier email de la séquence de bienvenue Brevo (branche
// SOURCE == "fiche-arret" du modèle 1) et par l'email transactionnel ci-dessous.
function attributsFiche(fiche) {
  const f = FICHES[fiche];
  const produit = PRODUITS[f.produit];
  const p = produitDansPhrase(produit.nom);
  const recommandation = recommandationArret(f.page, "fiche-arret", fiche);
  return {
    SOURCE: "fiche-arret",
    MATIERE: f.produit,
    FICHE_SLUG: fiche,
    FICHE_DE: deNom(f.arret),
    FICHE_TITRE: f.titre,
    FICHE_PDF: f.pdf,
    FICHE_MATIERE: matiereDansPhrase(f.matiere),
    FICHE_PRODUIT: p.phrase,
    FICHE_BOUTON: p.bouton,
    FICHE_PRIX: euros(produit.prix),
    FICHE_URL: recommandation?.url ?? urlOffreFiche(fiche),
    ...attributsRecommandationArret(recommandation),
  };
}
// Textes passés par redaction-julien (checklist, passe adversariale, vale,
// verificateur_anti_ia.py, verificateur_style_positif.py) le 03/11/2026.
function construireEmailFiche(a) {
  const recommandation = a.OFFRE_ARRET_FORMAT
    ? blocRecommandationArret(a, a.FICHE_URL)
    : [
      `${a.FICHE_TITRE} fait partie du programme de ${a.FICHE_MATIERE}. Pour réviser toute la matière avant tes partiels, je te conseille donc ${a.FICHE_PRODUIT}, à ${a.FICHE_PRIX}.`,
      { lien: a.FICHE_URL, texte: a.FICHE_BOUTON },
    ];
  const paragraphes = [
    SALUT_PDF(a),
    `Tu as demandé la fiche ${a.FICHE_DE}. Le PDF reprend toute l’explication de la page, des faits de l’affaire jusqu’à la façon de t’en servir dans une copie.`,
    { lien: a.FICHE_PDF, texte: "Télécharger la fiche", format: "telechargement" },
    "Pour que la fiche te serve en TD, le mieux est de relire d’abord le problème de droit et la solution. Ensuite, redis-les à voix haute sans regarder le PDF, en expliquant pourquoi le juge a tranché ainsi. Si tu y arrives de mémoire, tu sais déjà te servir de l’arrêt dans un cas pratique ou dans un commentaire.",
    ...recommandation,
    "Si tu as une question sur l’arrêt, tu peux répondre à cet email. Je lis moi-même les réponses.",
    "Julien",
  ];
  return construireEmailArret(`Ta fiche ${a.FICHE_DE}`, paragraphes, [
    "le problème de droit et la solution",
    "redis-les à voix haute sans regarder le PDF",
  ]);
}
async function envoyerFiche(email, attributs, apiKey) {
  const contenu = construireEmailFiche(attributs);
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Julien", email: "contact@trajectoiredroit.com" },
      to: [{ email }],
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      subject: contenu.sujet,
      htmlContent: contenu.html,
      textContent: contenu.texte,
      tags: ["fiche-arret", attributs.FICHE_SLUG],
    }),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}
function ipVisiteur(req) {
  const brut = (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) || "";
  return String(brut).split(",")[0].trim() || "inconnue";
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Configuration manquante." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const email = (body.email || "").trim().toLowerCase();
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "assistant-chat";
    const avecMatiere = body.matiere !== undefined && body.matiere !== null && body.matiere !== "";

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "Email invalide." });
      return;
    }

    const proposition = suggestionEmail(email);
    if (body.essai !== undefined && body.essai !== null && body.essai !== "") {
      // Les anciens formulaires envoient un produit et des numéros de majeures.
      // Le contenu livré est le même pour chaque demande.
      if (proposition && body.confirmerDomaine !== true) {
        return res.status(409).json({ error: 'Vérifie le domaine de ton adresse email.', suggestion: proposition });
      }
      if (typeof body.site === "string" && body.site.trim()) return res.status(200).json({ ok: true, kit: ESSAI.KIT_URL });
      if (limiteAtteinte(ipVisiteur(req)) || limiteAtteinte("email:" + email)) {
        return res.status(429).json({ error: "Trop de demandes. Réessaie dans quelques minutes." });
      }
      let remise = null;
      try {
        remise = await ESSAI.creerCode(process.env.STRIPE_SECRET_KEY);
      } catch (e) {
        console.error("essai-majeures code Stripe impossible", e && e.code ? e.code : e && e.message);
      }
      const { ESSAI_URL_DA, ...attributs } = ESSAI.attributsEssai(remise);
      // Liste 9 « Essai majeures préparées ». Elle déclenche sa propre séquence de
      // bienvenue dans Brevo, sans le premier email générique de la liste 3 (08/11/2026).
      const inscription = await inscrireContact(email, attributs, apiKey, [ESSAI.LISTE_BREVO]);
      if (!inscription.ok) {
        console.error("Brevo error:", inscription.status, inscription.detail);
        return res.status(502).json({ error: "Inscription impossible pour le moment." });
      }
      const profil = await lireContactBrevo(email, apiKey).catch(() => null);
      await ESSAI.envoyerEssai(email, {
        ...attributs,
        ESSAI_URL_DA,
        PRENOM: prenomDuContact(profil?.attributes),
      }, apiKey);
      return res.status(200).json({ ok: true, envoye: true, kit: attributs.ESSAI_KIT });
    }
    if ((avecMatiere || body.exercice) && proposition && body.confirmerDomaine !== true) {
      return res.status(409).json({ error: 'Vérifie le domaine de ton adresse email.', suggestion: proposition });
    }
    if (body.exercice) {
      const attributs = attributsExercice(String(body.exercice));
      if (!attributs) return res.status(400).json({ error: 'Exercice inconnu.' });
      if (typeof body.site === 'string' && body.site.trim()) return res.status(200).json({ ok: true });
      if (limiteAtteinte(ipVisiteur(req)) || limiteAtteinte('email:' + email)) return res.status(429).json({ error: 'Trop de demandes. Réessaie dans quelques minutes.' });
      const envoye = await livrerPdf(email, attributs, apiKey, a =>
        envoyerCorrigeOffert(email, a, ["corrige-exercice", String(body.exercice)], apiKey));
      if (!envoye) return res.status(502).json({ error: "Inscription impossible pour le moment." });
      return res.status(200).json({ ok: true, envoye: true });
    }
    if (body.fiche !== undefined && body.fiche !== null && body.fiche !== "") {
      const fiche = String(body.fiche).trim();
      if (!ficheValide(fiche)) return res.status(400).json({ error: "Fiche inconnue." });
      if (proposition && body.confirmerDomaine !== true) {
        return res.status(409).json({ error: 'Vérifie le domaine de ton adresse email.', suggestion: proposition });
      }
      if (typeof body.site === "string" && body.site.trim()) return res.status(200).json({ ok: true });
      if (limiteAtteinte(ipVisiteur(req)) || limiteAtteinte("email:" + email)) {
        return res.status(429).json({ error: "Trop de demandes. Réessaie dans quelques minutes." });
      }
      const envoye = await livrerPdf(email, attributsFiche(fiche), apiKey, a => envoyerFiche(email, a, apiKey));
      if (!envoye) return res.status(502).json({ error: "Inscription impossible pour le moment." });
      return res.status(200).json({ ok: true, envoye: true });
    }
    if (body.plan !== undefined && body.plan !== null && body.plan !== "") {
      const plan = String(body.plan).trim();
      if (!planValide(plan)) return res.status(400).json({ error: "Plan inconnu." });
      if (proposition && body.confirmerDomaine !== true) {
        return res.status(409).json({ error: 'Vérifie le domaine de ton adresse email.', suggestion: proposition });
      }
      if (typeof body.site === "string" && body.site.trim()) return res.status(200).json({ ok: true });
      if (limiteAtteinte(ipVisiteur(req)) || limiteAtteinte("email:" + email)) {
        return res.status(429).json({ error: "Trop de demandes. Réessaie dans quelques minutes." });
      }
      const envoye = await livrerPdf(email, attributsPlan(plan), apiKey, a => envoyerPlan(email, a, apiKey));
      if (!envoye) return res.status(502).json({ error: "Inscription impossible pour le moment." });
      return res.status(200).json({ ok: true, envoye: true });
    }
    if (!avecMatiere) {
      const inscription = await inscrireContact(email, { SOURCE: source, LIVRAISON_PDF_SITE: false }, apiKey);
      if (inscription.ok) {
        res.status(200).json({ ok: true });
        return;
      }
      console.error("Brevo error:", inscription.status, inscription.detail);
      res.status(502).json({ error: "Inscription impossible pour le moment." });
      return;
    }

    const matiere = String(body.matiere).trim();
    if (!matiereValide(matiere)) {
      res.status(400).json({ error: "Matière inconnue." });
      return;
    }

    // Champ piège invisible du formulaire : un robot le remplit, un visiteur jamais.
    if (typeof body.site === "string" && body.site.trim()) {
      res.status(200).json({ ok: true });
      return;
    }

    if (limiteAtteinte(ipVisiteur(req)) || limiteAtteinte("email:" + email)) {
      res.status(429).json({ error: "Trop de demandes. Réessaie dans quelques minutes." });
      return;
    }

    const attributs = attributsCorrige(matiere);
    const envoye = await livrerPdf(email, attributs, apiKey, a =>
      envoyerCorrigeOffert(email, a, ["corrige-offert", matiere], apiKey));
    if (!envoye) return res.status(502).json({ error: "Inscription impossible pour le moment." });
    res.status(200).json({ ok: true, envoye: true });
  } catch (err) {
    console.error("lead handler error:", err);
    res.status(500).json({ error: "Une erreur est survenue." });
  }
}

module.exports = handler;
module.exports.CORRIGES_OFFERTS = CORRIGES_OFFERTS;
module.exports.construireEmailCorrigeOffert = construireEmailCorrigeOffert;
module.exports.urlPdf = urlPdf;
module.exports.attributsCorrige = attributsCorrige;
module.exports.attributsPlan = attributsPlan;
module.exports.construireEmailPlan = construireEmailPlan;
module.exports.construireModeleBrevoPlan = construireModeleBrevoPlan;
module.exports.attributsFiche = attributsFiche;
module.exports.construireEmailFiche = construireEmailFiche;
