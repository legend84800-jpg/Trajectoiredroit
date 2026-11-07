// Kit d'essai des majeures préparées (07/11/2026).
// L'élève choisit deux majeures d'une matière et laisse son email. lead.js
// l'inscrit avec SOURCE=essai-majeures et les attributs ESSAI_*, puis :
// et l'ajoute à la liste 9 « Essai majeures préparées » (sans automatisation),
// puis envoie le kit et le code par email transactionnel.
// Le code de -15 % valable 48 heures est un code promotionnel Stripe à usage
// unique, créé sur le coupon existant « remise-post-achat-15 », exactement comme
// les codes POSTA. Le lien de l'email porte ?code=, que le site applique déjà
// tout seul au paiement : rien ne change dans le parcours d'achat.

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const ESSAIS = require("./_essai-majeures.json");

const COUPON = "remise-post-achat-15";
const POURCENTAGE = 15;
const DUREE_SECONDES = 48 * 60 * 60;
const SITE = "https://trajectoiredroit.com";
const LISTE_BREVO = 9;

function essaiValide(produit, majeures) {
  const e = ESSAIS[produit];
  if (!e || !Array.isArray(majeures)) return null;
  const choix = [...new Set(majeures.map(Number))].filter(i => Number.isInteger(i) && i >= 1 && i <= e.nb).sort((a, b) => a - b);
  if (choix.length !== 2) return null;
  return choix;
}

function euros(centimes) {
  return (centimes / 100).toFixed(2).replace(".", ",") + " €";
}

function dateFin(timestamp) {
  const d = new Date(timestamp * 1000);
  const jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(d).replace(/\D/g, "");
  return `${jour} à ${heure} h`;
}

function titreMajeure(produit, i) {
  const m = ESSAIS[produit].majeures.find(x => x.i === i);
  return m ? m.titre : "";
}

async function creerCode(produit, stripeCle) {
  if (!stripeCle) return null;
  const stripe = require("stripe")(stripeCle, { timeout: 8000, maxNetworkRetries: 1 });
  const code = "ESSAI-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const expire = Math.floor(Date.now() / 1000) + DUREE_SECONDES;
  const promo = await stripe.promotionCodes.create({
    code,
    active: true,
    expires_at: expire,
    max_redemptions: 1,
    promotion: { type: "coupon", coupon: COUPON },
    metadata: { campaign: "essai-majeures", produit },
  });
  return { code: promo.code, expire };
}

function urlKit(produit, choix) {
  return `${SITE}/api/kit-essai?m=${produit}&a=${choix[0]}&b=${choix[1]}`;
}

function urlRecueil(produit, code) {
  const p = new URLSearchParams({ produit, utm_source: "brevo", utm_medium: "email", utm_campaign: "essai-majeures", utm_content: produit });
  if (code) p.set("code", code);
  return `${SITE}/majeures-preparees.html?${p.toString()}`;
}

// Attributs enregistrés sur le contact Brevo et lus par l'email ci-dessous.
function attributsEssai(produit, choix, remise) {
  const e = ESSAIS[produit];
  const prix = PRODUITS[produit].prix;
  return {
    SOURCE: "essai-majeures",
    MATIERE: produit,
    ESSAI_MATIERE: e.matiere,
    ESSAI_MAJ_A: titreMajeure(produit, choix[0]),
    ESSAI_MAJ_B: titreMajeure(produit, choix[1]),
    ESSAI_KIT: urlKit(produit, choix),
    ESSAI_CP: e.kit.cp ? "oui" : "",
    ESSAI_NB: String(e.nb),
    ESSAI_PRIX: euros(prix),
    ESSAI_PRIX_REMISE: euros(Math.round(prix * (100 - POURCENTAGE) / 100)),
    ESSAI_CODE: remise ? remise.code : "",
    ESSAI_FIN: remise ? dateFin(remise.expire) : "",
    ESSAI_URL: urlRecueil(produit, remise && remise.code),
  };
}

// Textes passés par redaction-julien (checklist, passe adversariale, vale,
// verificateur_anti_ia.py, verificateur_style_positif.py) le 07/11/2026.
// Le paragraphe du code reprend la formulation dictée par Julien.
function construireEmailEssai(a) {
  const paragraphes = [
    "Salut,",
    `Tu as choisi deux majeures de ${a.ESSAI_MATIERE}, « ${a.ESSAI_MAJ_A} » et « ${a.ESSAI_MAJ_B} ». Ton kit d'essai les contient en entier, rédigées condition par condition avec leurs articles et leurs arrêts.`
      + (a.ESSAI_CP ? " Tu y trouves aussi un cas pratique corrigé de la matière, où les majeures sont appliquées aux faits de l'énoncé." : ""),
    { lien: a.ESSAI_KIT, texte: "Ouvrir mon kit d'essai" },
    "Pour t'en servir, le mieux est de prendre un sujet de TD qui porte sur l'une de ces deux majeures, puis d'écrire ta propre majeure sans regarder le kit. Ensuite, tu compares ta version avec celle du kit, condition par condition. Tu repères ainsi tout de suite ce qui manquait dans ta copie, par exemple un article ou une condition que tu avais oubliés.",
  ];
  if (a.ESSAI_CODE) {
    paragraphes.push(
      `Si ça t'intéresse et que tu veux les majeures complètes, voici un code de -15 % valable 48 heures sur les majeures de cette matière. Ton code est ${a.ESSAI_CODE}.`,
      `Avec ce code, le recueil des ${a.ESSAI_NB} majeures de ${a.ESSAI_MATIERE} passe de ${a.ESSAI_PRIX} à ${a.ESSAI_PRIX_REMISE}. Le bouton ci-dessous applique le code tout seul au paiement, jusqu'au ${a.ESSAI_FIN}.`,
      { lien: a.ESSAI_URL, texte: "Voir les majeures complètes avec -15 %" },
    );
  } else {
    paragraphes.push(
      `Si tu veux les majeures complètes, le recueil réunit les ${a.ESSAI_NB} majeures de ${a.ESSAI_MATIERE} pour ${a.ESSAI_PRIX}.`,
      { lien: a.ESSAI_URL, texte: "Voir les majeures complètes" },
    );
  }
  paragraphes.push("Si tu as une question sur une majeure, tu peux répondre à cet email. Je lis moi-même les réponses.", "Julien");
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const html = '<html lang="fr"><body style="font:16px Arial;line-height:1.6;max-width:580px;margin:30px auto;padding:20px">'
    + paragraphes.map(p => typeof p === "string" ? "<p>" + esc(p) + "</p>"
      : '<p><a href="' + esc(p.lien) + '" style="display:inline-block;padding:11px 18px;background:#1A2851;color:#fff;border-radius:8px;font-weight:bold;text-decoration:none">' + esc(p.texte) + "</a></p>").join("")
    + "</body></html>";
  const texte = paragraphes.map(p => typeof p === "string" ? p : p.texte + "\n" + p.lien).join("\n\n");
  return { sujet: `Ton kit d'essai de ${a.ESSAI_MATIERE}`, html, texte };
}

async function envoyerEssai(email, attributs, apiKey) {
  const contenu = construireEmailEssai(attributs);
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
      tags: ["essai-majeures", attributs.MATIERE],
    }),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}

module.exports = { LISTE_BREVO, essaiValide, creerCode, attributsEssai, construireEmailEssai, envoyerEssai, urlKit, ESSAIS };
