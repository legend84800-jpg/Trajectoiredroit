const assert = require("node:assert/strict");
const { test } = require("node:test");
const PRODUITS = require("../api/_produits");
const { donneesPage } = require("../api/_kits-partiels");
const { bornerAbonnement } = require("../api/_echeances");
const { genererToken } = require("../api/_liens-telechargement");
const { traiterAchatPaye } = require("../api/stripe-webhook")._test;

const kitId = "pack-kit-partiels-l2--administratif-s1--administratif-s2--contrats";
const fichiersAttendus = [...new Set([
  "fiche-da-l2-s1", "maj-da-l2-s1", "flashcards-qcm-da-l2-s1",
  "fiche-da-l2-s2", "maj-da-l2-s2", "flashcards-qcm-da-l2-s2",
  "fiche-contrats-l2-s1", "maj-contrats-l2-s1", "flashcards-qcm-contrats-l2-s1",
].flatMap((id) => PRODUITS[id].blobs))];
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
  assert.deepEqual(Object.values(catalogue.niveaux).map((liste) => liste.length), [6, 7, 4]);
  for (const m of Object.values(catalogue.niveaux).flat()) assert.equal(m.prixSepare, 4997);
  const references = Object.entries(PRODUITS).filter(([cle]) => cle.startsWith("pack-kit-partiels-"));
  assert.deepEqual(["l1", "l2", "l3"].map((niveau) =>
    references.filter(([id]) => id.startsWith(`pack-kit-partiels-${niveau}--`)).length
  ), [20, 35, 4]);
  for (const [id, produit] of references) {
    assert.equal(produit.prix, 6900, id);
    assert.ok(produit.blobs.length >= 21, id);
    assert.equal(produit.blobs.length, new Set(produit.blobs).size, id);
  }
  const droitAdministratif = PRODUITS[kitId];
  assert.match(droitAdministratif.nom, /Droit administratif \(S1\)/);
  assert.match(droitAdministratif.nom, /Droit administratif \(S2\)/);
  assert.deepEqual(new Set(droitAdministratif.blobs), new Set(fichiersAttendus));
  const droitConstitutionnel = PRODUITS["pack-kit-partiels-l1--constitutionnel-s1--constitutionnel-s2--intro-droit"];
  assert.match(droitConstitutionnel.nom, /Droit constitutionnel \(S1\)/);
  assert.match(droitConstitutionnel.nom, /Droit constitutionnel \(S2\)/);
  const penalGeneral = PRODUITS["pack-kit-partiels-l2--administratif-s2--contrats--penal-general-s2"];
  assert.match(penalGeneral.nom, /Droit pénal général \(S2\)/);
  for (const id of ["fiche-penal-general-l1", "maj-penal-l2-s2", "flashcards-qcm-penal-general-l1"]) {
    assert.ok(PRODUITS[id].blobs.every((fichier) => penalGeneral.blobs.includes(fichier)), id);
  }
});

test("le paiement unique et les deux échéances portent sur le kit des deux semestres", async () => {
  const debut = checkoutParams.length;
  assert.equal((await ouvrir({ produitId: kitId })).statusCode, 200);
  assert.equal((await ouvrir({ produitId: kitId, echeances: 2 })).statusCode, 200);
  const [comptant, echelonne] = checkoutParams.slice(debut);
  assert.equal(comptant.mode, "payment");
  assert.equal(comptant.line_items[0].price_data.unit_amount, 6900);
  assert.equal(comptant.metadata.produitIds, kitId);
  assert.equal(echelonne.mode, "subscription");
  assert.equal(echelonne.line_items[0].price_data.unit_amount, 3450);
  assert.match(echelonne.line_items[0].price_data.product_data.name, /2 paiements sur 2 mois$/);
  assert.match(echelonne.line_items[0].price_data.product_data.description, /^2 paiements sur 2 mois\. Le prix total est de 69,00 €/);
  assert.match(echelonne.custom_text.submit.message, /^2 paiements sur \*\*2 mois\*\*\./);
  assert.match(echelonne.custom_text.submit.message, /34,50 € aujourd’hui puis 34,50 € dans un mois, soit 69,00 € au total\. Les paiements s’arrêtent donc automatiquement après le deuxième\./);
  assert.equal(echelonne.metadata.echeances, "2");
  assert.equal(echelonne.metadata.montantTotal, "6900");
  assert.equal(echelonne.metadata.produitIds, kitId);
  assert.equal(echelonne.allow_promotion_codes, false);
  const result = await ouvrir({ produitId: kitId, echeances: 3 });
  assert.equal(result.statusCode, 400);
  assert.equal(result.content.code, "echeances_indisponibles");
  assert.equal(checkoutParams.length, debut + 2);
});

test("le paiement refuse les kits avec un code répété, une année non valide ou un nombre de choix incorrect", async () => {
  const debut = checkoutParams.length;
  for (const id of [
    "pack-kit-partiels-l2--administratif-s1--administratif-s1--contrats",
    "pack-kit-partiels-l1--administratif-s1--administratif-s2--contrats",
    "pack-kit-partiels-l4--administratif-s1--administratif-s2--contrats",
    "pack-kit-partiels-l2--administratif-s1--administratif-s2",
    "pack-kit-partiels-l2--administratif-s1--administratif-s2--contrats--penal",
  ]) {
    const reponse = await ouvrir({ produitId: id });
    assert.equal(reponse.statusCode, 400, id);
    assert.equal(reponse.content.code, "produit_inconnu", id);
  }
  assert.equal(checkoutParams.length, debut);
});

test("la confirmation de commande livre les fichiers des deux semestres et de la troisième matière", async () => {
  assert.equal((await ouvrir({ produitId: kitId })).statusCode, 200);
  const { metadata, mode } = checkoutParams.at(-1);
  const secret = "verification-des-liens-en-local";
  const sessionId = "cs_test_kit_deux_semestres";
  const livraisons = [];
  const session = {
    id: sessionId,
    mode,
    metadata,
    payment_status: "paid",
    amount_total: 6900,
    livemode: false,
    customer_details: { email: "client@example.com" },
  };
  const operations = {
    insererSiAbsent: async (_table, achat) => {
      assert.deepEqual(achat.produit_ids, [kitId]);
      return [{ id: 1 }];
    },
    envoyerEmail: async (_email, produits, liens) => livraisons.push({ produits, liens }),
    creerContactBrevoAchat: async () => {},
  };
  const resultat = await traiterAchatPaye(session, {
    operations,
    downloadSecret: secret,
    origin: "https://trajectoiredroit.com",
  });

  assert.deepEqual(resultat, { traite: true });
  assert.equal(livraisons.length, 1);
  const { produits, liens } = livraisons[0];
  assert.deepEqual(produits, [PRODUITS[kitId]]);
  const fichiersLivres = liens.map(({ url }) => {
    const lien = new URL(url);
    const index = lien.searchParams.get("b");
    const expiration = lien.searchParams.get("exp");
    assert.equal(lien.pathname, "/api/telecharger");
    assert.equal(lien.searchParams.get("id"), kitId);
    assert.equal(lien.searchParams.get("sid"), sessionId);
    assert.equal(lien.searchParams.get("sig"), genererToken(kitId, index, expiration, secret, sessionId));
    return PRODUITS[kitId].blobs[index];
  });
  assert.equal(fichiersLivres.length, fichiersAttendus.length);
  assert.deepEqual(new Set(fichiersLivres), new Set(fichiersAttendus));
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
