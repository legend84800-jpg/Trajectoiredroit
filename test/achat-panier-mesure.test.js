const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fichier = path.join(__dirname, '..', 'assets', 'js', 'achat.js');
const source = fs.readFileSync(fichier, 'utf8');
const sourceTest = source.replace(/\}\)\(\);\s*$/, 'window.__payerPanier = panierCheckout;\n})();');
assert.notEqual(sourceTest, source, 'Le test doit accéder au vrai flux du panier');

async function executerPanier(panne) {
  const appels = [];
  const bouton = { textContent: 'Passer au paiement', disabled: false };
  const gtag = (_type, evenement) => {
    appels.push(evenement);
    if (panne === 'ga4' && evenement === 'checkout_session_created') throw new Error('GA4 indisponible');
  };
  const window = {
    location: {
      search: '', hostname: 'trajectoiredroit.com', protocol: 'https:',
      pathname: '/formations.html', hash: '',
      assign: (url) => appels.push(`redirige:${url}`),
    },
    crypto: { randomUUID: () => 'test-panier' },
    innerWidth: 390,
    innerHeight: 800,
    gtag,
    _paq: {
      push: (valeur) => {
        appels.push(valeur[2]);
        if (panne === 'matomo' && valeur[2] === 'CheckoutCree') throw new Error('Matomo indisponible');
      },
    },
    setTimeout: () => appels.push('attente'),
  };
  const document = {
    readyState: 'loading',
    addEventListener: () => {},
    documentElement: { clientWidth: 390, clientHeight: 800 },
    getElementById: () => bouton,
  };
  const panier = JSON.stringify([{ id: 'fiche-da-l2-s1', nom: 'Fiche DA', prixCentimes: 1499 }]);
  const localStorage = {
    getItem: (cle) => cle === 'tjd_panier' ? panier : null,
    setItem: () => {},
  };
  const fetch = async (url) => {
    appels.push(`requete:${url}`);
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/test' }) };
  };

  vm.runInNewContext(sourceTest, {
    window, document, localStorage, sessionStorage: { getItem: () => null },
    fetch, gtag, URLSearchParams, alert: () => appels.push('alerte'),
  });
  window.__payerPanier();
  await new Promise(setImmediate);
  return { appels, bouton };
}

test('le panier mesure la session créée et ouvre Stripe sans attente supplémentaire', async () => {
  const { appels, bouton } = await executerPanier();
  assert.ok(appels.includes('checkout_session_created'));
  assert.ok(appels.includes('CheckoutCree'));
  assert.equal(appels.at(-1), 'redirige:https://checkout.stripe.com/test');
  assert.ok(!appels.includes('attente'));
  assert.equal(bouton.textContent, 'Chargement…');
});

for (const panne of ['ga4', 'matomo']) {
  test(`le panier ouvre Stripe même si ${panne} échoue`, async () => {
    const { appels } = await executerPanier(panne);
    assert.equal(appels.at(-1), 'redirige:https://checkout.stripe.com/test');
    assert.ok(!appels.includes('alerte'));
  });
}

async function executerAchatDirect(panne) {
  const appels = [];
  const bouton = {
    textContent: 'Acheter · 19,99 €', disabled: false,
    getAttribute: () => null,
  };
  const gtag = (_type, evenement) => {
    appels.push(evenement);
    if (panne === 'ga4' && evenement === 'checkout_session_created') throw new Error('GA4 indisponible');
    if (panne === 'ga4-clic' && evenement === 'begin_checkout') throw new Error('GA4 indisponible');
  };
  const window = {
    location: {
      search: '', hostname: 'trajectoiredroit.com', protocol: 'https:',
      pathname: '/fiches-droit-administratif-l2.html', hash: '',
      assign: (url) => appels.push(`redirige:${url}`),
    },
    crypto: { randomUUID: () => 'test-direct' },
    innerWidth: 390, innerHeight: 800,
    gtag,
    _paq: {
      push: (valeur) => {
        appels.push(valeur[2]);
        if (panne === 'matomo' && valeur[2] === 'CheckoutCree') throw new Error('Matomo indisponible');
        if (panne === 'matomo-clic' && valeur[2] === 'ClicAcheter') throw new Error('Matomo indisponible');
      },
    },
    setTimeout: () => appels.push('attente'),
  };
  const document = {
    readyState: 'loading', cookie: '',
    addEventListener: () => {},
    documentElement: { clientWidth: 390, clientHeight: 800 },
    querySelectorAll: () => [bouton],
  };
  const localStorage = { getItem: () => null, setItem: () => {} };
  const fetch = async (url) => {
    appels.push(`requete:${url}`);
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/test' }) };
  };
  vm.runInNewContext(source, {
    window, document, localStorage, sessionStorage: { getItem: () => null },
    fetch, gtag, URLSearchParams, alert: () => appels.push('alerte'),
  });
  window.tjdAcheter('fiche-da-l2-s1', bouton);
  await new Promise(setImmediate);
  return { appels, bouton };
}

test('l’achat direct ouvre Stripe sans les 500 ms d’attente précédents', async () => {
  const { appels, bouton } = await executerAchatDirect();
  assert.ok(appels.includes('checkout_session_created'));
  assert.ok(appels.includes('CheckoutCree'));
  assert.ok(!appels.includes('attente'));
  assert.equal(appels.at(-1), 'redirige:https://checkout.stripe.com/test');
  assert.equal(bouton.textContent, 'Chargement…');
});

for (const panne of ['ga4', 'matomo', 'ga4-clic', 'matomo-clic']) {
  test(`l’achat direct reste accessible si ${panne} échoue`, async () => {
    const { appels } = await executerAchatDirect(panne);
    assert.ok(appels.includes('requete:/api/create-checkout'));
    assert.equal(appels.at(-1), 'redirige:https://checkout.stripe.com/test');
    assert.ok(!appels.includes('alerte'));
  });
}
