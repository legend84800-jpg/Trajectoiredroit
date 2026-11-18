const crypto = require("node:crypto");

const SITE = "https://trajectoiredroit.com";
const KIT = "/assets/downloads/deux-majeures-offertes.pdf";
const KIT_URL = SITE + "/api/kit-essai";
const TITRES = Object.freeze([
  "Le dol",
  "La distinction entre service public administratif et service public industriel et commercial",
]);

const LISTE_BREVO = 9;
const RECUEIL_PROPOSE = "maj-contrats-l2-s1";
const COUPON = "remise-post-achat-15";
const DUREE_SECONDES = 48 * 60 * 60;

function dateFin(timestamp) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(timestamp * 1000));
}

async function creerCode(stripeCle) {
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
    metadata: { campaign: "essai-majeures", produit: RECUEIL_PROPOSE },
  });
  return { code: promo.code, expire };
}

function attributsEssai(remise) {
  const lienRecueil = new URL("/majeures-preparees.html", SITE);
  lienRecueil.search = new URLSearchParams({
    produit: RECUEIL_PROPOSE,
    utm_source: "brevo",
    utm_medium: "email",
    utm_campaign: "essai-majeures",
    utm_content: RECUEIL_PROPOSE,
  });
  if (remise) lienRecueil.searchParams.set("code", remise.code);

  return {
    SOURCE: "essai-majeures",
    MATIERE: RECUEIL_PROPOSE,
    ESSAI_MATIERE: "Droit des contrats et droit administratif",
    ESSAI_MAJ_A: TITRES[0],
    ESSAI_MAJ_B: TITRES[1],
    ESSAI_KIT: KIT_URL,
    ESSAI_CP: "",
    ESSAI_NB: "",
    ESSAI_PRIX: "",
    ESSAI_PRIX_REMISE: "",
    ESSAI_CODE: remise ? remise.code : "",
    ESSAI_FIN: remise ? dateFin(remise.expire) : "",
    ESSAI_URL: lienRecueil.href,
  };
}

function construireEmailEssai(a) {
  const paragraphes = [
    "Salut,",
    `Voici les deux majeures offertes. Tu trouveras « ${a.ESSAI_MAJ_A} » en droit des contrats et « ${a.ESSAI_MAJ_B} » en droit administratif.`,
    { lien: a.ESSAI_KIT, texte: "Ouvrir les deux majeures" },
  ];
  if (a.ESSAI_CODE) {
    paragraphes.push(
      `Si tu veux la compilation de droit des contrats, ton code ${a.ESSAI_CODE} te donne 15 % de réduction jusqu’au ${a.ESSAI_FIN} (heure de Paris). Le bouton applique le code au paiement.`,
      { lien: a.ESSAI_URL, texte: "Voir les majeures de droit des contrats" },
    );
  }
  paragraphes.push("Si tu as une question sur une majeure, tu peux répondre à cet email.", "Julien");

  const esc = x => String(x).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const html = '<html lang="fr"><body style="font:16px Arial;line-height:1.6;max-width:580px;margin:24px auto;padding:16px">'
    + paragraphes.map(p => typeof p === "string" ? "<p>" + esc(p) + "</p>"
      : '<p><a href="' + esc(p.lien) + '" style="display:inline-block;padding:11px 18px;background:#1A2851;color:#fff;border-radius:8px;font-weight:bold;text-decoration:none">' + esc(p.texte) + "</a></p>").join("")
    + "</body></html>";
  const texte = paragraphes.map(p => typeof p === "string" ? p : p.texte + "\n" + p.lien).join("\n\n");
  return { sujet: "Tes deux majeures offertes", html, texte };
}

async function envoyerEssai(email, attributs, apiKey) {
  const contenu = construireEmailEssai(attributs);
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
      tags: ["essai-majeures", RECUEIL_PROPOSE],
    }),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}

module.exports = { KIT, KIT_URL, LISTE_BREVO, creerCode, attributsEssai, construireEmailEssai, envoyerEssai };
