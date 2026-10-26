const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PROMO = {
  id: 'promo_corrige_test', code: 'CORRIGE10', active: true,
  promotion: { type: 'coupon', coupon: { id: 'coupon_corrige_test', valid: true, percent_off: 10, amount_off: null } },
  restrictions: { first_time_transaction: false, minimum_amount: null }
};

async function avecStripeFactice(operation, { promo = PROMO } = {}) {
  const stripeModule = require('../api/_stripe');
  const original = stripeModule.creerClientStripe;
  const appels = { creations: [], recherches: [] };
  stripeModule.creerClientStripe = () => ({
    promotionCodes: { list: async (params) => { appels.recherches.push(params); return { data: promo ? [promo] : [] }; } },
    checkout: { sessions: { create: async (params) => {
      appels.creations.push(params);
      return { id: 'cs_test_corrige10', url: 'https://checkout.stripe.com/test' };
    } } }
  });
  const chemin = require.resolve('../api/create-checkout');
  delete require.cache[chemin];
  const handler = require('../api/create-checkout');
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_simule_sans_reseau';
  async function creer(corps) {
    const res = {
      statusCode: 200, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };
    await handler({ method: 'POST', body: {
      attemptId: 'test-corrige10-20261026', pageActuelle: 'majeures-preparees.html', ...corps
    } }, res);
    return res;
  }
  try { await operation({ creer, appels }); }
  finally {
    stripeModule.creerClientStripe = original;
    delete require.cache[chemin];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
}

test('le code CORRIGE10 conservé après un lien ouvre une majeure sans lui accorder de remise', async () => {
  await avecStripeFactice(async ({ creer, appels }) => {
    const source = fs.readFileSync(path.join(__dirname, '../assets/js/achat.js'), 'utf8');
    const etapes = [];
    const bouton = { textContent: 'Acheter · 14,99 €', disabled: false, getAttribute: () => null };
    const window = {
      location: {
        search: '', hostname: 'trajectoiredroit.com', protocol: 'https:',
        pathname: '/majeures-preparees.html', hash: '', assign: (url) => etapes.push(url)
      },
      innerWidth: 390, innerHeight: 844, crypto: { randomUUID: () => 'test-corrige10-lien' }
    };
    vm.runInNewContext(source, {
      window, URLSearchParams,
      document: {
        readyState: 'loading', cookie: '', addEventListener() {},
        documentElement: { clientWidth: 390, clientHeight: 844 }, querySelectorAll: () => [bouton]
      },
      localStorage: {
        getItem: (cle) => cle === 'tjd_code_promo' ? JSON.stringify({ code: 'CORRIGE10', expire: Date.now() + 86400000 }) : null
      },
      sessionStorage: { getItem: () => null },
      fetch: async (_url, options) => {
        const corps = JSON.parse(options.body);
        assert.equal(corps.code, 'CORRIGE10');
        const res = await creer(corps);
        return { ok: res.statusCode === 200, status: res.statusCode, json: async () => res.payload };
      },
      alert: (message) => etapes.push('alerte:' + message)
    });
    window.tjdAcheter('maj-societes-l3-s1', bouton);
    await new Promise(setImmediate);
    assert.deepEqual(etapes, ['https://checkout.stripe.com/test']);
    assert.equal(appels.recherches.length, 0);
    assert.equal(appels.creations[0].line_items[0].price_data.unit_amount, 1499);
    assert.equal(appels.creations[0].discounts, undefined);
  });
});

test('un ancien acheteur garde son champ Stripe et son prix normal malgré CORRIGE10 sur une fiche', async () => {
  await avecStripeFactice(async ({ creer, appels }) => {
    const res = await creer({ produitId: 'fiche-intro-droit-l1', code: 'CORRIGE10', dejaAcheteur: true });
    assert.equal(res.statusCode, 200);
    const params = appels.creations[0];
    assert.equal(params.line_items[0].price_data.unit_amount, 1499);
    assert.equal(params.allow_promotion_codes, true);
    assert.equal(params.discounts, undefined);
    assert.equal(params.metadata.codePromoLien, undefined);
  });
});

test('un panier composé de recueils conserve le code promotionnel natif Stripe', async () => {
  await avecStripeFactice(async ({ creer, appels }) => {
    const res = await creer({ produitIds: ['cas-pratique-societes-l3', 'dissertation-intro-droit-l1'], code: 'corrige10' });
    assert.equal(res.statusCode, 200);
    const params = appels.creations[0];
    assert.deepEqual(params.discounts, [{ promotion_code: PROMO.id }]);
    assert.deepEqual(params.line_items.map((ligne) => ligne.price_data.unit_amount), [1499, 1499]);
    assert.equal(params.metadata.codePromoLien, 'CORRIGE10');
  });
});

test('un panier mixte réduit les seuls recueils au centime et conserve la trace de la remise', async () => {
  await avecStripeFactice(async ({ creer, appels }) => {
    const res = await creer({
      produitIds: ['cas-pratique-societes-l3', 'maj-societes-l3-s1', 'dissertation-intro-droit-l1'],
      code: 'CORRIGE10', dejaAcheteur: true
    });
    assert.equal(res.statusCode, 200);
    const params = appels.creations[0];
    assert.deepEqual(params.line_items.map((ligne) => ligne.price_data.unit_amount), [1349, 1499, 1349]);
    assert.equal(params.line_items.reduce((total, ligne) => total + ligne.price_data.unit_amount, 0), 4197);
    assert.equal(params.discounts, undefined);
    assert.equal(params.allow_promotion_codes, false);
    assert.equal(params.after_expiration.recovery.allow_promotion_codes, false);
    assert.equal(params.metadata.codePromoLien, 'CORRIGE10');
    assert.equal(params.metadata.codePromoMontantCentimes, '300');
    assert.equal(params.metadata.codePromoProduits, 'cas-pratique-societes-l3,dissertation-intro-droit-l1');
    assert.equal(params.payment_intent_data.metadata.codePromoMontantCentimes, '300');
    assert.match(params.line_items[0].price_data.product_data.description, /Le prix de ce recueil comprend la réduction de 10 % du code CORRIGE10\./);
    assert.doesNotMatch(params.line_items[1].price_data.product_data.description, /CORRIGE10/);
    assert.deepEqual(appels.recherches[0].expand, ['data.promotion.coupon']);
  });
});

test('un achat avec complément applique la remise au recueil, même placé en seconde ligne', async () => {
  await avecStripeFactice(async ({ creer, appels }) => {
    const res = await creer({ produitId: 'maj-societes-l3-s1', bumpId: 'cas-pratique-societes-l3', code: 'CORRIGE10' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(appels.creations[0].line_items.map((ligne) => ligne.price_data.unit_amount), [1499, 1349]);
    assert.equal(appels.creations[0].metadata.codePromoMontantCentimes, '150');
  });
});

const PROMOS_INUTILISABLES = [
  ['absente', null],
  ['inactive', { ...PROMO, active: false }],
  ['expirée', { ...PROMO, expires_at: Math.floor(Date.now() / 1000) - 1 }],
  ['épuisée', { ...PROMO, max_redemptions: 1, times_redeemed: 1 }],
  ['coupon invalide', { ...PROMO, promotion: { coupon: { ...PROMO.promotion.coupon, valid: false } } }],
  ['coupon différent de 10 %', { ...PROMO, promotion: { coupon: { ...PROMO.promotion.coupon, percent_off: 20 } } }],
  ['client imposé', { ...PROMO, customer: 'cus_test' }],
  ['condition de premier achat', { ...PROMO, restrictions: { first_time_transaction: true } }],
];
for (const [nom, promo] of PROMOS_INUTILISABLES) {
  test(`un panier mixte reste payable au prix normal avec une promotion ${nom}`, async () => {
    await avecStripeFactice(async ({ creer, appels }) => {
      const res = await creer({ produitIds: ['cas-pratique-societes-l3', 'maj-societes-l3-s1'], code: 'CORRIGE10' });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(appels.creations[0].line_items.map((ligne) => ligne.price_data.unit_amount), [1499, 1499]);
      assert.equal(appels.creations[0].discounts, undefined);
      assert.equal(appels.creations[0].metadata.codePromoLien, undefined);
    }, { promo });
  });
}
