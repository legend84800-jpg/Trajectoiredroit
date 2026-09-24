const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { DEFINITIONS, referencesPour } = require("../api/_packs-ultra");
const { construireLiensTelechargement } = require("../api/_liens-telechargement");

test("chaque Pack Ultra contient exactement les références de son semestre", () => {
  for (const [id, definition] of Object.entries(DEFINITIONS)) {
    const references = referencesPour(id, PRODUITS);
    assert.equal(references.length, definition.attendus, id);
    assert.equal(new Set(references).size, references.length, id);
    for (const reference of references) assert.ok(PRODUITS[reference], reference);

    if (definition.prix === null) {
      assert.equal(PRODUITS[id], undefined, "un prix ambigu ne doit pas permettre un paiement");
      continue;
    }
    const pack = PRODUITS[id];
    assert.equal(pack.prix, definition.prix);
    assert.deepEqual(pack.inclus, references);
    assert.equal(pack.blobs.length, pack.blobsMeta.length);
    assert.equal(pack.blobs.length, references.reduce((n, reference) => n + PRODUITS[reference].blobs.length, 0));
  }
});

test("les fichiers du pack conservent le nom de chaque ressource et un lien signé", () => {
  const id = "pack-ultra-l1-s1";
  const pack = PRODUITS[id];
  const liens = construireLiensTelechargement(id, pack, "secret-de-test", "https://trajectoiredroit.com", 900, { sessionId: "cs_test_pack" });
  assert.equal(liens.length, pack.blobs.length);
  assert.match(liens[0].nom, /Droit constitutionnel L1 S1/);
  assert.equal(liens[0].groupe, pack.blobsMeta[0].nom);
  assert.match(liens.at(-1).url, /id=pack-ultra-l1-s1/);
  assert.match(liens.at(-1).url, /sid=cs_test_pack/);
});

test("la page d'accueil montre la couverture et le contenu exact de chaque semestre", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.match(html, /dès 199 €<\/span>\s*<span class="pricing__period">achat unique<\/span>/);
  for (const id of Object.keys(DEFINITIONS)) {
    const suffixe = id.replace("pack-ultra-", "");
    assert.ok(html.includes(`assets/covers/pack-ultra-${suffixe}.webp`), id);
    const carte = html.split(`<article class="ultra-card" id="${id}">`)[1]?.split("</article>")[0];
    assert.ok(carte, id);
    const debut = `<details class="ultra-inclusions__item" id="pack-ultra-detail-${suffixe}">`;
    const bloc = html.split(debut)[1]?.split("</details>")[0];
    assert.ok(bloc, id);
    assert.equal((bloc.match(/<li>/g) || []).length, DEFINITIONS[id].attendus, id);
    assert.equal(html.includes(`data-tjd-produit="${id}"`), DEFINITIONS[id].prix !== null, id);
    if (DEFINITIONS[id].prix !== null) {
      const prixAffiche = `${DEFINITIONS[id].prix / 100} €`;
      assert.ok(carte.includes(`class="ultra-card__price">${prixAffiche}</span>`), id);
      assert.ok(bloc.includes(`<span>${prixAffiche}</span>`), id);
    }
  }
});

test("Checkout facture le prix du Pack Ultra et conserve son identifiant", async () => {
  const stripeModule = require("../api/_stripe");
  const original = stripeModule.creerClientStripe;
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  const appels = [];
  stripeModule.creerClientStripe = () => ({
    checkout: { sessions: { create: async (params) => {
      appels.push(params);
      return { id: "cs_test_ultra", url: "https://checkout.stripe.com/c/pay/test" };
    } } },
  });
  const chemin = require.resolve("../api/create-checkout");
  delete require.cache[chemin];
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const handler = require("../api/create-checkout");
  const res = {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; },
  };
  try {
    await handler({ method: "POST", body: { produitId: "pack-ultra-l1-s1" } }, res);
    await handler({ method: "POST", body: { produitId: "pack-ultra-l2-s2" } }, res);
    await handler({ method: "POST", body: { produitId: "pack-ultra-l3-s2" } }, res);
  } finally {
    stripeModule.creerClientStripe = original;
    delete require.cache[chemin];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
  assert.equal(res.statusCode, 200);
  assert.equal(appels.length, 3);
  assert.equal(appels[0].line_items[0].price_data.unit_amount, 23900);
  assert.equal(appels[0].metadata.produitIds, "pack-ultra-l1-s1");
  assert.equal(appels[1].line_items[0].price_data.unit_amount, 20900);
  assert.equal(appels[1].metadata.produitIds, "pack-ultra-l2-s2");
  assert.equal(appels[2].line_items[0].price_data.unit_amount, 19900);
  assert.equal(appels[2].metadata.produitIds, "pack-ultra-l3-s2");
});

test("le webhook livre le pack par l'espace client sans envoyer 67 liens dans l'email", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  let emailEnvoye = null;
  const operations = {
    insererSiAbsent: async () => [{ id: 1 }],
    supprimer: async () => [],
    envoyerEmail: async (_email, produits, liens) => { emailEnvoye = { produits, liens }; },
    envoyerAchatMeta: async () => {},
    creerRemisePostAchat: async () => null,
    creerContactBrevoAchat: async () => ({ estNouveau: true }),
    reinscrireAcheteurBrevo: async () => {},
    annulerRelancePlanifiee: async () => {},
  };
  const session = {
    id: "cs_test_pack_ultra",
    mode: "payment",
    payment_status: "paid",
    amount_total: 23900,
    metadata: { produitIds: "pack-ultra-l1-s1", source: "test_interne", internalTest: "1" },
    customer_details: { email: "client@example.com" },
    consent: { promotions: "opt_out" },
    discounts: [],
  };
  await traiterAchatPaye(session, {
    operations,
    stripe: {},
    brevoKey: "brevo_test",
    downloadSecret: "secret_test",
    origin: "https://trajectoiredroit.com",
  });
  assert.ok(emailEnvoye);
  assert.equal(emailEnvoye.produits[0].nom, "Le Pack Ultra L1 semestre 1");
  assert.deepEqual(emailEnvoye.liens, []);
});
