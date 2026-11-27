const { assurerPromotion } = require("./_parrainage");

const COUPON_ENQUETE = "tjd-enquete-supports-10";
const CAMPAGNE_ENQUETE = "enquete-supports";
const CODE_ENQUETE = /^ENQUETE-[A-F0-9]{18}$/i;

async function assurerCoupon(stripe) {
  let coupon;
  try {
    coupon = await stripe.coupons.retrieve(COUPON_ENQUETE);
  } catch (erreur) {
    if (erreur.code !== "resource_missing") throw erreur;
    try {
      coupon = await stripe.coupons.create({
        id: COUPON_ENQUETE,
        name: "Enquête Trajectoire Droit",
        percent_off: 10,
        duration: "once",
      }, { idempotencyKey: COUPON_ENQUETE });
    } catch (creation) {
      coupon = await stripe.coupons.retrieve(COUPON_ENQUETE).catch(() => { throw creation; });
    }
  }
  if (!coupon.valid || coupon.percent_off !== 10 || coupon.duration !== "once"
      || coupon.redeem_by || coupon.max_redemptions || coupon.applies_to?.products?.length) {
    throw new Error("Paramètres du coupon d’enquête incorrects");
  }
  return coupon;
}

async function creerRemiseEnquete(stripe, { id, code }) {
  const coupon = await assurerCoupon(stripe);
  const promotion = await assurerPromotion(stripe, {
    code,
    coupon: coupon.id,
    maxRedemptions: 1,
    metadata: { programme: CAMPAGNE_ENQUETE, reponse_id: id },
  });
  if (promotion.max_redemptions !== 1) throw new Error("Limite du code d’enquête incorrecte");
  return {
    code: promotion.code,
    dejaUtilise: promotion.active === false || promotion.times_redeemed >= 1,
  };
}

function estCodeEnquete(code) {
  return typeof code === "string" && CODE_ENQUETE.test(code);
}

async function lirePromotionEnquete(stripe, code) {
  if (!estCodeEnquete(code)) return null;
  const { data } = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
  const promo = data[0];
  if (promo?.metadata?.programme !== CAMPAGNE_ENQUETE || promo.max_redemptions !== 1
      || promo.promotion?.coupon !== COUPON_ENQUETE || promo.times_redeemed >= 1) return null;
  return promo;
}

module.exports = { creerRemiseEnquete, estCodeEnquete, lirePromotionEnquete };
