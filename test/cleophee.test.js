const test = require("node:test");
const assert = require("node:assert/strict");
const { lireCadeauEleve, codeCadeauEleve, PRODUITS_STRIPE_CADEAUX } = require("../api/_cadeau-eleve");

const PROMO = { id: "promo_cleophee_test", code: "CLEOPHEE", active: true, max_redemptions: 1, times_redeemed: 0 };

test("Cléophée peut choisir un seul produit jusqu'à 20 euros", () => {
  for (const prix of [0, 999, 1499, 1999, 2000]) {
    assert.equal(lireCadeauEleve({ code: " cleophee ", produitId: "fiche" }, { fiche: { prix } }).code, "CLEOPHEE");
  }
  const produits = { a: { prix: 999 }, b: { prix: 999 }, grand: { prix: 2001 }, suspendu: { prix: 1499, venteSuspendue: true } };
  for (const choix of [
    { produitId: "grand" }, { produitId: "inconnu" }, { produitId: "suspendu" },
    { produitIds: ["a", "b"] }, { produitId: "a", bumpId: "b" },
    { produitId: "a", mode: "subscription" }, { produitId: "a", echeances: 2 },
    { produitId: "a", type: "portalis_recharge" },
  ]) assert.equal(lireCadeauEleve({ code: "CLEOPHEE", ...choix }, produits).code, "cadeau_ineligible");
  for (const code of ["POSTA-12345678", "constructor", "__proto__", null]) assert.equal(codeCadeauEleve(code), "");
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
      return { id: "cs_test_cleophee", url: "https://checkout.stripe.com/test" };
    } } },
  });
  const chemin = require.resolve("../api/create-checkout");
  delete require.cache[chemin];
  const handler = require("../api/create-checkout");
  const cle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const creer = async (body) => {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
    await handler({ method: "POST", body: { code: "CLEOPHEE", attemptId: "cleophee-test-20261028", ...body } }, res);
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

test("le code de Cléophée applique son propre coupon et garde le vrai produit pour la livraison", async () => {
  await avecStripe(async ({ creer, creations, recherches }) => {
    for (const choix of [{ produitId: "fiche-da-l2-s1" }, { produitIds: ["fiche-da-l2-s1"] }]) {
      assert.equal((await creer(choix)).statusCode, 200);
    }
    for (const params of creations) {
      assert.equal(params.line_items.length, 1);
      assert.equal(params.line_items[0].price_data.product, PRODUITS_STRIPE_CADEAUX.CLEOPHEE);
      assert.equal(params.line_items[0].price_data.unit_amount, 1499);
      assert.deepEqual(params.discounts, [{ promotion_code: PROMO.id }]);
      assert.equal(params.metadata.produitIds, "fiche-da-l2-s1");
      assert.equal(params.metadata.codePromoLien, "CLEOPHEE");
      assert.equal(params.allow_promotion_codes, undefined);
    }
    assert.deepEqual(recherches.map(r => r.code), ["CLEOPHEE", "CLEOPHEE"]);
  });
});

for (const [nom, promo] of [
  ["absent", null], ["utilisé", { ...PROMO, times_redeemed: 1 }],
  ["inactif", { ...PROMO, active: false }], ["expiré", { ...PROMO, expires_at: 1 }],
]) test(`un cadeau ${nom} refuse de créer une commande payante`, async () => {
  await avecStripe(async ({ creer, creations }) => {
    assert.equal((await creer({ produitId: "fiche-da-l2-s1" })).statusCode, 400);
    assert.equal(creations.length, 0);
  }, { promo });
});

test("si le cadeau est utilisé entre la vérification et la création, aucun paiement sans remise n'est proposé", async () => {
  await avecStripe(async ({ creer, creations }) => {
    assert.equal((await creer({ produitId: "fiche-da-l2-s1" })).statusCode, 502);
    assert.equal(creations.length, 1);
  }, { erreurCreation: { type: "StripeInvalidRequestError", code: "promotion_code_max_redemptions_exceeded" } });
});
