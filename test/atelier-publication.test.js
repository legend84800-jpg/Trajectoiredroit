const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const REF = 'diffusion.1e4c7f17-183b-43d7-a9a2-a806b8f8b678.2f10ffda-b19c-47f9-82e0-939939e42182';
const AUTRE_REF = 'diffusion.3e4c7f17-183b-43d7-a9a2-a806b8f8b678.4f10ffda-b19c-47f9-82e0-939939e42182';
const UTM = {
  utm_source: 'facebook', utm_medium: 'organic-social',
  utm_campaign: 'manoukian-2026-10-23', utm_content: 'page-tjd',
};
const JOUR = 24 * 60 * 60 * 1000;
const sourceAchat = fs.readFileSync(path.join(RACINE, 'assets/js/achat.js'), 'utf8');
const sourceTest = sourceAchat.replace(/\}\)\(\);\s*$/, 'window.__payerPanier = panierCheckout;\n})();');
assert.notEqual(sourceTest, sourceAchat);
const sourceMain = fs.readFileSync(path.join(RACINE, 'assets/js/main.js'), 'utf8').split('/* ----- SKIP LINK')[0];

function stockage() {
  const contenu = new Map();
  return {
    getItem: (cle) => contenu.get(cle) ?? null,
    setItem: (cle, valeur) => contenu.set(cle, String(valeur)),
    removeItem: (cle) => contenu.delete(cle),
  };
}

function navigateur() {
  const localStorage = stockage();
  let sessionStorage = stockage();
  let maintenant = Date.UTC(2026, 9, 23, 18);
  localStorage.setItem('tjd_panier', JSON.stringify([{ id: 'fiche-da-l2-s1', nom: 'Fiche droit administratif', prixCentimes: 1499 }]));
  return {
    localStorage,
    nouvelleSession() { sessionStorage = stockage(); },
    avancer(jours) { maintenant += jours * JOUR; },
    page(search = '', pathname = '/droit-des-obligations-l2.html', achat = true) {
      const appels = [];
      const bouton = {
        textContent: 'Acheter · 14,99 €', disabled: false,
        getAttribute: () => null,
      };
      const document = {
        readyState: 'loading', referrer: 'https://www.facebook.com/', cookie: '',
        addEventListener() {},
        documentElement: { clientWidth: 390, clientHeight: 844 },
        getElementById: () => bouton,
        querySelectorAll: () => [bouton],
      };
      const window = {
        localStorage, sessionStorage,
        location: {
          search, pathname, hash: '', hostname: 'trajectoiredroit.com', protocol: 'https:',
          assign: (url) => appels.push({ redirection: url }),
        },
        crypto: { randomUUID: () => 'test-attribution-publication' },
        innerWidth: 390, innerHeight: 844,
      };
      class DateControlee extends Date { static now() { return maintenant; } }
      const contexte = {
        window, document, localStorage, sessionStorage, URLSearchParams, Date: DateControlee,
        fetch: async (url, options) => {
          assert.equal(url, '/api/create-checkout');
          appels.push({ corps: JSON.parse(options.body) });
          return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/test-simule' }) };
        },
        alert: () => assert.fail('Le paiement simulé doit rester accessible'),
      };
      vm.runInNewContext(sourceMain, contexte);
      if (achat) vm.runInNewContext(sourceTest, contexte);
      return {
        async payer(panier = false) {
          if (panier) window.__payerPanier();
          else window.tjdAcheter('fiche-da-l2-s1', bouton);
          await new Promise(setImmediate);
          assert.equal(appels.at(-1).redirection, 'https://checkout.stripe.com/test-simule');
          return appels.find((appel) => appel.corps).corps;
        },
      };
    },
  };
}

const requete = (ref = REF, utm = UTM) => '?' + new URLSearchParams({ ...utm, ap_ref: ref });

test('la page produit charge achat.js après main.js et cet asset se revalide à chaque lecture', () => {
  const page = fs.readFileSync(path.join(RACINE, 'droit-des-obligations-l2.html'), 'utf8');
  assert.ok(page.indexOf('src="assets/js/main.js?') < page.indexOf('src="assets/js/achat.js?'));
  assert.ok(page.includes('src="assets/js/achat.js?'));
  const entete = require('../vercel.json').headers.find((item) => item.source === '/assets/js/achat.js');
  assert.ok(entete.headers.some((item) => item.key === 'Cache-Control' && /max-age=0/.test(item.value) && /must-revalidate/.test(item.value)));
});

test('le lien de publication transmet sa référence et les quatre UTM au paiement direct et au panier', async () => {
  for (const panier of [false, true]) {
    const corps = await navigateur().page(requete()).payer(panier);
    assert.equal(corps.atelierPublicationRef, REF);
    for (const [cle, valeur] of Object.entries(UTM)) assert.equal(corps[cle], valeur);
    assert.equal(corps.landingPage, 'droit-des-obligations-l2.html');
    assert.equal(corps.internalTest, false);
  }
});

test('la provenance survit à la navigation et à une nouvelle session pendant trente jours sans renouveler son âge', async () => {
  const browser = navigateur();
  browser.page(requete());
  const contactInitial = JSON.parse(browser.localStorage.getItem('tjd_attribution'));
  let corps = await browser.page('', '/formations.html').payer();
  assert.equal(corps.atelierPublicationRef, REF);
  assert.equal(corps.landingPage, 'droit-des-obligations-l2.html');
  browser.avancer(29);
  browser.nouvelleSession();
  corps = await browser.page('', '/cours-fiches.html').payer(true);
  assert.equal(corps.atelierPublicationRef, REF);
  for (const [cle, valeur] of Object.entries(UTM)) assert.equal(corps[cle], valeur);
  assert.equal(JSON.parse(browser.localStorage.getItem('tjd_attribution')).ts, contactInitial.ts);
  browser.avancer(1);
  corps = await browser.page('', '/formations.html').payer();
  assert.equal(corps.atelierPublicationRef, undefined);
});

test('une nouvelle campagne sans référence remplace toute la provenance précédente, même avec les mêmes UTM', async () => {
  for (const nouveau of [{ utm_source: 'brevo', utm_medium: 'email' }, UTM]) {
    const browser = navigateur();
    browser.page(requete());
    const corps = await browser.page('?' + new URLSearchParams(nouveau)).payer();
    assert.equal(corps.atelierPublicationRef, undefined);
    for (const cle of Object.keys(UTM)) assert.equal(corps[cle], nouveau[cle]);
    assert.equal(JSON.parse(browser.localStorage.getItem('tjd_attribution')).atelierPublicationRef, undefined);
  }
});

test('une campagne arrivée sur une page sans achat.js efface aussi la référence avant un prochain achat', async () => {
  const browser = navigateur();
  browser.page(requete());
  browser.page('?' + new URLSearchParams(UTM), '/article.html', false);
  const corps = await browser.page('', '/formations.html').payer();
  assert.equal(corps.atelierPublicationRef, undefined);
});

test('une nouvelle publication sans UTM garde sa référence et retire les UTM de l’ancien contact', async () => {
  const browser = navigateur();
  browser.page(requete());
  const corps = await browser.page(requete(AUTRE_REF, {}), '/formations.html').payer();
  assert.equal(corps.atelierPublicationRef, AUTRE_REF);
  assert.equal(corps.landingPage, 'formations.html');
  for (const cle of Object.keys(UTM)) assert.equal(corps[cle], undefined);
});

test('une référence malformée dans un nouveau lien ne reprend jamais celle de la publication précédente', async () => {
  for (const reference of ['', REF.toUpperCase(), REF + '\n', 'diffusion.x.y', 'https://exemple.invalid']) {
    const browser = navigateur();
    browser.page(requete());
    const corps = await browser.page(requete(reference)).payer();
    assert.equal(corps.atelierPublicationRef, undefined);
    assert.equal(corps.utm_campaign, UTM.utm_campaign);
  }
});

test('une provenance locale d’un autre onglet ne se combine pas avec les UTM du paiement en cours', async () => {
  const browser = navigateur();
  const pageAncienne = browser.page(requete());
  browser.nouvelleSession();
  browser.page(requete(AUTRE_REF, { ...UTM, utm_campaign: 'autre-campagne' }));
  const corps = await pageAncienne.payer();
  assert.equal(corps.atelierPublicationRef, undefined);
  assert.equal(corps.utm_campaign, UTM.utm_campaign);
});

test('le serveur conserve uniquement la référence stricte et sa marque TJD dans les métadonnées', () => {
  const attribution = require('../api/_atelier-attribution');
  assert.deepEqual(attribution({ atelierPublicationRef: REF, atelierBrand: 'philo', utm_source: 'facebook' }), {
    atelierBrand: 'tjd', atelierPublicationRef: REF,
  });
  for (const reference of ['', REF + '\n', REF.toUpperCase(), REF.slice(0, -1), [REF], { value: REF }]) {
    assert.deepEqual(attribution({ atelierPublicationRef: reference }), { atelierBrand: 'tjd' });
  }
});

test('Checkout direct et panier reçoivent la référence dans Stripe avec les vrais prix du catalogue', async () => {
  const stripeModule = require('../api/_stripe');
  const original = stripeModule.creerClientStripe;
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  const chemin = require.resolve('../api/create-checkout');
  const appels = [];
  stripeModule.creerClientStripe = () => ({ checkout: { sessions: { create: async (params) => {
    appels.push(params);
    return { id: 'cs_test_attribution_simulee', url: 'https://checkout.stripe.com/test-simule' };
  } } } });
  process.env.STRIPE_SECRET_KEY = 'sk_test_sans_reseau';
  delete require.cache[chemin];
  try {
    const handler = require('../api/create-checkout');
    for (const selection of [{ produitId: 'fiche-da-l2-s1' }, { produitIds: ['fiche-da-l2-s1'] }]) {
      const res = {
        statusCode: 200,
        setHeader() {},
        status(code) { this.statusCode = code; return this; },
        json(corps) { this.corps = corps; return this; },
      };
      await handler({ method: 'POST', body: {
        ...selection, ...UTM, atelierPublicationRef: REF, atelierOrientationRef: 'ff97fcb1-c90b-44c5-9a8d-3b1794fa4ca1', atelierBrand: 'philo',
        attemptId: 'test-publication-123456789', unit_amount: 1,
      } }, res);
      assert.equal(res.statusCode, 200);
      const params = appels.at(-1);
      assert.equal(params.metadata.atelierPublicationRef, REF);
      assert.equal(params.metadata.atelierOrientationRef, 'ff97fcb1-c90b-44c5-9a8d-3b1794fa4ca1');
      assert.equal(params.metadata.atelierBrand, 'tjd');
      assert.equal(params.metadata.utmSource, UTM.utm_source);
      assert.equal(params.metadata.utmMedium, UTM.utm_medium);
      assert.equal(params.metadata.utmCampaign, UTM.utm_campaign);
      assert.equal(params.metadata.utmContent, UTM.utm_content);
      assert.equal(params.line_items[0].price_data.currency, 'eur');
      assert.equal(params.line_items[0].price_data.unit_amount, require('../api/_produits')['fiche-da-l2-s1'].prix);
    }
    assert.equal(appels.length, 2);
  } finally {
    stripeModule.creerClientStripe = original;
    delete require.cache[chemin];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
});

const ORIENTATION_REF = 'ff97fcb1-c90b-44c5-9a8d-3b1794fa4ca1';
const AUTRE_ORIENTATION_REF = 'ce32bbd0-9ddb-4543-91f9-e6c910b2d7f9';
const requeteOrientation = (reference = ORIENTATION_REF, utm = UTM, publication) => '?' + new URLSearchParams({ ...utm, oq_ref: reference, ...(publication ? { ap_ref: publication } : {}) });

test('la référence d’orientation rejoint le paiement direct et le panier avec les UTM du contact', async () => {
  for (const panier of [false, true]) {
    const corps = await navigateur().page(requeteOrientation()).payer(panier);
    assert.equal(corps.atelierOrientationRef, ORIENTATION_REF);
    assert.equal(corps.atelierPublicationRef, undefined);
    for (const [cle, valeur] of Object.entries(UTM)) assert.equal(corps[cle], valeur);
    assert.equal(corps.produitId || corps.produitIds[0], 'fiche-da-l2-s1');
  }
});

test('orientation et publication coexistent lorsqu’elles proviennent du même lien', async () => {
  const browser = navigateur();
  browser.page(requeteOrientation(ORIENTATION_REF, UTM, REF));
  const corps = await browser.page('', '/formations.html').payer();
  assert.equal(corps.atelierOrientationRef, ORIENTATION_REF);
  assert.equal(corps.atelierPublicationRef, REF);
});

test('l’orientation survit trente jours aux pages et sessions sans renouveler son âge', async () => {
  const browser = navigateur();
  browser.page(requeteOrientation());
  const initial = JSON.parse(browser.localStorage.getItem('tjd_attribution'));
  browser.avancer(29); browser.nouvelleSession();
  let corps = await browser.page('', '/formations.html').payer(true);
  assert.equal(corps.atelierOrientationRef, ORIENTATION_REF);
  assert.equal(JSON.parse(browser.localStorage.getItem('tjd_attribution')).ts, initial.ts);
  browser.avancer(1); corps = await browser.page('', '/formations.html').payer();
  assert.equal(corps.atelierOrientationRef, undefined);
});

test('le dernier lien d’orientation remplace le contact avec ses seuls UTM', async () => {
  const browser = navigateur(); browser.page(requeteOrientation(ORIENTATION_REF, UTM, REF));
  const corps = await browser.page(requeteOrientation(AUTRE_ORIENTATION_REF, {}), '/formations.html').payer();
  assert.equal(corps.atelierOrientationRef, AUTRE_ORIENTATION_REF);
  assert.equal(corps.atelierPublicationRef, undefined);
  assert.equal(corps.landingPage, 'formations.html');
  for (const cle of Object.keys(UTM)) assert.equal(corps[cle], undefined);
});

test('une nouvelle campagne efface l’orientation sur une page avec ou sans achat.js', async () => {
  for (const achat of [false, true]) {
    const browser = navigateur(); browser.page(requeteOrientation());
    browser.page('?' + new URLSearchParams(UTM), '/article.html', achat);
    const corps = await browser.page('', '/formations.html').payer();
    assert.equal(corps.atelierOrientationRef, undefined);
  }
});

test('une orientation d’un autre onglet ne se greffe pas au paiement ouvert, même avec les mêmes UTM', async () => {
  for (const nouvelleReference of [requeteOrientation(AUTRE_ORIENTATION_REF), requete(AUTRE_REF)]) {
    const browser = navigateur(), ancien = browser.page(requeteOrientation());
    browser.nouvelleSession(); browser.page(nouvelleReference);
    const corps = await ancien.payer();
    assert.equal(corps.atelierOrientationRef, undefined);
    assert.equal(corps.atelierPublicationRef, undefined);
    assert.equal(corps.utm_campaign, UTM.utm_campaign);
  }
});

test('un lien d’orientation accepte uniquement un UUIDv4 minuscule et unique', async () => {
  const invalides = ['', ORIENTATION_REF.toUpperCase(), ORIENTATION_REF + '\n', ORIENTATION_REF.replace('-44c5-', '-14c5-'), ORIENTATION_REF.replace('-9a8d-', '-7a8d-'), 'not-an-id'];
  for (const reference of invalides) {
    const browser = navigateur(); browser.page(requeteOrientation());
    const corps = await browser.page(requeteOrientation(reference)).payer();
    assert.equal(corps.atelierOrientationRef, undefined);
  }
  const double = requeteOrientation() + '&oq_ref=' + AUTRE_ORIENTATION_REF;
  assert.equal((await navigateur().page(double).payer()).atelierOrientationRef, undefined);
});

test('le serveur conserve seulement un UUIDv4 d’orientation strict et la marque TJD', () => {
  const attribution = require('../api/_atelier-attribution');
  assert.deepEqual(attribution({ atelierOrientationRef: ORIENTATION_REF, atelierPublicationRef: REF, atelierBrand: 'philo' }), {
    atelierBrand: 'tjd', atelierOrientationRef: ORIENTATION_REF, atelierPublicationRef: REF,
  });
  for (const reference of ['', ORIENTATION_REF.toUpperCase(), ORIENTATION_REF + '\n', ORIENTATION_REF.replace('-44c5-', '-14c5-'), [ORIENTATION_REF], { value: ORIENTATION_REF }]) {
    assert.deepEqual(attribution({ atelierOrientationRef: reference }), { atelierBrand: 'tjd' });
  }
});
