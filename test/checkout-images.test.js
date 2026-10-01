const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { IMAGES_PRODUITS, avecImagesProduits } = require("../api/_images-produits");

const VENDUS = Object.entries(PRODUITS).filter(([, p]) => p.prix > 0 && !p.venteSuspendue);

async function capturerCheckout(executer) {
  const stripe = require("../api/_stripe");
  const supabase = require("../api/_supabase");
  const creerOriginal = stripe.creerClientStripe;
  const selectionnerOriginal = supabase.selectionner;
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  const chemin = require.resolve("../api/create-checkout");
  const appels = [];
  stripe.creerClientStripe = () => ({ checkout: { sessions: { create: async (params, options) => {
    appels.push({ params, options });
    return { id: "cs_test_images", url: "https://checkout.stripe.com/c/pay/test" };
  } } } });
  supabase.selectionner = async () => [];
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  delete require.cache[chemin];
  const handler = require(chemin);
  const envoyer = async (body) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler({ method: "POST", body: {
      internalTest: true,
      attemptId: "images-1234567890123456",
      ...body,
    } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(body));
    return appels.at(-1).params;
  };
  try {
    await executer(envoyer, appels);
  } finally {
    stripe.creerClientStripe = creerOriginal;
    supabase.selectionner = selectionnerOriginal;
    delete require.cache[chemin];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
}

test("chaque produit payant et Portalis ont un visuel existant sur le domaine du site", () => {
  const attendus = Object.entries(PRODUITS).filter(([, p]) => p.prix > 0).map(([id]) => id).concat("portalis");
  assert.deepEqual(Object.keys(IMAGES_PRODUITS).sort(), attendus.sort());
  for (const [id, image] of Object.entries(IMAGES_PRODUITS)) {
    const url = new URL(image);
    assert.equal(url.origin, "https://trajectoiredroit.com", id);
    const fichier = path.join(__dirname, "..", decodeURIComponent(url.pathname));
    assert.ok(fs.statSync(fichier).size > 0, id);
    assert.match(url.pathname, /\.(webp|jpg|png)$/, id);
  }
});

test("l'ajout du visuel conserve tous les autres paramètres et le tableau reçu", () => {
  const params = {
    mode: "payment", metadata: { produitIds: "fiche-da-l2-s1" },
    line_items: [{ price_data: {
      currency: "eur", unit_amount: 1499,
      product_data: { name: "Fiche", description: "Description existante", metadata: { exemple: "1" } },
    }, quantity: 1 }],
    success_url: "https://trajectoiredroit.com/merci-achat.html",
  };
  const avant = structuredClone(params);
  const apres = avecImagesProduits(params);
  assert.deepEqual(apres.line_items[0].price_data.product_data.images, [IMAGES_PRODUITS["fiche-da-l2-s1"]]);
  delete apres.line_items[0].price_data.product_data.images;
  assert.deepEqual(apres, avant);
  assert.deepEqual(params, avant);
});

test("les cours et les majeures utilisent leurs propres couvertures de format", () => {
  for (const [id] of VENDUS) {
    if (id.startsWith("maj-")) assert.match(IMAGES_PRODUITS[id], /\/assets\/majeures\//, id);
    if (id.startsWith("cours-fiche-")) assert.match(IMAGES_PRODUITS[id], /\/assets\/covers\/cours-(fiche|complet)-/, id);
  }
});

test("chaque offre en vente transmet son propre visuel avec le prix et le nom du catalogue", async () => {
  await capturerCheckout(async (envoyer) => {
    for (const [id, p] of VENDUS) {
      const params = await envoyer({ produitId: id });
      const ligne = params.line_items[0];
      assert.deepEqual(ligne.price_data.product_data.images, [IMAGES_PRODUITS[id]], id);
      assert.equal(ligne.price_data.product_data.name, p.nom, id);
      assert.equal(ligne.price_data.unit_amount, p.prix, id);
      assert.equal(ligne.price_data.currency, "eur", id);
      assert.equal(ligne.quantity, 1, id);
      assert.equal(params.mode, "payment", id);
    }
  });
});

test("le panier et l'ajout d'un second produit gardent une image par article", async () => {
  await capturerCheckout(async (envoyer) => {
    const ids = ["fiche-da-l2-s1", "maj-penal-l2-s1", "flashcards-qcm-da-l2-s1", "pack-l1"];
    const panier = await envoyer({ produitIds: [...ids, ids[0]] });
    assert.equal(panier.line_items.length, ids.length);
    for (const [i, id] of ids.entries()) {
      assert.deepEqual(panier.line_items[i].price_data.product_data.images, [IMAGES_PRODUITS[id]]);
      assert.equal(panier.line_items[i].price_data.unit_amount, PRODUITS[id].prix);
    }
    const ajout = await envoyer({ produitId: "fiche-da-l2-s1", bumpId: "fiche-da-l2-s2" });
    assert.equal(ajout.line_items.length, 2);
    assert.deepEqual(ajout.line_items.map((l) => l.price_data.product_data.images), [
      [IMAGES_PRODUITS["fiche-da-l2-s1"]], [IMAGES_PRODUITS["fiche-da-l2-s2"]],
    ]);
  });
});

test("les Packs Ultra conservent leur couverture en cadeau et en deux ou trois fois", async () => {
  await capturerCheckout(async (envoyer) => {
    for (const [id, p] of VENDUS.filter(([id]) => id.startsWith("pack-ultra-"))) {
      for (const echeances of [1, 2, 3]) {
        for (const cadeau of [false, true]) {
          const params = await envoyer({
            produitId: id, echeances,
            ...(cadeau ? { cadeauEmail: "etudiant@example.com", cadeauPrenom: "Camille" } : {}),
          });
          const ligne = params.line_items[0].price_data;
          assert.deepEqual(ligne.product_data.images, [IMAGES_PRODUITS[id]], `${id}/${echeances}/${cadeau}`);
          assert.equal(ligne.unit_amount, echeances === 1 ? p.prix : Math.floor(p.prix / echeances));
          assert.equal(params.mode, echeances === 1 ? "payment" : "subscription");
          if (cadeau) assert.equal(params.metadata.cadeauEmail, "etudiant@example.com");
        }
      }
    }
  });
});

test("Portalis conserve son Price récurrent existant", async () => {
  await capturerCheckout(async (envoyer) => {
    const params = await envoyer({ mode: "subscription", supabaseUserId: "test", supabaseEmail: "eleve@example.com" });
    assert.deepEqual(params.line_items, [{ price: "price_1TqyboIJrx5ith04BGxcyg5T", quantity: 1 }]);
    assert.equal(params.mode, "subscription");
  });
});
