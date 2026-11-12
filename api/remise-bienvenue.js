// Brevo appelle cette route juste avant le dernier mail de bienvenue.
const { createHash, createHmac, timingSafeEqual } = require("node:crypto");
const { creerClientStripe } = require("./_stripe");
const { COUPON_REMISE_POST_ACHAT } = require("./_remise-post-achat");

const DUREE = 72 * 60 * 60;
const LISTE_BIENVENUE = 3;
const FORMAT_FIN = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

function authentifier(req) {
  const attendu = process.env.BREVO_BIENVENUE_EMPREINTE;
  const token = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization || "")?.[1];
  if (!token || !/^[a-f0-9]{64}$/i.test(attendu || "")) return null;
  const empreinte = createHash("sha256").update(token).digest();
  return timingSafeEqual(empreinte, Buffer.from(attendu, "hex")) ? token : null;
}

async function brevo(identifiant, options = {}) {
  const resultat = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(identifiant)}`, {
    ...options,
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!resultat.ok) throw new Error(`Brevo contacts HTTP ${resultat.status}`);
  return resultat.status === 204 ? null : resultat.json();
}

async function retrouverOuCreerCode(stripe, id, token) {
  const suffixe = createHmac("sha256", token).update(`bienvenue:${id}`).digest("hex").slice(0, 20);
  const code = `BIENVENUE-${suffixe.toUpperCase()}`;
  const chercher = async () => (await stripe.promotionCodes.list({ code, limit: 1 })).data[0];
  const existant = await chercher();
  if (existant) return existant;

  const coupon = await stripe.coupons.retrieve(COUPON_REMISE_POST_ACHAT);
  if (!coupon.valid || coupon.percent_off !== 15 || coupon.applies_to?.products?.length) {
    throw new Error("Coupon de bienvenue indisponible");
  }
  try {
    return await stripe.promotionCodes.create({
      code,
      expires_at: Math.floor(Date.now() / 1000) + DUREE,
      promotion: { type: "coupon", coupon: coupon.id },
      metadata: { campaign: "brevo-bienvenue" },
    }, { idempotencyKey: `brevo-${code}` });
  } catch (erreur) {
    // Une seconde livraison du même appel réutilise le code et sa date limite.
    const creeEntreTemps = await chercher();
    if (creeEntreTemps) return creeEntreTemps;
    throw erreur;
  }
}

module.exports = async function remiseBienvenue(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const token = authentifier(req);
  if (!token) return res.status(401).end();

  let donnees;
  try {
    donnees = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).end();
  }
  const identifiant = donnees?.contact?.id ?? donnees?.contact_id ?? donnees?.contactId
    ?? donnees?.contact?.email ?? donnees?.email ?? donnees?.id;
  if (!/^(?:[1-9][0-9]{0,14}|[^\s@/]+@[^\s@/]+\.[^\s@/]+)$/.test(String(identifiant || ""))) {
    return res.status(400).end();
  }
  try {
    const contact = await brevo(identifiant);
    if (!contact?.id || contact.emailBlacklisted || !contact.listIds?.includes(LISTE_BIENVENUE)) {
      return res.status(204).end();
    }
    const stripe = creerClientStripe(process.env.STRIPE_SECRET_KEY);
    const promo = await retrouverOuCreerCode(stripe, contact.id, token);
    const utilisable = promo.active && promo.expires_at > Math.floor(Date.now() / 1000);
    await brevo(contact.id, {
      method: "PUT",
      body: JSON.stringify({ attributes: {
        BIENVENUE_CODE: utilisable ? promo.code : "",
        BIENVENUE_FIN: utilisable ? FORMAT_FIN.format(promo.expires_at * 1000) : "",
      } }),
    });
    return res.status(204).end();
  } catch (erreur) {
    console.error("remise-bienvenue", { code: erreur.code || erreur.name });
    return res.status(502).end();
  }
};
