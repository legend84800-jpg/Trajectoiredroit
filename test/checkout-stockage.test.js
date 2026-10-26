const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/achat.js'), 'utf8');
const sourceAvecPanier = source.replace(/\}\)\(\);\s*$/, `
  panierRafraichir = function () {};
  window.__panier = { ajouter: panierAjouter, lire: panierLire, retirer: panierRetirer, payer: panierCheckout, rendre: panierRendreListe };
})();`);
assert.notEqual(sourceAvecPanier, source);

function environnement({ panneLocale, panneSession, ecritureRefusee, search = '' } = {}) {
  const appels = [];
  const memoire = { localStorage: {}, sessionStorage: {} };
  function stockage(type, panne) {
    return {
      getItem(cle) { if (panne) throw new Error('Stockage refusé'); return memoire[type][cle] || null; },
      setItem(cle, valeur) { if (panne || ecritureRefusee) throw new Error('Écriture refusée'); memoire[type][cle] = valeur; },
      removeItem(cle) { if (panne || ecritureRefusee) throw new Error('Écriture refusée'); delete memoire[type][cle]; }
    };
  }
  const bouton = { textContent: 'Acheter · 14,99 €', disabled: false, getAttribute: () => null };
  const elements = {
    tjdPanierListe: { innerHTML: '', querySelectorAll: () => [] },
    tjdPanierTotal: { hidden: true },
    tjdPanierCta: bouton,
    tjdPanierTotalMontant: { textContent: '' },
    tjdPanierTemporaire: { hidden: true }
  };
  const window = {
    location: {
      search, hostname: 'trajectoiredroit.com', protocol: 'https:',
      pathname: '/majeures-preparees.html', hash: '',
      assign: (url) => appels.push({ redirection: url })
    },
    crypto: { randomUUID: () => 'test-stockage-20261026' },
    innerWidth: 390, innerHeight: 844
  };
  const document = {
    readyState: 'loading', cookie: '', referrer: '', addEventListener() {},
    documentElement: { clientWidth: 390, clientHeight: 844 },
    querySelectorAll: () => [bouton], getElementById: (id) => elements[id] || bouton
  };
  vm.runInNewContext(sourceAvecPanier, {
    window, document, URLSearchParams,
    localStorage: stockage('localStorage', panneLocale),
    sessionStorage: stockage('sessionStorage', panneSession),
    fetch: async (url, options) => {
      appels.push({ url, corps: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/test' }) };
    },
    alert: (message) => appels.push({ alerte: message })
  });
  return { window, bouton, appels, memoire, elements };
}

for (const panne of [{ panneLocale: true }, { panneSession: true }, { panneLocale: true, panneSession: true }]) {
  test(`un achat direct ouvre Stripe malgré le stockage indisponible ${JSON.stringify(panne)}`, async () => {
    const env = environnement(panne);
    assert.doesNotThrow(() => env.window.tjdAcheter('maj-societes-l3-s1', env.bouton));
    await new Promise(setImmediate);
    const requete = env.appels.find((appel) => appel.corps);
    assert.equal(requete.corps.produitId, 'maj-societes-l3-s1');
    assert.equal(requete.corps.consentMarketing, undefined);
    assert.equal(requete.corps.fbp, undefined);
    assert.equal(requete.corps.fbc, undefined);
    assert.equal(env.appels.at(-1).redirection, 'https://checkout.stripe.com/test');
    assert.equal(env.appels.some((appel) => appel.alerte), false);
  });
}

for (const panne of [{ panneLocale: true, panneSession: true }, { ecritureRefusee: true }]) {
  test(`le panier garde les ajouts en mémoire, les retire puis ouvre Stripe ${JSON.stringify(panne)}`, async () => {
    const env = environnement(panne);
    assert.equal(env.window.__panier.ajouter('fiche-da-l2-s1', 'Fiche DA', 1499), true);
    assert.equal(env.window.__panier.ajouter('maj-societes-l3-s1', 'Majeures Sociétés', 1499), true);
    assert.equal(env.window.__panier.ajouter('fiche-da-l2-s1', 'Fiche DA', 1499), false);
    assert.equal(env.window.__panier.lire().length, 2);
    env.window.__panier.retirer('fiche-da-l2-s1');
    assert.equal(env.window.__panier.lire().length, 1);
    env.window.__panier.payer();
    await new Promise(setImmediate);
    const requete = env.appels.find((appel) => appel.corps);
    assert.deepEqual(requete.corps.produitIds, ['maj-societes-l3-s1']);
    assert.equal(requete.corps.consentMarketing, undefined);
    assert.equal(env.appels.at(-1).redirection, 'https://checkout.stripe.com/test');
    env.window.tjdPanierVider();
    assert.equal(env.window.__panier.lire().length, 0);
  });
}

test('le code du lien et les UTM restent utilisables dans cette page si les écritures sont refusées', async () => {
  const env = environnement({
    ecritureRefusee: true,
    search: '?code=POSTA-ABCDEF12&utm_source=brevo&utm_medium=email&utm_campaign=post-achat'
  });
  env.window.tjdAcheter('maj-societes-l3-s1', env.bouton);
  await new Promise(setImmediate);
  const requete = env.appels.find((appel) => appel.corps);
  assert.equal(requete.corps.code, 'POSTA-ABCDEF12');
  assert.equal(requete.corps.utm_source, 'brevo');
  assert.equal(requete.corps.utm_medium, 'email');
  assert.equal(requete.corps.consentMarketing, undefined);
  assert.equal(env.appels.at(-1).redirection, 'https://checkout.stripe.com/test');
});

test('un consentement explicitement conservé reste respecté lorsque le stockage fonctionne', async () => {
  const env = environnement();
  env.memoire.localStorage.tjd_consent = 'granted';
  env.window.tjdAcheter('maj-societes-l3-s1', env.bouton);
  await new Promise(setImmediate);
  assert.equal(env.appels.find((appel) => appel.corps).corps.consentMarketing, true);
});

test('le panneau explique la conservation temporaire seulement lorsque le panier reste en mémoire', () => {
  for (const ecritureRefusee of [false, true]) {
    const env = environnement({ ecritureRefusee });
    env.window.__panier.ajouter('maj-societes-l3-s1', 'Majeures Sociétés', 1499);
    env.window.__panier.rendre();
    assert.equal(env.elements.tjdPanierTemporaire.hidden, !ecritureRefusee);
  }
});

test('Mon compte garde le code du prix remisé dans le bouton lorsque le stockage est refusé', async () => {
  const compte = fs.readFileSync(path.join(__dirname, '../assets/js/compte.js'), 'utf8');
  const debut = compte.indexOf('    function afficherComplements(');
  const fin = compte.indexOf('    // Accès à vie en self-service', debut);
  assert.ok(debut >= 0 && fin > debut);
  const elements = Object.fromEntries(['complementsBox', 'complementsListe', 'compteRemiseCode', 'compteRemiseDate', 'compteRemise']
    .map((id) => [id, { hidden: true, innerHTML: '', textContent: '' }]));
  vm.runInNewContext(compte.slice(debut, fin) + '\nafficherComplements(suggestions, remise);', {
    document: { getElementById: (id) => elements[id] },
    localStorage: { setItem() { throw new Error('Stockage refusé'); } },
    LIBELLES_RAISON: {},
    suggestions: [{ id: 'maj-societes-l3-s1', nom: 'Majeures Sociétés', prix: 1499 }],
    remise: { code: 'POSTA-ABCDEF12', pourcentage: 15, expireLe: Math.floor(Date.now() / 1000) + 3600 }
  });
  const html = elements.complementsListe.innerHTML;
  assert.match(html, /12,74 €/);
  const code = html.match(/data-tjd-code="([^"]+)"/)[1];
  assert.equal(code, 'POSTA-ABCDEF12');

  const env = environnement({ panneLocale: true, panneSession: true });
  env.bouton.getAttribute = (nom) => nom === 'data-tjd-code' ? code : null;
  env.window.tjdAcheter('maj-societes-l3-s1', env.bouton);
  await new Promise(setImmediate);
  assert.equal(env.appels.find((appel) => appel.corps).corps.code, code);
  assert.equal(env.appels.at(-1).redirection, 'https://checkout.stripe.com/test');
  assert.deepEqual(env.memoire.localStorage, {});
});
