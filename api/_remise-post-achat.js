// Code de remise personnel de 15 % donné après un achat (coupon Stripe
// « remise-post-achat-15 », une seule utilisation, valable 15 jours).
//
// Depuis le 14/10/2026, chaque acheteur le reçoit, même sans accepter les emails :
// il s'affiche sur merci-achat.html et dans Mon compte, et il reste mémorisé dans
// le navigateur pour s'appliquer tout seul au paiement suivant. L'email J+8 de
// Brevo le rappelle seulement aux acheteurs qui ont accepté les emails.
// Le code dérive de l'identifiant de la session Stripe : le webhook et la page de
// remerciement retrouvent toujours le même, quel que soit celui qui le crée en premier.

const crypto = require("crypto");

const COUPON_REMISE_POST_ACHAT = "remise-post-achat-15";
const POURCENTAGE_REMISE_POST_ACHAT = 15;
const DUREE_REMISE_SECONDES = 15 * 24 * 60 * 60;

function formaterDateRemise(timestamp) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(timestamp * 1000));
}

function codeRemisePourSession(sessionId) {
  const suffixe = crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 8).toUpperCase();
  return `POSTA-${suffixe}`;
}

function decrireRemise(promo) {
  return {
    code: promo.code,
    dateFin: formaterDateRemise(promo.expires_at),
    expireLe: promo.expires_at,
    pourcentage: POURCENTAGE_REMISE_POST_ACHAT,
  };
}

async function creerRemisePostAchat(sessionId, stripe) {
  const code = codeRemisePourSession(sessionId);
  const params = {
    code,
    active: true,
    expires_at: Math.floor(Date.now() / 1000) + DUREE_REMISE_SECONDES,
    max_redemptions: 1,
    promotion: { type: "coupon", coupon: COUPON_REMISE_POST_ACHAT },
    metadata: { campaign: "post-achat-brevo", checkout_session: sessionId },
  };

  // Le webhook et la page de remerciement peuvent tous deux demander le code :
  // celui qui arrive en second relit le code existant au lieu d'en recréer un.
  const existant = await chercherCode(code, stripe);
  if (existant) return decrireRemise(existant);

  try {
    const promotion = await stripe.promotionCodes.create(params, {
      idempotencyKey: `remise-${sessionId}`,
    });
    return decrireRemise(promotion);
  } catch (e) {
    // Code déjà créé entre-temps, ou clé d'idempotence déjà employée avec une
    // autre date d'expiration : le code existe, on le relit.
    const promo = await chercherCode(code, stripe).catch(() => null);
    if (promo) return decrireRemise(promo);
    throw e;
  }
}

async function chercherCode(code, stripe) {
  const liste = await stripe.promotionCodes.list({ code, limit: 1 });
  return (liste && liste.data && liste.data[0]) || null;
}

// Retrouve un code POSTA s'il existe encore et peut servir, sans le créer.
async function lireRemiseParCode(code, stripe) {
  if (!/^POSTA-[A-F0-9]{8}$/.test(code || "")) return null;
  const liste = await stripe.promotionCodes.list({ code, limit: 1 });
  const promo = liste && liste.data && liste.data[0];
  if (!promo || !promo.active) return null;
  if (promo.expires_at && promo.expires_at * 1000 <= Date.now()) return null;
  if (promo.max_redemptions && promo.times_redeemed >= promo.max_redemptions) return null;
  return decrireRemise(promo);
}

function lireRemiseActive(sessionId, stripe) {
  return lireRemiseParCode(codeRemisePourSession(sessionId), stripe);
}

module.exports = {
  COUPON_REMISE_POST_ACHAT,
  POURCENTAGE_REMISE_POST_ACHAT,
  codeRemisePourSession,
  creerRemisePostAchat,
  lireRemiseActive,
  lireRemiseParCode,
  formaterDateRemise,
};
