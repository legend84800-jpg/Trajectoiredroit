const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { MATIERES } = require("../scripts/mapping-matieres");

test("les quatorze packs matière affichent et facturent 29,98 €", () => {
  const ids = Object.keys(PRODUITS).filter((id) => id.startsWith("pack-matiere-"));
  assert.equal(ids.length, 14);
  for (const id of ids) assert.equal(PRODUITS[id].prix, 2998, id);

  const pages = Object.entries(MATIERES).filter(([, matiere]) => matiere.packMatiere);
  assert.equal(pages.length, 14);
  for (const [slug, matiere] of pages) {
    assert.equal(PRODUITS[matiere.packMatiere.id].prix, 2998, slug);
    assert.equal(matiere.packMatiere.prix, "29,98 €", slug);
    const html = fs.readFileSync(path.join(__dirname, "..", `${slug}.html`), "utf8");
    assert.match(html, new RegExp(`data-tjd-produit="${matiere.packMatiere.id}"[^>]*>Acheter le pack · 29,98 €`), slug);
  }
});

test("Stripe Checkout reçoit 2998 centimes pour chaque pack matière", async () => {
  const stripeModule = require("../api/_stripe");
  const creerOriginal = stripeModule.creerClientStripe;
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  const appels = [];
  stripeModule.creerClientStripe = () => ({
    checkout: { sessions: { create: async (params) => {
      appels.push(params);
      return { id: "cs_test_pack_matiere", url: "https://checkout.stripe.com/c/pay/test" };
    } } },
  });
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const cheminHandler = require.resolve("../api/create-checkout");
  delete require.cache[cheminHandler];
  const handler = require("../api/create-checkout");

  try {
    for (const id of Object.keys(PRODUITS).filter((cle) => cle.startsWith("pack-matiere-"))) {
      const res = {
        statusCode: 200,
        setHeader() {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
      };
      await handler({ method: "POST", body: {
        produitId: id,
        attemptId: `test-${id}`,
        pageActuelle: "formations.html",
      } }, res);
      assert.equal(res.statusCode, 200, id);
      assert.equal(appels.at(-1).line_items[0].price_data.unit_amount, 2998, id);
    }
  } finally {
    stripeModule.creerClientStripe = creerOriginal;
    delete require.cache[cheminHandler];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
});
