const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { DEFINITIONS, referencesPour } = require("../api/_packs-ultra");
const { construireLiensTelechargement } = require("../api/_liens-telechargement");
const { MATIERES, classerRessource } = require("../assets/js/pack-ultra-inclusions");

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
    assert.equal(pack.venteSuspendue === true, definition.venteSuspendue === true);
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

test("la page d'accueil montre seulement les cinq packs en vente et leurs ressources", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.match(html, /dès 199 €<\/span>\s*<span class="pricing__period">achat unique<\/span>/);
  assert.match(html, /Cinq packs, de la L1 à la L3/);
  assert.equal((html.match(/<article class="ultra-card"/g) || []).length, 5);
  assert.equal((html.match(/<details class="ultra-inclusions__item"/g) || []).length, 5);
  assert.match(html, /assets\/js\/pack-ultra-inclusions\.js\?v=/);
  assert.match(html, /Économies calculées par rapport à l’achat séparé des ressources incluses/);
  for (const id of Object.keys(DEFINITIONS)) {
    const suffixe = id.replace("pack-ultra-", "");
    if (DEFINITIONS[id].venteSuspendue) {
      assert.ok(!html.includes(`id="${id}"`), id);
      assert.ok(!html.includes(`pack-ultra-detail-${suffixe}`), id);
      assert.ok(!html.includes(`data-tjd-produit="${id}"`), id);
      continue;
    }
    assert.ok(html.includes(`assets/covers/pack-ultra-${suffixe}.webp`), id);
    const carte = html.split(`<article class="ultra-card" id="${id}">`)[1]?.split("</article>")[0];
    assert.ok(carte, id);
    const debut = `<details class="ultra-inclusions__item" id="pack-ultra-detail-${suffixe}">`;
    const bloc = html.split(debut)[1]?.split("</details>")[0];
    assert.ok(bloc, id);
    assert.equal((bloc.match(/<li class="ultra-resource ultra-resource--/g) || []).length, DEFINITIONS[id].attendus, id);
    assert.equal((bloc.match(/<span class="ultra-resource__type">/g) || []).length, DEFINITIONS[id].attendus, id);
    assert.equal(html.includes(`data-tjd-produit="${id}"`), DEFINITIONS[id].prix !== null, id);
    if (DEFINITIONS[id].prix !== null) {
      const prixAffiche = `${DEFINITIONS[id].prix / 100} €`;
      const totalUnitaire = referencesPour(id, PRODUITS).reduce((total, reference) => total + PRODUITS[reference].prix, 0);
      const totalAffiche = `${(totalUnitaire / 100).toFixed(2).replace(".", ",")} €`;
      const pourcentage = Math.round((totalUnitaire - DEFINITIONS[id].prix) / totalUnitaire * 100);
      assert.ok(carte.includes(`class="ultra-card__comparison">Total à l’unité : <span class="ultra-card__unit-total">${totalAffiche}</span></span>`), id);
      assert.ok(carte.includes(`class="ultra-card__saving">${pourcentage} % d’économie</span>`), id);
      assert.ok(carte.includes(`class="ultra-card__price">${prixAffiche}</span>`), id);
      assert.ok(bloc.includes(`<span>${prixAffiche}</span>`), id);
    }
  }
});

test("le sommaire par matière classe toutes les ressources des cinq semestres", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  for (const [semestre, matieres] of Object.entries(MATIERES)) {
    const debut = `<details class="ultra-inclusions__item" id="pack-ultra-detail-${semestre}">`;
    const bloc = html.split(debut)[1]?.split("</details>")[0];
    assert.ok(bloc, semestre);
    const titres = [...bloc.matchAll(/<li class="ultra-resource [^"]+"><span class="ultra-resource__type">[^<]+<\/span> ([^<]+)<\/li>/g)].map(match => match[1]);
    const quantites = new Map(matieres.map(([nom]) => [nom, 0]));
    for (const titre of titres) {
      const matiere = classerRessource(semestre, titre);
      assert.ok(quantites.has(matiere), `${semestre} : ${titre}`);
      quantites.set(matiere, quantites.get(matiere) + 1);
    }
    assert.equal(titres.length, DEFINITIONS[`pack-ultra-${semestre}`].attendus, semestre);
    for (const [nom, quantite] of quantites) assert.ok(quantite > 0, `${semestre} : ${nom}`);
  }
  assert.equal(classerRessource("l3-s1", "Procédure civile L3 S1"), "Procédure civile");
  assert.equal(classerRessource("l3-s1", "Droit pénal spécial L3"), "Droit pénal spécial");
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
  const refus = [];
  try {
    await handler({ method: "POST", body: { produitId: "pack-ultra-l1-s1", pageActuelle: "#pack-ultra-l1-s1" } }, res);
    await handler({ method: "POST", body: { produitId: "pack-ultra-l2-s2", pageActuelle: "#pack-ultra-detail-l2-s2" } }, res);
    await handler({ method: "POST", body: { produitId: "pack-ultra-l3-s2" } }, res);
    refus.push([res.statusCode, res.data.code]);
    await handler({ method: "POST", body: { produitIds: ["pack-ultra-l3-s2"] } }, res);
    refus.push([res.statusCode, res.data.code]);
    await handler({ method: "POST", body: { produitId: "pack-ultra-l1-s1", bumpId: "pack-ultra-l3-s2" } }, res);
    refus.push([res.statusCode, res.data.code]);
  } finally {
    stripeModule.creerClientStripe = original;
    delete require.cache[chemin];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
  assert.deepEqual(refus, [
    [400, "produit_indisponible"],
    [400, "produit_indisponible"],
    [400, "produit_indisponible"],
  ]);
  assert.equal(appels.length, 2);
  assert.equal(appels[0].line_items[0].price_data.unit_amount, 23900);
  assert.equal(appels[0].metadata.produitIds, "pack-ultra-l1-s1");
  assert.equal(appels[0].cancel_url, "https://trajectoiredroit.com/#pack-ultra-l1-s1");
  assert.equal(appels[1].line_items[0].price_data.unit_amount, 20900);
  assert.equal(appels[1].metadata.produitIds, "pack-ultra-l2-s2");
  assert.equal(appels[1].cancel_url, "https://trajectoiredroit.com/#pack-ultra-detail-l2-s2");
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

test("un ancien paiement L3 S2 reste livrable, sans relance pour cette offre suspendue", async () => {
  const pack = PRODUITS["pack-ultra-l3-s2"];
  assert.ok(pack);
  assert.equal(pack.venteSuspendue, true);
  assert.ok(pack.blobs.length > 0);
  const liens = construireLiensTelechargement("pack-ultra-l3-s2", pack, "secret-de-test", "https://trajectoiredroit.com", 900, { sessionId: "cs_test_ancien_achat" });
  assert.equal(liens.length, pack.blobs.length);

  const { gererPanierAbandonne } = require("../api/stripe-webhook")._test;
  const session = {
    id: "cs_test_l3_s2_suspendu",
    mode: "payment",
    created: Math.floor(Date.now() / 1000),
    metadata: { produitIds: "pack-ultra-l3-s2", reminderPlan: "h1-h24-v1", source: "site", internalTest: "0" },
    customer_details: { email: "client@example.com" },
    consent: { promotions: "opt_in" },
    after_expiration: { recovery: { url: "https://checkout.stripe.com/c/pay/test" } },
  };
  const resultat = await gererPanierAbandonne(session, "brevo_test", {}, "https://trajectoiredroit.com", {
    recuperer: async () => session,
    envoyer: async () => { throw new Error("Relance interdite"); },
  });
  assert.deepEqual(resultat, { ignore: "vente-suspendue" });
});
