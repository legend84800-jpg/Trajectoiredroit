const test = require("node:test");
const assert = require("node:assert/strict");
const { lireCadeauMathilde, PRODUIT_STRIPE_MATHILDE } = require("../api/_cadeau-mathilde");
const { commandeGratuiteConfirmee } = require("../api/_commande-confirmee");

const PROMO = { id: "promo_mathilde_test", code: "MATHILDE", active: true, max_redemptions: 2, times_redeemed: 0 };

test("Mathilde peut choisir un produit dont le prix va de zéro à 20 euros inclus", () => {
  for (const prix of [0, 999, 1499, 1999, 2000]) {
    assert.equal(lireCadeauMathilde({ code: " mathilde ", produitId: "fiche" }, { fiche: { prix } }).id, "fiche");
  }
  assert.equal(lireCadeauMathilde({ code: "POSTA-12345678" }, {}), null);
});

test("le cadeau refuse les prix plus élevés et plusieurs produits même s'ils coûtent moins de 20 euros ensemble", () => {
  const produits = { a: { prix: 999 }, b: { prix: 999 }, grand: { prix: 2001 }, suspendu: { prix: 1499, venteSuspendue: true } };
  for (const choix of [
    { produitId: "grand" }, { produitId: "inconnu" }, { produitId: "suspendu" },
    { produitIds: ["a", "b"] }, { produitId: "a", bumpId: "b" },
    { produitId: "a", mode: "subscription" }, { produitId: "a", echeances: 2 },
    { type: "portalis_recharge", produitId: "a" },
  ]) assert.equal(lireCadeauMathilde({ code: "MATHILDE", ...choix }, produits).code, "cadeau_ineligible");
});

async function avecStripe(operation, { promo = PROMO, erreurCreation = null } = {}) {
  const moduleStripe = require("../api/_stripe");
  const original = moduleStripe.creerClientStripe;
  const creations = [];
  const recherches = [];
  moduleStripe.creerClientStripe = () => ({
    promotionCodes: { list: async (params) => { recherches.push(params); return { data: promo ? [promo] : [] }; } },
    checkout: { sessions: { create: async (params) => {
      creations.push(params);
      if (erreurCreation) throw erreurCreation;
      return { id: "cs_test_mathilde", url: "https://checkout.stripe.com/test" };
    } } },
  });
  const chemin = require.resolve("../api/create-checkout");
  delete require.cache[chemin];
  const handler = require("../api/create-checkout");
  const cle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const creer = async (body) => {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
    await handler({ method: "POST", body: { code: "MATHILDE", attemptId: "mathilde-test-20261027", ...body } }, res);
    return res;
  };
  try { await operation({ creer, creations, recherches }); }
  finally {
    moduleStripe.creerClientStripe = original;
    delete require.cache[chemin];
    if (cle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = cle;
  }
}

test("l'achat gratuit garde le produit réel pour la livraison et utilise le seul produit autorisé par le coupon Stripe", async () => {
  await avecStripe(async ({ creer, creations, recherches }) => {
    assert.equal((await creer({ produitId: "fiche-da-l2-s1" })).statusCode, 200);
    const params = creations[0];
    assert.equal(params.line_items.length, 1);
    assert.equal(params.line_items[0].price_data.product, PRODUIT_STRIPE_MATHILDE);
    assert.equal(params.line_items[0].price_data.product_data, undefined);
    assert.equal(params.line_items[0].price_data.unit_amount, 1499);
    assert.deepEqual(params.discounts, [{ promotion_code: PROMO.id }]);
    assert.equal(params.allow_promotion_codes, undefined);
    assert.equal(params.after_expiration.recovery.allow_promotion_codes, undefined);
    assert.equal(params.metadata.produitIds, "fiche-da-l2-s1");
    assert.match(params.custom_text.submit.message, /Fiche complète Droit administratif L2 S1/);
    assert.equal(recherches.length, 1);
  });
});

test("un panier d'un seul cours à 19,99 euros peut utiliser le cadeau", async () => {
  const produits = require("../api/_produits");
  const cours = Object.keys(produits).find((id) => produits[id].prix === 1999 && !produits[id].venteSuspendue);
  assert.ok(cours);
  await avecStripe(async ({ creer, creations }) => {
    assert.equal((await creer({ produitIds: [cours] })).statusCode, 200);
    assert.equal(creations[0].line_items[0].price_data.unit_amount, 1999);
    assert.deepEqual(creations[0].discounts, [{ promotion_code: PROMO.id }]);
  });
});

for (const [nom, promo] of [
  ["absent", null], ["épuisé", { ...PROMO, times_redeemed: 2 }],
  ["inactif", { ...PROMO, active: false }], ["expiré", { ...PROMO, expires_at: 1 }],
]) test(`le code ${nom} refuse l'achat avant la création de Checkout`, async () => {
  await avecStripe(async ({ creer, creations }) => {
    assert.equal((await creer({ produitId: "fiche-da-l2-s1" })).statusCode, 400);
    assert.equal(creations.length, 0);
  }, { promo });
});

test("si Stripe refuse la dernière utilisation entre la recherche et la création, aucun paiement sans remise n'est proposé", async () => {
  await avecStripe(async ({ creer, creations }) => {
    assert.equal((await creer({ produitId: "fiche-da-l2-s1" })).statusCode, 502);
    assert.equal(creations.length, 1);
  }, { erreurCreation: { type: "StripeInvalidRequestError", code: "promotion_code_max_redemptions_exceeded" } });
});

test("la livraison gratuite exige une session terminée, à zéro euro et sans paiement requis", () => {
  const session = { mode: "payment", status: "complete", payment_status: "no_payment_required", amount_total: 0 };
  assert.equal(commandeGratuiteConfirmee(session), true);
  for (const modification of [
    { status: "open" }, { amount_total: 1499 }, { amount_total: null },
    { payment_status: "unpaid" }, { mode: "subscription" },
  ]) assert.equal(commandeGratuiteConfirmee({ ...session, ...modification }), false);
});

test("la page de confirmation accepte l'achat gratuit et indique zéro euro", async () => {
  const moduleStripe = require("../api/_stripe");
  const original = moduleStripe.creerClientStripe;
  moduleStripe.creerClientStripe = () => ({ checkout: { sessions: { retrieve: async () => ({
    id: "cs_test_MathildeConfirmation", livemode: false, mode: "payment", status: "complete",
    payment_status: "no_payment_required", amount_total: 0, currency: "eur",
    metadata: { produitIds: "fiche-da-l2-s1" },
  }) } } });
  const chemin = require.resolve("../api/session-info");
  delete require.cache[chemin];
  const handler = require("../api/session-info");
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.payload = value; } };
  try {
    await handler({ method: "GET", query: { session_id: "cs_test_MathildeConfirmation" } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.payload.montant, 0);
    assert.deepEqual(res.payload.produitIds, ["fiche-da-l2-s1"]);
    assert.equal(res.payload.remise, null);
  } finally {
    moduleStripe.creerClientStripe = original;
    delete require.cache[chemin];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
});
