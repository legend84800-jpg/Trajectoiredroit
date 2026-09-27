const test = require("node:test");
const assert = require("node:assert/strict");
const PRODUITS = require("../api/_produits");
const { PACKS } = require("../api/_packs-citations");
const { construireLiensTelechargement } = require("../api/_liens-telechargement");

test("chaque pack de citations facture le bon prix et livre ses fiches", () => {
  for (const pack of PACKS) {
    const produit = PRODUITS[pack.id];
    const urlsAttendues = pack.fiches.map((id) => PRODUITS[id].blobs[0]);
    assert.equal(produit.prix, pack.prix);
    assert.deepEqual(produit.blobs, urlsAttendues);
    assert.equal(new Set(produit.blobs).size, pack.fiches.length);

    const liens = construireLiensTelechargement(
      pack.id, produit, "secret-de-test", "https://trajectoiredroit.com", 3600,
      { sessionId: "cs_test_citations" }
    );
    assert.equal(liens.length, pack.fiches.length);
    for (let i = 0; i < liens.length; i++) {
      assert.equal(liens[i].nom, PRODUITS[pack.fiches[i]].nom);
      assert.equal(liens[i].type, "pdf");
      assert.match(liens[i].url, new RegExp(`id=${pack.id}&b=${i}&`));
    }
  }
  assert.deepEqual(PACKS.map(({ id, prix, fiches }) => [id, prix, fiches.length]), [
    ["pack-citations-l1", 4500, 6],
    ["pack-citations-l2", 4900, 7],
    ["pack-citations-l3", 3000, 4],
  ]);
  assert.equal(PACKS.some((pack) => pack.fiches.includes("citations-ue")), false);
  assert.equal(PACKS.some((pack) => pack.fiches.includes("citations-libertes-fondamentales")), false);
});

test("Stripe Checkout reçoit le prix exact de chaque pack", async () => {
  const stripeModule = require("../api/_stripe");
  const creerOriginal = stripeModule.creerClientStripe;
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  const appels = [];
  stripeModule.creerClientStripe = () => ({
    checkout: { sessions: { create: async (params) => {
      appels.push(params);
      return { id: "cs_test_pack_citations", url: "https://checkout.stripe.com/c/pay/test" };
    } } },
  });
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const cheminHandler = require.resolve("../api/create-checkout");
  delete require.cache[cheminHandler];
  const handler = require("../api/create-checkout");

  try {
    for (const pack of PACKS) {
      const res = {
        statusCode: 200,
        setHeader() {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
      };
      await handler({ method: "POST", body: {
        produitId: pack.id,
        attemptId: `pack-citations-test-${pack.id}`,
        pageActuelle: "revisions.html#citations",
      } }, res);
      assert.equal(res.statusCode, 200);
      const checkout = appels.at(-1);
      assert.equal(checkout.line_items[0].price_data.unit_amount, pack.prix);
      assert.equal(checkout.line_items[0].price_data.currency, "eur");
      assert.equal(checkout.metadata.produitIds, pack.id);
    }
  } finally {
    stripeModule.creerClientStripe = creerOriginal;
    delete require.cache[cheminHandler];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
});
