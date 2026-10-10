// Avis des acheteurs recueillis sur le site (donner-mon-avis.html).
// GET  /api/avis?session_id=cs_xxx      contexte du formulaire (produit, fiche offerte ou choix)
// GET  /api/avis?produit=<id>           avis publiés pour un produit
// GET  /api/avis?matiere=<id>           avis publiés pour une matière (ex. "da-l2-s1", "da-l2")
// POST /api/avis { session_id, prenom, niveau, note, texte, fiche_choisie? }
//
// Un avis par session Stripe payée. En remerciement, l'acheteur reçoit une fiche de
// citations quelle que soit sa note, et cette contrepartie est affichée à côté de
// chaque avis publié (transparence imposée par le Code de la consommation).
// Table Supabase : public.avis (supabase/avis.sql), accessible par la seule clé service.

const PRODUITS = require("./_produits");
const { creerClientStripe } = require("./_stripe");
const { construireLiensTelechargement } = require("./_liens-telechargement");
const { selectionner, insererSiAbsent, supprimer } = require("./_supabase");

const ORIGINE_SITE = "https://trajectoiredroit.com";
const LIBELLE_CONTREPARTIE = "Fiche de citations offerte en remerciement de l'avis";
const DUREE_LIEN_SECONDES = 7 * 24 * 3600;
const NIVEAUX = new Set(["L1", "L2", "L3"]);
const TEXTE_MIN = 20;
const TEXTE_MAX = 1200;
const PRENOM_MAX = 40;

// Familles de produits, de la plus spécifique à la plus générale. Le reste de
// l'identifiant donne la matière (ex. "fiche-da-l2-s1" donne "da-l2-s1").
const PREFIXES_MATIERE = [
  "pack-matiere-",
  "cours-complet-",
  "cours-fiche-",
  "flashcards-qcm-",
  "commentaire-arret-",
  "cas-pratique-",
  "dissertation-",
  "fiche-arret-",
  "citations-",
  "fiche-",
  "maj-",
];

// Matières dont la fiche de citations porte un autre nom dans le catalogue.
const ALIAS_CITATIONS = {
  "contrats-l2-s1": "obligations-l2-s1",
  "contrats-l2": "obligations-l2-s1",
  "travail-l3-s1": "travail-l3",
  "societes-l3-s1": "societes-l3",
  "societes-l3-s2": "societes-l3",
};

const FICHES_CITATIONS = Object.keys(PRODUITS)
  .filter((id) => id.startsWith("citations-") && PRODUITS[id].blobs.length === 1)
  .sort((a, b) => PRODUITS[a].nom.localeCompare(PRODUITS[b].nom, "fr"));

function matiereDepuisProduit(produitId) {
  if (typeof produitId !== "string") return null;
  const prefixe = PREFIXES_MATIERE.find((p) => produitId.startsWith(p));
  if (!prefixe) return null;
  return produitId.slice(prefixe.length) || null;
}

// Fiches de citations qui correspondent à la matière : la fiche exacte, celle du
// même cours sans semestre, ou les deux semestres d'un pack annuel.
function citationsPourMatiere(matiere) {
  if (!matiere) return [];
  const cible = ALIAS_CITATIONS[matiere] || matiere;
  const exacte = `citations-${cible}`;
  if (FICHES_CITATIONS.includes(exacte)) return [exacte];
  const sansSemestre = `citations-${cible.replace(/-s[12]$/, "")}`;
  if (FICHES_CITATIONS.includes(sansSemestre)) return [sansSemestre];
  return FICHES_CITATIONS.filter((id) => id.startsWith(`citations-${cible}-`));
}

function produitsDeSession(session) {
  return (((session && session.metadata && session.metadata.produitIds) || "")
    .split(",").map((id) => id.trim()).filter((id) => PRODUITS[id]));
}

// Le stage et Portalis ne passent pas par ce formulaire. Le premier produit
// numérique de la commande sert de référence pour l'avis.
function produitReference(produitIds) {
  return produitIds.find((id) => !id.startsWith("stage-")) || null;
}

// Détermine la fiche offerte. Une fiche déjà achetée dans la même commande est
// écartée. S'il reste une seule fiche possible, elle est choisie d'office ;
// sinon l'acheteur choisit dans la liste renvoyée.
function contexteFicheOfferte(produitIds) {
  const dejaAchetes = new Set();
  for (const id of produitIds) for (const blob of PRODUITS[id].blobs) dejaAchetes.add(blob);
  const disponible = (id) => !dejaAchetes.has(PRODUITS[id].blobs[0]);

  const reference = produitReference(produitIds);
  const matiere = matiereDepuisProduit(reference);
  const candidates = citationsPourMatiere(matiere).filter(disponible);
  if (candidates.length === 1) return { matiere, auto: candidates[0], choix: [] };
  const choix = candidates.length > 1 ? candidates : FICHES_CITATIONS.filter(disponible);
  return { matiere, auto: null, choix };
}

function nettoyerTexte(valeur, max) {
  if (typeof valeur !== "string") return null;
  const texte = valeur.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!texte || texte.length > max) return null;
  return texte;
}

// Garde-fous simples contre les abus : longueurs bornées, aucun lien, aucune
// adresse email, aucun caractère de contrôle. Renvoie l'avis normalisé ou une erreur.
function validerAvis(corps) {
  const prenom = nettoyerTexte(corps.prenom, PRENOM_MAX);
  if (!prenom || prenom.includes("\n") || !/^[\p{L}][\p{L}' .-]*$/u.test(prenom)) {
    return { erreur: "Indique ton prénom, en lettres seulement." };
  }
  const niveau = typeof corps.niveau === "string" ? corps.niveau.trim().toUpperCase() : "";
  if (!NIVEAUX.has(niveau)) return { erreur: "Choisis ton année de licence." };
  const note = Number(corps.note);
  if (!Number.isInteger(note) || note < 1 || note > 5) return { erreur: "Choisis une note entre 1 et 5." };
  const texte = nettoyerTexte(corps.texte, TEXTE_MAX);
  if (!texte || texte.length < TEXTE_MIN) {
    return { erreur: "Ton avis doit faire entre 20 et 1 200 caractères." };
  }
  if (/https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(texte) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(texte)) {
    return { erreur: "Ton avis ne peut contenir ni lien ni adresse email." };
  }
  return { avis: { prenom, niveau, note, texte } };
}

function sessionCompatible(sessionId, cle) {
  const correspondance = typeof sessionId === "string" && sessionId.match(/^cs_(live|test)_[A-Za-z0-9]+$/);
  const modeCle = typeof cle === "string" && cle.match(/^[sr]k_(live|test)_/);
  return Boolean(correspondance && (!modeCle || correspondance[1] === modeCle[1]));
}

// Une session de test Stripe ou un achat de test interne reste en base avec le
// mode "test" : il n'est jamais affiché sur le site.
function modeSession(session) {
  const meta = session.metadata || {};
  const test = session.livemode === false || meta.internalTest === "1" || meta.source === "test_interne";
  return test ? "test" : "live";
}

function sessionEligible(session) {
  const enPlusieursFois = session.mode === "subscription" && ["2", "3"].includes(String((session.metadata || {}).echeances || ""));
  return Boolean(session
    && (session.mode === "payment" || enPlusieursFois)
    && session.payment_status === "paid"
    && session.amount_total > 0
    && produitReference(produitsDeSession(session)));
}

function emailBeneficiaire(session) {
  const meta = session.metadata || {};
  // Pack offert : l'étudiant a reçu les fichiers, c'est donc lui qui donne son avis.
  return meta.cadeauEmail || (session.customer_details && session.customer_details.email) || session.customer_email || null;
}

function echapperHtml(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function contenuEmailFiche(nomProduit, nomFiche, lien) {
  const nomFicheCourant = nomFiche.charAt(0).toLowerCase() + nomFiche.slice(1);
  const produit = echapperHtml(nomProduit);
  const fiche = echapperHtml(nomFicheCourant);
  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a237e;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">TrajectoireDroit</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Merci d'avoir pris le temps de donner ton avis sur « <strong>${produit}</strong> ». Comme promis, je t'offre la <strong>${fiche}</strong>, que tu peux utiliser dans tes dissertations et tes commentaires d'arrêt.</p>
          <a href="${lien}" style="display:inline-block;margin:8px 0 20px;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Télécharger ma fiche de citations</a>
          <p style="font-size:14px;color:#555;margin:0 0 20px;">Le lien reste valable 7 jours. Il vaut donc mieux enregistrer le PDF sur ton ordinateur ou sur ton téléphone dès maintenant. S'il a expiré, tu peux répondre à cet email et je te le renvoie.</p>
          <p style="font-size:15px;color:#1a237e;font-weight:700;margin:0;">Julien</p>
        </td></tr>
        <tr><td style="background:#f0f0f0;padding:16px 32px;">
          <p style="font-size:12px;color:#999;margin:0;">TrajectoireDroit, la référence francophone en droit</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const texte = `Merci d'avoir pris le temps de donner ton avis sur « ${nomProduit} ». Comme promis, je t'offre la ${nomFicheCourant}, que tu peux utiliser dans tes dissertations et tes commentaires d'arrêt.\n\nTélécharger ma fiche de citations : ${lien}\n\nLe lien reste valable 7 jours. Il vaut donc mieux enregistrer le PDF sur ton ordinateur ou sur ton téléphone dès maintenant. S'il a expiré, tu peux répondre à cet email et je te le renvoie.\n\nJulien, TrajectoireDroit`;
  return { sujet: "Merci pour ton avis, voici ta fiche de citations", html, texte };
}

async function envoyerEmailBrevo(destinataire, contenu, brevoKey) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": brevoKey, accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
      to: [{ email: destinataire }],
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      subject: contenu.sujet,
      htmlContent: contenu.html,
      textContent: contenu.texte,
      tags: ["avis-fiche-offerte"],
    }),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
  return resp.json().catch(() => ({}));
}

function dependancesParDefaut() {
  return {
    recupererSession: (sessionId) => creerClientStripe(process.env.STRIPE_SECRET_KEY).checkout.sessions.retrieve(sessionId),
    selectionner,
    insererSiAbsent,
    supprimer,
    envoyerEmail: (destinataire, contenu) => envoyerEmailBrevo(destinataire, contenu, process.env.BREVO_API_KEY),
    downloadSecret: process.env.DOWNLOAD_SECRET,
    // Réservé aux tests locaux : force l'adresse de livraison de la fiche.
    destinataireForce: null,
  };
}

async function avisExistant(sessionId, dep) {
  const lignes = await dep.selectionner("avis", `select=id&session_stripe=eq.${encodeURIComponent(sessionId)}&limit=1`);
  return Array.isArray(lignes) && lignes.length > 0;
}

// Contexte affiché par le formulaire avant l'envoi.
async function contexteFormulaire(sessionId, dep) {
  const session = await dep.recupererSession(sessionId);
  if (!sessionEligible(session)) return { statut: 404, corps: { erreur: "Achat introuvable" } };
  const produitIds = produitsDeSession(session);
  const reference = produitReference(produitIds);
  const fiche = contexteFicheOfferte(produitIds);
  return {
    statut: 200,
    corps: {
      produit: { id: reference, nom: PRODUITS[reference].nom },
      ficheOfferte: fiche.auto ? { id: fiche.auto, nom: PRODUITS[fiche.auto].nom } : null,
      choix: fiche.choix.map((id) => ({ id, nom: PRODUITS[id].nom })),
      dejaDonne: await avisExistant(sessionId, dep),
    },
  };
}

// Enregistre l'avis puis livre la fiche offerte. L'insertion sert de verrou :
// un second envoi pour la même session s'arrête là. Si l'email échoue, la ligne
// est retirée pour que l'acheteur puisse réessayer.
async function enregistrerAvis(corps, dep) {
  const sessionId = corps.session_id;
  const validation = validerAvis(corps);
  if (validation.erreur) return { statut: 400, corps: { erreur: validation.erreur } };

  const session = await dep.recupererSession(sessionId);
  if (!sessionEligible(session)) return { statut: 404, corps: { erreur: "Achat introuvable" } };
  const destinataire = dep.destinataireForce || emailBeneficiaire(session);
  if (!destinataire) return { statut: 404, corps: { erreur: "Achat introuvable" } };

  const produitIds = produitsDeSession(session);
  const reference = produitReference(produitIds);
  const fiche = contexteFicheOfferte(produitIds);
  let ficheId = fiche.auto;
  if (!ficheId) {
    if (!fiche.choix.includes(corps.fiche_choisie)) {
      return { statut: 400, corps: { erreur: "Choisis ta fiche de citations dans la liste." } };
    }
    ficheId = corps.fiche_choisie;
  }

  const lignes = await dep.insererSiAbsent("avis", {
    session_stripe: sessionId,
    produit_id: reference,
    matiere: fiche.matiere,
    ...validation.avis,
    fiche_offerte_id: ficheId,
    mode: dep.destinataireForce ? "test" : modeSession(session),
  }, "session_stripe");
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return { statut: 409, corps: { erreur: "Tu as déjà donné ton avis pour cette commande.", dejaDonne: true } };
  }

  try {
    const [lien] = construireLiensTelechargement(
      ficheId,
      PRODUITS[ficheId],
      dep.downloadSecret,
      ORIGINE_SITE,
      DUREE_LIEN_SECONDES
    );
    await dep.envoyerEmail(destinataire, contenuEmailFiche(PRODUITS[reference].nom, PRODUITS[ficheId].nom, lien.url));
  } catch (e) {
    try {
      await dep.supprimer("avis", `session_stripe=eq.${encodeURIComponent(sessionId)}`);
    } catch (erreurAnnulation) {
      console.error("avis annulation impossible:", erreurAnnulation.message);
    }
    throw e;
  }
  return { statut: 200, corps: { enregistre: true, ficheOfferte: { id: ficheId, nom: PRODUITS[ficheId].nom } } };
}

// Avis publiés d'un produit ou d'une matière. Une matière sans semestre
// ("da-l2") regroupe aussi ses semestres ("da-l2-s1", "da-l2-s2").
async function avisPublies({ produit, matiere }, dep) {
  const filtres = ["select=prenom,niveau,note,texte,cree_le", "statut=eq.publie", "mode=eq.live", "order=cree_le.desc", "limit=50"];
  if (produit) {
    filtres.push(`produit_id=eq.${encodeURIComponent(produit)}`);
  } else {
    filtres.push(`or=(matiere.eq.${encodeURIComponent(matiere)},matiere.like.${encodeURIComponent(`${matiere}-*`)})`);
  }
  const lignes = await dep.selectionner("avis", filtres.join("&"));
  return (lignes || []).map((l) => ({
    prenom: l.prenom,
    niveau: l.niveau,
    note: l.note,
    texte: l.texte,
    date: l.cree_le,
    contrepartie: LIBELLE_CONTREPARTIE,
  }));
}

// Demande d'avis J+7, lancée chaque jour par le cron Vercel (vercel.json).
// Elle vise les achats payés il y a entre 7 et 8 jours, hors tests, hors stage,
// hors acheteurs qui ont répondu « Non merci » au choix « emails » du paiement,
// et hors sessions qui ont déjà un avis. Une fenêtre de 24 h par passage
// quotidien garantit un seul envoi par commande.
const TEMPLATE_DEMANDE_AVIS = 31;

function refuseEmails(session) {
  const champ = (session.custom_fields || []).find((c) => c.key === "emails");
  return Boolean(champ && champ.dropdown && champ.dropdown.value === "non");
}

async function listerSessionsJ7(maintenant) {
  const stripe = creerClientStripe(process.env.STRIPE_SECRET_KEY);
  const fin = Math.floor(maintenant / 1000) - 7 * 24 * 3600;
  const sessions = [];
  for await (const s of stripe.checkout.sessions.list({ created: { gte: fin - 24 * 3600, lt: fin }, limit: 100 })) {
    sessions.push(s);
  }
  return sessions;
}

async function envoyerDemandeAvis(destinataire, session, brevoKey) {
  const noms = produitsDeSession(session).map((id) => PRODUITS[id].nom).join(" + ");
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": brevoKey, accept: "application/json" },
    body: JSON.stringify({
      templateId: TEMPLATE_DEMANDE_AVIS,
      sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      to: [{ email: destinataire }],
      params: { SESSION: session.id, PRODUIT: noms },
      tags: ["demande-avis-j7"],
    }),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}

async function relancerAvis(dep, options = {}) {
  const sessions = await (dep.listerSessionsJ7 || listerSessionsJ7)(options.maintenant || Date.now());
  const bilan = { examinees: sessions.length, envoyees: 0, ignorees: 0, erreurs: 0 };
  for (const session of sessions) {
    const meta = session.metadata || {};
    const email = emailBeneficiaire(session);
    if (!sessionEligible(session) || modeSession(session) === "test" || meta.brand === "trajectoire_philo"
      || meta.cadeauEmail || refuseEmails(session) || !email || await avisExistant(session.id, dep)) {
      bilan.ignorees++;
      continue;
    }
    try {
      await (dep.envoyerDemandeAvis || envoyerDemandeAvis)(dep.destinataireForce || email, session, process.env.BREVO_API_KEY);
      bilan.envoyees++;
    } catch (e) {
      bilan.erreurs++;
      console.error("demande d'avis:", e && e.message ? e.message : "erreur inconnue");
    }
  }
  return bilan;
}

function lireCorps(req) {
  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  return corps && typeof corps === "object" ? corps : {};
}

async function handler(req, res, dependances) {
  const dep = { ...dependancesParDefaut(), ...(dependances || {}) };
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const identifiantValide = (v) => typeof v === "string" && /^[a-z0-9-]{2,80}$/.test(v);

  try {
    if (req.method === "GET" && (req.query || {}).action === "relance") {
      const attendu = process.env.CRON_SECRET;
      if (!attendu || (req.headers && req.headers.authorization) !== `Bearer ${attendu}`) {
        res.status(401).json({ erreur: "Non autorisé" });
        return;
      }
      res.status(200).json(await relancerAvis(dep));
      return;
    }
    if (req.method === "GET") {
      const { session_id: sessionId, produit, matiere } = req.query || {};
      if (sessionId) {
        if (!sessionCompatible(sessionId, stripeKey)) { res.status(404).json({ erreur: "Achat introuvable" }); return; }
        const r = await contexteFormulaire(sessionId, dep);
        res.setHeader("Cache-Control", "private, no-store");
        res.status(r.statut).json(r.corps);
        return;
      }
      if (!identifiantValide(produit) && !identifiantValide(matiere)) {
        res.status(400).json({ erreur: "Paramètre produit ou matiere attendu" });
        return;
      }
      const avis = await avisPublies(identifiantValide(produit) ? { produit } : { matiere }, dep);
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
      res.status(200).json({ avis, contrepartie: LIBELLE_CONTREPARTIE });
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ erreur: "Méthode non autorisée" }); return; }
    if (req.headers && req.headers.origin && req.headers.origin !== ORIGINE_SITE) {
      res.status(403).json({ erreur: "Origine non autorisée" });
      return;
    }
    const corps = lireCorps(req);
    if (!sessionCompatible(corps.session_id, stripeKey)) { res.status(404).json({ erreur: "Achat introuvable" }); return; }
    const brevoManquant = !dependances && !process.env.BREVO_API_KEY;
    if (!dep.downloadSecret || brevoManquant) {
      res.status(503).json({ erreur: "Service indisponible" });
      return;
    }
    const r = await enregistrerAvis(corps, dep);
    res.status(r.statut).json(r.corps);
  } catch (e) {
    if (e && (e.code === "resource_missing" || e.statusCode === 404)) {
      res.status(404).json({ erreur: "Achat introuvable" });
      return;
    }
    console.error("avis erreur:", e && e.message ? e.message : "erreur inconnue");
    res.status(503).json({ erreur: "Enregistrement indisponible" });
  }
}

module.exports = (req, res) => handler(req, res);
module.exports._test = {
  handler,
  relancerAvis,
  refuseEmails,
  matiereDepuisProduit,
  citationsPourMatiere,
  contexteFicheOfferte,
  validerAvis,
  sessionEligible,
  enregistrerAvis,
  contexteFormulaire,
  avisPublies,
  LIBELLE_CONTREPARTIE,
};
