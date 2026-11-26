const test = require("node:test");
const assert = require("node:assert/strict");
const { DATE_HORS_OFFRE, fixerHorlogePaiement } = require("../test-support/horloge-paiement");

const OFFRE = {
  id: "coupon_partiels_test",
  taux: 15,
  debut: "2026-11-20T04:49:00Z",
  fin: "2026-11-22T04:49:00Z",
};
const FICHE = "fiche-da-l2-s1";
const MAJEURES = "maj-penal-l2-s1";
const KIT = "pack-kit-partiels-l2--administratif-s1--administratif-s2--contrats";
const PACK_ULTRA = "pack-ultra-l1-s1-revision";
const CADEAU = { cadeauEmail: "etudiant@example.com" };

async function avecCheckoutFactice(t, maintenant, controler, offre = OFFRE) {
  fixerHorlogePaiement(t, maintenant);
  const stripe = require("../api/_stripe");
  const appels = [];
  const appelsCodes = [];
  t.mock.method(stripe, "creerClientStripe", () => ({
    promotionCodes: { list: async (params) => { appelsCodes.push(params); return { data: [] }; } },
    checkout: { sessions: { create: async (params, options) => {
      appels.push({ params, options });
      return { id: "cs_test_offre", url: "https://checkout.stripe.com/c/pay/test" };
    } } },
  }));

  const cheminSaison = require.resolve("../assets/data/saison.json");
  const cheminOffre = require.resolve("../api/_offre-partiels");
  const cheminCheckout = require.resolve("../api/create-checkout");
  const saison = require(cheminSaison);
  const ancienneOffre = require.cache[cheminOffre];
  const ancienCheckout = require.cache[cheminCheckout];
  const ancienneCle = process.env.STRIPE_SECRET_KEY;

  try {
    require.cache[cheminSaison].exports = { ...saison, offre_partiels: offre };
    delete require.cache[cheminOffre];
    delete require.cache[cheminCheckout];
    process.env.STRIPE_SECRET_KEY = "sk_test_factice";
    const checkout = require(cheminCheckout);
    const ouvrir = async (body) => {
      const res = {
        statusCode: null,
        setHeader() {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; },
      };
      const nombreAppelsAvant = appels.length;
      await checkout({
        method: "POST",
        body: { attemptId: "test-montant-partiels", ...body },
      }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.payload.sessionId, "cs_test_offre");
      assert.equal(appels.length, nombreAppelsAvant + 1);
      return appels.at(-1);
    };
    await controler(ouvrir);
    assert.deepEqual(appelsCodes, []);
  } finally {
    require.cache[cheminSaison].exports = saison;
    delete require.cache[cheminOffre];
    delete require.cache[cheminCheckout];
    if (ancienneOffre) require.cache[cheminOffre] = ancienneOffre;
    if (ancienCheckout) require.cache[cheminCheckout] = ancienCheckout;
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
}

const PAIEMENTS_COMPTANTS = [
  { corps: { produitId: FICHE }, lignes: [1499], total: 1499, totalPromo: 1274 },
  { corps: { produitIds: [FICHE, MAJEURES], code: "MAJEURES10" }, lignes: [1499, 1349], total: 2848, totalPromo: 2548 },
  { corps: { produitId: FICHE, bumpId: MAJEURES }, lignes: [1499, 1499], total: 2998, totalPromo: 2548 },
  { corps: { produitId: KIT }, lignes: [6900], total: 6900, totalPromo: 5865 },
  { corps: { produitId: PACK_ULTRA, ...CADEAU }, lignes: [19900], total: 19900, totalPromo: 16915 },
];
const PAIEMENTS_ECHELONNES = [
  { corps: { produitId: KIT, echeances: 2 }, echeance: 3450, total: 6900, echeancePromo: 2932, totalPromo: 5864 },
  { corps: { produitId: PACK_ULTRA, echeances: 2 }, echeance: 9950, total: 19900, echeancePromo: 8457, totalPromo: 16914 },
  { corps: { produitId: PACK_ULTRA, echeances: 3, ...CADEAU }, echeance: 6633, total: 19899, echeancePromo: 5638, totalPromo: 16914 },
];

for (const [description, date, enPromo] of [
  ["avant l’ouverture de la remise", DATE_HORS_OFFRE, false],
  ["à l’ouverture de la remise", Date.parse(OFFRE.debut), true],
  ["à la fin de la remise", Date.parse(OFFRE.fin), false],
]) {
  test(`les montants Checkout suivent le catalogue ${description}`, async (t) => {
    await avecCheckoutFactice(t, date, async (ouvrir) => {
      for (const scenario of PAIEMENTS_COMPTANTS) {
        const { params, options } = await ouvrir(scenario.corps);
        assert.equal(params.mode, "payment");
        const lignes = params.line_items.map(({ price_data, quantity }) => {
          assert.equal(price_data.currency, "eur");
          assert.equal(quantity, 1);
          return price_data.unit_amount;
        });
        const ids = scenario.corps.produitIds ?? [scenario.corps.produitId, scenario.corps.bumpId].filter(Boolean);
        assert.equal(params.metadata.produitIds, ids.join(","));
        assert.deepEqual(lignes, enPromo && scenario.corps.code ? [1499, 1499] : scenario.lignes);
        const somme = lignes.reduce((total, prix) => total + prix, 0);
        if (enPromo) {
          assert.deepEqual(params.discounts, [{ coupon: OFFRE.id }]);
          assert.equal(params.allow_promotion_codes, undefined);
          assert.equal(params.metadata.codePromoLien, undefined);
          assert.equal(params.after_expiration, undefined);
          assert.ok(options.idempotencyKey.endsWith("-" + OFFRE.id));
          // Pour un achat comptant, le coupon est appliqué au total par Stripe.
          assert.equal(somme - Math.round(somme * OFFRE.taux / 100), scenario.totalPromo);
        } else {
          assert.equal(params.discounts, undefined);
          assert.equal(params.metadata.offrePartiels, undefined);
          assert.equal(somme, scenario.total);
        }
        if (scenario.corps.cadeauEmail) {
          assert.equal(params.metadata.cadeauEmail, CADEAU.cadeauEmail);
          assert.equal(params.customer_email, undefined);
        }
      }

      for (const scenario of PAIEMENTS_ECHELONNES) {
        const { params, options } = await ouvrir(scenario.corps);
        const nombre = scenario.corps.echeances;
        const attendu = enPromo ? scenario.echeancePromo : scenario.echeance;
        const totalAttendu = enPromo ? scenario.totalPromo : scenario.total;
        assert.equal(params.mode, "subscription");
        assert.equal(params.line_items.length, 1);
        assert.equal(params.line_items[0].price_data.currency, "eur");
        assert.equal(params.line_items[0].quantity, 1);
        assert.equal(params.line_items[0].price_data.unit_amount, attendu);
        assert.deepEqual(params.line_items[0].price_data.recurring, { interval: "month" });
        assert.equal(params.metadata.montantTotal, String(totalAttendu));
        assert.equal(params.metadata.montantEcheance, String(attendu));
        assert.equal(params.metadata.produitIds, scenario.corps.produitId);
        assert.equal(params.subscription_data.metadata.echeances, String(nombre));
        assert.equal(params.metadata.offrePartiels, enPromo ? OFFRE.id : undefined);
        assert.equal(nombre * attendu, totalAttendu);
        assert.equal(params.allow_promotion_codes, false);
        assert.equal(params.discounts, undefined);
        assert.equal(params.after_expiration, undefined);
        assert.equal(options.idempotencyKey.endsWith("-" + OFFRE.id), enPromo);
        if (scenario.corps.cadeauEmail) {
          assert.equal(params.metadata.cadeauEmail, CADEAU.cadeauEmail);
          assert.equal(params.subscription_data.metadata.cadeau, "1");
        }
      }
    });
  });
}

test("la configuration publiée le 26 novembre facture 14,99 euros sans remise Partiels", async (t) => {
  const { offre_partiels: offrePubliee } = require("../assets/data/saison.json");
  await avecCheckoutFactice(t, Date.parse("2026-11-26T18:00:00Z"), async (ouvrir) => {
    const achatDirect = await ouvrir({ produitId: FICHE });
    const panier = await ouvrir({ produitIds: [FICHE, MAJEURES] });
    assert.deepEqual(achatDirect.params.line_items.map(({ price_data }) => price_data.unit_amount), [1499]);
    assert.deepEqual(panier.params.line_items.map(({ price_data }) => price_data.unit_amount), [1499, 1499]);
    for (const { params } of [achatDirect, panier]) {
      assert.equal(params.discounts, undefined);
      assert.equal(params.metadata.offrePartiels, undefined);
    }
  }, offrePubliee ?? null);
});

test("une session promo ouverte à la dernière minute laisse le temps de payer sans lien de récupération", async (t) => {
  const fin = Date.parse(OFFRE.fin);
  await avecCheckoutFactice(t, fin - 60_000, async (ouvrir) => {
    for (const corps of [{ produitId: FICHE }, { produitId: KIT, echeances: 2 }]) {
      const { params } = await ouvrir(corps);
      assert.equal(params.metadata.offrePartiels, OFFRE.id);
      assert.equal(params.expires_at, (fin - 60_000) / 1000 + (31 * 60));
      assert.equal(params.after_expiration, undefined);
    }
  });
});


test("prix ronds de la campagne en achat direct, panier et échéances", async (t) => {
  const offre = { ...OFFRE, prix_ronds_centimes: { 5800: 4900, 19900: 16900 } };
  await avecCheckoutFactice(t, Date.parse(offre.debut), async (ouvrir) => {
    const forfaits = [
      [{ produitId: "pack-l3" }, [4900]],
      [{ produitId: PACK_ULTRA, ...CADEAU }, [16900]],
      [{ produitIds: ["pack-l3", PACK_ULTRA, FICHE] }, [4900, 16900, 1274]],
      [{ produitId: FICHE, bumpId: "pack-l3" }, [1274, 4900]],
    ];
    for (const [corps, montants] of forfaits) {
      const { params, options } = await ouvrir(corps);
      assert.deepEqual(params.line_items.map((ligne) => ligne.price_data.unit_amount), montants);
      assert.equal(params.discounts, undefined);
      assert.equal(params.allow_promotion_codes, undefined);
      assert.equal(params.after_expiration, undefined);
      assert.equal(params.metadata.offrePartiels, OFFRE.id);
      assert.ok(options.idempotencyKey.endsWith("-" + OFFRE.id + "-prix-ronds"));
    }
    const { params: fiche } = await ouvrir({ produitId: FICHE });
    assert.deepEqual(fiche.discounts, [{ coupon: OFFRE.id }]);
    assert.equal(fiche.line_items[0].price_data.unit_amount, 1499);
    const { params: ultraL3 } = await ouvrir({ produitId: "pack-ultra-l3-s1-revision" });
    assert.deepEqual(ultraL3.discounts, [{ coupon: OFFRE.id }]);
    assert.equal(ultraL3.line_items[0].price_data.unit_amount, 22900);

    for (const [nombre, montant, total] of [[2, 8450, 16900], [3, 5633, 16899]]) {
      const { params, options } = await ouvrir({ produitId: PACK_ULTRA, echeances: nombre, ...CADEAU });
      assert.equal(params.mode, "subscription");
      assert.equal(params.line_items[0].price_data.unit_amount, montant);
      assert.equal(params.metadata.montantTotal, String(total));
      assert.equal(params.metadata.cadeauEmail, CADEAU.cadeauEmail);
      assert.ok(options.idempotencyKey.endsWith("-" + OFFRE.id + "-prix-ronds"));
    }
  }, offre);
  await avecCheckoutFactice(t, Date.parse(offre.fin), async (ouvrir) => {
    for (const [produitId, prix] of [["pack-l3", 5800], [PACK_ULTRA, 19900]]) {
      const { params } = await ouvrir({ produitId });
      assert.equal(params.line_items[0].price_data.unit_amount, prix);
      assert.equal(params.metadata.offrePartiels, undefined);
    }
  }, offre);
});
