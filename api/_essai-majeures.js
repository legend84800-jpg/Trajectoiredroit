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
const MAJEURES_DROIT_ADMINISTRATIF = "maj-da-l2-s1";
const COUPON = "remise-post-achat-15";
const DUREE_SECONDES = 48 * 60 * 60;
const OBJET_ESSAI = "Tes deux majeures offertes";
const MODELE_ESSAI_BREVO = 71;

function dateFin(timestamp) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long",
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

function lienMajeures(produit, code) {
  const url = new URL("/majeures-preparees.html", SITE);
  url.search = new URLSearchParams({
    produit,
    utm_source: "brevo",
    utm_medium: "email",
    utm_campaign: "essai-majeures",
    utm_content: produit,
  });
  if (code) url.searchParams.set("code", code);
  return url.href;
}

function attributsEssai(remise) {
  const code = remise?.code || "";
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
    ESSAI_CODE: code,
    ESSAI_FIN: remise ? dateFin(remise.expire) : "",
    ESSAI_URL: lienMajeures(RECUEIL_PROPOSE, code),
    ESSAI_URL_DA: lienMajeures(MAJEURES_DROIT_ADMINISTRATIF, code),
  };
}

function paragraphesEssai(a, salutation) {
  return {
    debut: [
      salutation,
      "Tu as demandé les deux majeures offertes, les voici.",
      `Dans le PDF, tu trouveras **« ${a.ESSAI_MAJ_A} »** en droit des contrats et **« ${a.ESSAI_MAJ_B} »** en droit administratif. Les conditions et les exceptions sont présentées une par une.`,
      { lien: a.ESSAI_KIT, texte: "Télécharger les deux majeures offertes" },
      "Tu veux t’améliorer en cas pratique ? **Apprends par cœur ces majeures préparées.**",
      "Une majeure préparée, c’est simplement le cours sous forme de conditions et d’exceptions numérotées une par une.",
      "Donc si tu apprends par cœur ces majeures préparées, au partiel, il te suffira d’identifier **la bonne majeure par rapport aux faits**. Et ensuite, dans la mineure, il suffira de vérifier **chaque condition une par une** par rapport aux faits.",
      "Tu es donc sûr de viser **minimum 15 sur 20 en cas pratique** si tu les apprends par cœur.",
    ],
    offres: [
      `Si tu veux obtenir les **majeures préparées complètes de droit des contrats du semestre 1 de L2**, ton code **${a.ESSAI_CODE}** te donne **15 % de réduction** jusqu’au ${a.ESSAI_FIN}.`,
      { lien: a.ESSAI_URL, texte: "Voir les majeures préparées de droit des contrats avec mes 15 % de réduction", offre: true },
      "Et si tu veux obtenir celles de droit administratif (L2, S1), tu as aussi **15 % de réduction** avec le même code.",
      { lien: a.ESSAI_URL_DA, texte: "Voir les majeures préparées de droit administratif avec mes 15 % de réduction", offre: true },
    ],
    fin: [
      "Si tu as une question sur une majeure, tu peux m’envoyer un message en répondant à cet email.",
      "Respectueusement,\nJulien\nTrajectoire Droit",
    ],
  };
}

function paragraphesHtml(paragraphes) {
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return paragraphes.map(p => {
    if (typeof p === "string") {
      const texte = esc(p).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
      return "<p>" + texte + "</p>";
    }
    const couleur = p.offre ? "background:#F4EDF7;color:#583A6F" : "background:#1A2851;color:#fff";
    const style = "display:inline-block;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;"
      + "padding:11px 18px;border-radius:8px;font-weight:bold;text-decoration:none;" + couleur;
    return '<p><a href="' + esc(p.lien) + '" style="' + style + '">' + esc(p.texte) + "</a></p>";
  }).join("");
}

function documentHtml(corps) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
    + '<body style="margin:0;font:16px Arial;line-height:1.6;color:#0F172A">'
    + '<div style="box-sizing:border-box;max-width:600px;margin:0 auto;padding:12px 18px">'
    + corps + "</div></body></html>";
}

function construireEmailEssai(a) {
  const salutation = a.PRENOM ? `Salut ${a.PRENOM},` : "Salut,";
  const { debut, offres, fin } = paragraphesEssai(a, salutation);
  const paragraphes = [...debut, ...(a.ESSAI_CODE ? offres : []), ...fin];
  const texte = paragraphes.map(p => typeof p === "string" ? p.replace(/\*\*/g, "") : p.texte + "\n" + p.lien).join("\n\n");
  return { sujet: OBJET_ESSAI, html: documentHtml(paragraphesHtml(paragraphes)), texte };
}

function construireModeleBrevoEssai() {
  const champs = ["ESSAI_MAJ_A", "ESSAI_MAJ_B", "ESSAI_KIT", "ESSAI_CODE", "ESSAI_FIN", "ESSAI_URL", "ESSAI_URL_DA"];
  const attributs = Object.fromEntries(champs.map(champ => [champ, `{{ params.${champ} }}`]));
  const salutation = "Salut{% if params.PRENOM %} {{ params.PRENOM }}{% endif %},";
  const { debut, offres, fin } = paragraphesEssai(attributs, salutation);
  const corps = paragraphesHtml(debut)
    + "{% if params.ESSAI_CODE %}" + paragraphesHtml(offres) + "{% endif %}"
    + paragraphesHtml(fin);
  return { sujet: OBJET_ESSAI, html: documentHtml(corps) };
}

async function envoyerEssai(email, attributs, apiKey) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
    body: JSON.stringify({
      to: [{ email }],
      templateId: MODELE_ESSAI_BREVO,
      params: attributs,
      tags: ["essai-majeures", RECUEIL_PROPOSE],
    }),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}

module.exports = { KIT, KIT_URL, LISTE_BREVO, creerCode, attributsEssai, construireEmailEssai, construireModeleBrevoEssai, envoyerEssai };
