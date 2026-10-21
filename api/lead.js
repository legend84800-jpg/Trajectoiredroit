// Fonction serverless Vercel : capture d'email vers Brevo (assistant de chat,
// newsletter, extraits de matière, cas pratique corrigé offert).
// La clé Brevo reste côté serveur (variable d'environnement BREVO_API_KEY).
// BREVO_LIST_ID (optionnel) range le contact dans une liste précise.
//
// Sans `matiere`, le comportement est celui d'origine : le contact est inscrit
// avec l'attribut SOURCE et rien d'autre ne se passe.
// Avec `matiere` (un id cas-pratique-* de la liste blanche ci-dessous, lot C du
// chantier conversion du 10/10/2026), le contact est inscrit avec SOURCE=corrige-offert
// et MATIERE=<id>, puis un email transactionnel lui envoie le lien du PDF offert,
// à savoir le premier cas pratique du recueil, publié sur R2 sous tjd/corrige-offert/<id>.pdf.

const PRODUITS = require("./_produits");
const { attributsExercice, suggestionEmail, emailDepuisAttributs } = require('./_corriges-exercices');
// Plan du commentaire offert sur les pages d'arrêts les plus vues (test du 20/10/2026).
// Liste blanche écrite par livrables/automatisation/test-arrets-conversion-2026-10-20/generer_liste_plans.py.
const PLANS = require('./_plans-commentaires.json');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

async function contactDejaDansListe(email, apiKey) {
  const listId = parseInt(process.env.BREVO_LIST_ID || "", 10);
  if (Number.isNaN(listId)) return true;
  const resp = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    headers: { "api-key": apiKey, accept: "application/json" },
  });
  if (resp.status === 404) return false;
  if (!resp.ok) return true; // Dans le doute, l'email transactionnel garantit la livraison.
  const contact = await resp.json().catch(() => ({}));
  return Array.isArray(contact.listIds) && contact.listIds.includes(listId);
}

async function inscrireContact(email, attributs, apiKey) {
  const payload = { email, updateEnabled: true, attributes: attributs };
  const listId = parseInt(process.env.BREVO_LIST_ID || "", 10);
  if (!Number.isNaN(listId)) payload.listIds = [listId];

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

async function envoyerCorrigeOffert(email, matiere, apiKey) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
      to: [{ email }],
      // L'email invite à répondre : sans ce replyTo, la réponse partirait vers
      // contact@trajectoiredroit.com, jamais lue par Julien.
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      templateId: 33,
      tags: ["corrige-offert", matiere],
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

function urlCommentaire(plan) {
  const params = new URLSearchParams({ utm_source: 'brevo', utm_medium: 'email',
    utm_campaign: 'plan-commentaire', utm_content: plan });
  return 'https://trajectoiredroit.com/' + PLANS[plan].page + '?' + params.toString() + '#commentaire-corrige';
}

// Attributs lus par le premier email de la séquence de bienvenue Brevo (branche
// SOURCE == "plan-commentaire" du modèle 1) et par l'email transactionnel ci-dessous.
function attributsPlan(plan) {
  const x = PLANS[plan];
  return {
    SOURCE: "plan-commentaire",
    PLAN_SLUG: plan,
    PLAN_ARRET: x.arret,
    PLAN_PDF: x.pdf,
    PLAN_URL: urlCommentaire(plan),
    PLAN_PAGES: String(x.pages),
    PLAN_PRIX: euros(PRODUITS[x.produit].prix),
  };
}

// Textes passés par redaction-julien (checklist, passe adversariale, vale,
// verificateur_anti_ia.py, verificateur_style_positif.py) le 20/10/2026.
function construireEmailPlan(a) {
  const paragraphes = [
    "Salut,",
    `Tu as demandé le plan du commentaire de ${a.PLAN_ARRET}. Tu y trouves d'abord la problématique et la solution du juge, avec l'annonce du plan. Les deux parties suivent, chacune avec le paragraphe qui explique ce qu'elle démontre.`,
    { lien: a.PLAN_PDF, texte: "Télécharger le plan" },
    "Pour t'en servir avant ton TD, tu peux rédiger toi-même une sous-partie à partir de son titre. Tu verras ainsi quels arrêts et quels articles tu sais déjà utiliser pour la défendre.",
    `Le commentaire rédigé en entier fait ${a.PLAN_PAGES} pages, avec le texte intégral de la décision. Il coûte ${a.PLAN_PRIX}, et tu le trouves sur la page de l'arrêt.`,
    { lien: a.PLAN_URL, texte: "Voir le commentaire rédigé" },
    "Si tu as une question sur le plan, tu peux répondre à cet email. Je lis moi-même les réponses.",
    "Julien",
  ];
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = '<html lang="fr"><body style="font:16px Arial;line-height:1.6;max-width:580px;margin:30px auto;padding:20px">'
    + paragraphes.map(p => typeof p === "string" ? '<p>' + esc(p) + '</p>'
      : '<p><a href="' + esc(p.lien) + '" style="color:#1A2851;font-weight:bold">' + esc(p.texte) + '</a></p>').join('')
    + '</body></html>';
  const texte = paragraphes.map(p => typeof p === "string" ? p : p.texte + "\n" + p.lien).join("\n\n");
  return { sujet: `Ton plan du commentaire de ${a.PLAN_ARRET}`, html, texte };
}

async function envoyerPlan(email, plan, apiKey) {
  const contenu = construireEmailPlan(attributsPlan(plan));
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Trajectoire Droit", email: "contact@trajectoiredroit.com" },
      to: [{ email }],
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      subject: contenu.sujet,
      htmlContent: contenu.html,
      textContent: contenu.texte,
      tags: ["plan-commentaire", plan],
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
    if ((avecMatiere || body.exercice) && proposition && body.confirmerDomaine !== true) {
      return res.status(409).json({ error: 'Vérifie le domaine de ton adresse email.', suggestion: proposition });
    }
    if (body.exercice) {
      const attributs = attributsExercice(String(body.exercice));
      if (!attributs) return res.status(400).json({ error: 'Exercice inconnu.' });
      if (typeof body.site === 'string' && body.site.trim()) return res.status(200).json({ ok: true });
      if (limiteAtteinte(ipVisiteur(req)) || limiteAtteinte('email:' + email)) return res.status(429).json({ error: 'Trop de demandes. Réessaie dans quelques minutes.' });
      const dejaInscrit = await contactDejaDansListe(email, apiKey);
      const inscription = await inscrireContact(email, attributs, apiKey);
      if (!inscription.ok) return res.status(502).json({ error: 'Inscription impossible pour le moment.' });
      // Nouveau contact : une seule livraison par le scénario de bienvenue.
      // Déjà abonné : le scénario ne redémarre pas, on livre son nouvel exercice.
      if (dejaInscrit) {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', { method:'POST',headers:{'Content-Type':'application/json','api-key':apiKey},
          body:JSON.stringify({sender:{name:'Trajectoire Droit',email:'contact@trajectoiredroit.com'},to:[{email}],replyTo:{email:'julien.prof1@gmail.com',name:'Julien'},templateId:33,tags:['corrige-exercice',String(body.exercice)]})});
        if (!resp.ok) throw new Error('Livraison Brevo impossible');
      }
      return res.status(200).json({ok:true,envoye:true});
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
      // Même logique que le corrigé offert : un nouvel inscrit reçoit le plan par le
      // premier email de la séquence de bienvenue, un contact déjà inscrit par un
      // email transactionnel, car la séquence ne redémarre pas pour lui.
      const dejaInscrit = await contactDejaDansListe(email, apiKey);
      const inscription = await inscrireContact(email, attributsPlan(plan), apiKey);
      if (!inscription.ok) {
        console.error("Brevo error:", inscription.status, inscription.detail);
        return res.status(502).json({ error: "Inscription impossible pour le moment." });
      }
      if (dejaInscrit) await envoyerPlan(email, plan, apiKey);
      return res.status(200).json({ ok: true, envoye: true });
    }
    if (!avecMatiere) {
      const inscription = await inscrireContact(email, { SOURCE: source }, apiKey);
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

    // Un nouvel inscrit entre dans la liste des leads, ce qui déclenche la séquence
    // de bienvenue Brevo (« Automatisation #1 »). Son premier email affiche le
    // corrigé quand SOURCE vaut corrige-offert, grâce aux attributs CORRIGE_*.
    // Un contact déjà dans la liste ne relance pas la séquence : il reçoit donc
    // le corrigé par l'email transactionnel, comme avant.
    const dejaInscrit = await contactDejaDansListe(email, apiKey);
    const inscription = await inscrireContact(email, attributsCorrige(matiere), apiKey);
    if (!inscription.ok) {
      console.error("Brevo error:", inscription.status, inscription.detail);
      res.status(502).json({ error: "Inscription impossible pour le moment." });
      return;
    }

    if (dejaInscrit) await envoyerCorrigeOffert(email, matiere, apiKey);
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
