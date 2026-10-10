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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const R2_PUBLIC = "https://pub-45b53167be7548aca62650d34a771b47.r2.dev";
const URL_RECUEILS =
  "https://trajectoiredroit.com/cas-pratiques-corriges.html?utm_source=brevo&utm_medium=email&utm_campaign=corrige-offert";

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
  const produit = PRODUITS[matiere];
  const compte = CORRIGES_OFFERTS[matiere];
  const nomRecueil = produit.nom;
  const nomMatiere = nomRecueil.replace(/^Cas pratiques corrigés /, "");
  const prix = euros(produit.prix);
  const lienPdf = urlPdf(matiere);

  const sujet = `Ton cas pratique corrigé de ${nomMatiere}`;
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:100%;">
        <tr><td style="background:#1a237e;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">TrajectoireDroit</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:18px;font-weight:700;color:#1a237e;margin:0 0 24px;">Ton cas pratique corrigé de ${nomMatiere}</p>
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Tu as demandé un cas pratique corrigé de <strong>${nomMatiere}</strong> sur TrajectoireDroit, et le voici. Le PDF contient l'énoncé et son corrigé complet.
          </p>
          <a href="${lienPdf}" style="display:inline-block;margin:0 0 24px;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">
            Télécharger mon cas pratique corrigé
          </a>
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Le lien reste valable, donc tu peux garder cet email pour retrouver le PDF plus tard.
          </p>
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Le mieux est de traiter d'abord l'énoncé seul, au brouillon, avant de lire le corrigé. En comparant ensuite les deux, tu vois tout de suite les arguments que tu avais trouvés et ceux qui te manquaient.
          </p>
          <p style="font-size:13px;color:#555;margin:0 0 24px;">
            Ce cas pratique vient du recueil <strong>${nomRecueil}</strong>. Le recueil complet réunit ${compte.cas} cas pratiques et ${compte.partiels} sujets type partiel, tous corrigés avec la même méthode. Il coûte ${prix}, et tu peux le voir sur <a href="${URL_RECUEILS}" style="color:#1a237e;">la page des cas pratiques corrigés</a> si tu veux t'entraîner sur les autres thèmes du cours.
          </p>
          <p style="font-size:13px;color:#555;margin:0 0 24px;">
            Si une question te bloque dans le corrigé, tu peux répondre directement à cet email, car je reçois moi-même les réponses.
          </p>
          <p style="font-size:15px;color:#1a237e;font-weight:700;margin:0;">Julien</p>
        </td></tr>
        <tr><td style="background:#f0f0f0;padding:16px 32px;">
          <p style="font-size:12px;color:#999;margin:0;">Tu reçois cet email parce que tu as demandé ce corrigé sur trajectoiredroit.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texte = `Tu as demandé un cas pratique corrigé de ${nomMatiere} sur TrajectoireDroit, et le voici. Le PDF contient l'énoncé et son corrigé complet.

Télécharger mon cas pratique corrigé : ${lienPdf}

Le lien reste valable, donc tu peux garder cet email pour retrouver le PDF plus tard.

Le mieux est de traiter d'abord l'énoncé seul, au brouillon, avant de lire le corrigé. En comparant ensuite les deux, tu vois tout de suite les arguments que tu avais trouvés et ceux qui te manquaient.

Ce cas pratique vient du recueil ${nomRecueil}. Le recueil complet réunit ${compte.cas} cas pratiques et ${compte.partiels} sujets type partiel, tous corrigés avec la même méthode. Il coûte ${prix}, et tu peux le voir sur la page des cas pratiques corrigés si tu veux t'entraîner sur les autres thèmes du cours.
${URL_RECUEILS}

Si une question te bloque dans le corrigé, tu peux répondre directement à cet email, car je reçois moi-même les réponses.

Julien, TrajectoireDroit

Tu reçois cet email parce que tu as demandé ce corrigé sur trajectoiredroit.com.`;

  return { sujet, html, texte };
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
  const contenu = construireEmailCorrigeOffert(matiere);
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
      to: [{ email }],
      // L'email invite à répondre : sans ce replyTo, la réponse partirait vers
      // contact@trajectoiredroit.com, jamais lue par Julien.
      replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
      subject: contenu.sujet,
      htmlContent: contenu.html,
      textContent: contenu.texte,
      tags: ["corrige-offert", matiere],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${err}`);
  }
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
