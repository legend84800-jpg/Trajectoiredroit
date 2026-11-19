const assert = require("node:assert/strict");
const { test } = require("node:test");
const PRODUITS = require("../api/_produits");
const { donneesPage } = require("../api/_kits-partiels");
const { bornerAbonnement } = require("../api/_echeances");

const kitId = "pack-kit-partiels-l2--administratif-s1--contrats--penal";
const config = "./../api/_stripe";
const stripePath = require.resolve(config);
const checkoutParams = [];
const fakeStripe = {
  checkout: { sessions: { create: async (params) => {
    checkoutParams.push(params);
    return { id: "cs_modele_kit", url: "https://stripe.example/test" };
  } } },
};
const originalStripe = require(config);
require.cache[stripePath].exports = { ...originalStripe, creerClientStripe: () => fakeStripe };
const checkout = require("../api/create-checkout");
require.cache[stripePath].exports = originalStripe;

// Le client Stripe est remplacé avant le chargement de la route.
process.env.STRIPE_SECRET_KEY = "specification-local-uniquement";
async function ouvrir(payload) {
  const result = {
    statusCode: null,
    content: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(data) { this.content = data; },
  };
  await checkout({ method: "POST", body: payload, headers: {} }, result);
  return result;
}

test("les trios autorisés livrent les fichiers de chacun des supports", () => {
  const catalogue = donneesPage(PRODUITS);
  assert.deepEqual(Object.values(catalogue.niveaux).map((liste) => liste.length), [6, 6, 4]);
  for (const m of Object.values(catalogue.niveaux).flat()) assert.equal(m.prixSepare, 4997);
  const references = Object.entries(PRODUITS).filter(([cle]) => cle.startsWith("pack-kit-partiels-"));
  assert.equal(references.length, 36);
  for (const [id, produit] of references) {
    assert.equal(produit.prix, 6900, id);
    assert.ok(produit.blobs.length >= 21, id);
    assert.equal(produit.blobs.length, new Set(produit.blobs).size, id);
  }
  assert.ok(!PRODUITS["pack-kit-partiels-l2--administratif-s1--administratif-s2--contrats"]);
});

test("le paiement unique et les deux échéances portent sur le même kit", async () => {
  assert.equal((await ouvrir({ produitId: kitId })).statusCode, 200);
  assert.equal((await ouvrir({ produitId: kitId, echeances: 2 })).statusCode, 200);
  const [comptant, echelonne] = checkoutParams;
  assert.equal(comptant.mode, "payment");
  assert.equal(comptant.line_items[0].price_data.unit_amount, 6900);
  assert.equal(comptant.metadata.produitIds, kitId);
  assert.equal(echelonne.mode, "subscription");
  assert.equal(echelonne.line_items[0].price_data.unit_amount, 3450);
  assert.match(echelonne.line_items[0].price_data.product_data.name, /2 paiements sur 2 mois$/);
  assert.match(echelonne.line_items[0].price_data.product_data.description, /^2 paiements sur 2 mois\. Le prix total est de 69,00 €/);
  assert.match(echelonne.custom_text.submit.message, /34,50 € aujourd’hui puis 34,50 € dans un mois, soit 69,00 € au total\. Les paiements s’arrêtent donc automatiquement après le deuxième\./);
  assert.equal(echelonne.metadata.echeances, "2");
  assert.equal(echelonne.metadata.montantTotal, "6900");
  assert.equal(echelonne.metadata.produitIds, kitId);
  assert.equal(echelonne.allow_promotion_codes, false);
  const result = await ouvrir({ produitId: kitId, echeances: 3 });
  assert.equal(result.statusCode, 400);
  assert.equal(result.content.code, "echeances_indisponibles");
  assert.equal(checkoutParams.length, 2);
});

test("le rejeu borne une échéance créée avant une erreur de mise à jour", async () => {
  let schedule = null;
  let tentatives = 0;
  let creations = 0;
  const stripe = {
    subscriptions: { retrieve: async () => ({ schedule: schedule?.id ?? null }) },
    subscriptionSchedules: {
      retrieve: async () => schedule,
      create: async () => {
        creations += 1;
        schedule = {
          id: "sched",
          end_behavior: "release",
          phases: [{ start_date: 1790000000, items: [{ price: "prix", quantity: 1 }] }],
        };
        return schedule;
      },
      update: async (id, data) => {
        tentatives += 1;
        if (tentatives === 1) throw new Error("API temporairement indisponible");
        schedule = { ...schedule, ...data, id };
      },
    },
  };
  await assert.rejects(bornerAbonnement(stripe, "sub", 2));
  assert.deepEqual(await bornerAbonnement(stripe, "sub", 2), { borne: true });
  assert.deepEqual(await bornerAbonnement(stripe, "sub", 2), { dejaBorne: true });
  assert.equal(creations, 1);
  assert.equal(tentatives, 2);
  assert.equal(schedule.end_behavior, "cancel");
  assert.deepEqual(schedule.phases[0].duration, { interval: "month", interval_count: 2 });
});
