const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../assets/js/achat.js'), 'utf8');
const flush = () => new Promise(setImmediate);

function environnement({ panier = null } = {}) {
  const demandes = [], redirections = [], messages = [], timers = new Map(), evenements = {};
  let sequence = 0, comportement = 'suspendu';
  const bouton = { id: panier ? 'tjdPanierCta' : '', textContent: panier ? 'Passer au paiement' : 'Acheter · 14,99 €', disabled: false, getAttribute: () => null };
  const stockage = { getItem: (cle) => cle === 'tjd_panier' && panier ? JSON.stringify(panier) : null, setItem() {}, removeItem() {} };
  const retraits = (panier || []).map(() => ({ disabled: false, addEventListener() {} }));
  const elements = { tjdPanierCta: bouton, tjdPanierListe: { innerHTML: '', querySelectorAll: () => retraits }, tjdPanierTotal: {}, tjdPanierTotalMontant: {}, tjdPanierTemporaire: {} };
  const window = {
    location: { search: '', hostname: 'localhost', pathname: '/formations.html', hash: '', protocol: 'http:', assign: url => redirections.push(url) },
    crypto: { randomUUID: () => 'tentative-attente-' + (++sequence) },
    addEventListener: (nom, fn) => { evenements[nom] = fn; }
  };
  const document = {
    readyState: 'loading', cookie: '', referrer: '', addEventListener() {},
    documentElement: { clientWidth: 390, clientHeight: 844 },
    querySelectorAll: () => [bouton], getElementById: (id) => elements[id] || bouton
  };
  const fetch = (url, options) => {
    demandes.push(JSON.parse(options.body));
    if (comportement === 'erreur') throw new Error('Connexion refusée');
    if (comportement === 'succes') return Promise.resolve({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/paiement' }) });
    return new Promise(resolve => { demandes.at(-1).resoudre = resolve; });
  };
  const sourceTest = source.replace(/\}\)\(\);\s*$/, 'window.__payerPanier = panierCheckout; window.__rendrePanier = panierRendreListe; })();');
  vm.runInNewContext(sourceTest, {
    window, document, localStorage: stockage, sessionStorage: stockage, URLSearchParams,
    fetch, AbortController, alert: texte => messages.push(texte),
    setTimeout: (fn, delai) => { const id = ++sequence; timers.set(id, { fn, delai }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  return { window, bouton, retraits, demandes, redirections, messages, evenements, timers,
    repondre(mode) { comportement = mode; },
    remplacerPanier(produits) { panier = produits; },
    expirer() { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } }
  };
}

test('un paiement suspendu rend le bouton disponible et ignore une réponse tardive', async () => {
  const e = environnement();
  e.window.tjdAcheter('fiche-da-l2-s1', e.bouton);
  await flush();
  assert.equal(e.bouton.disabled, true);
  assert.equal([...e.timers.values()][0].delai, 30000);
  e.expirer(); await flush();
  assert.equal(e.bouton.disabled, false);
  assert.equal(e.bouton.textContent, 'Acheter · 14,99 €');
  e.demandes[0].resoudre({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/tardif' }) });
  await flush();
  assert.deepEqual(e.redirections, []);
});

test('une nouvelle tentative après attente conserve la référence Stripe et ouvre le paiement', async () => {
  const e = environnement();
  e.window.tjdAcheter('fiche-da-l2-s1', e.bouton); await flush();
  const reference = e.demandes[0].attemptId;
  e.expirer(); await flush();
  e.repondre('succes');
  e.window.tjdAcheter('fiche-da-l2-s1', e.bouton); await flush();
  assert.equal(e.demandes[1].attemptId, reference);
  assert.deepEqual(e.redirections, ['https://checkout.stripe.com/paiement']);
  assert.equal(e.timers.size, 0);
});

test('un double clic lance une seule requête et le retour navigateur rétablit le bouton', async () => {
  const e = environnement();
  e.repondre('succes');
  e.window.tjdAcheter('fiche-da-l2-s1', e.bouton);
  e.window.tjdAcheter('fiche-da-l2-s1', e.bouton); await flush();
  assert.equal(e.demandes.length, 1);
  e.evenements.pageshow({ persisted: true });
  assert.equal(e.bouton.disabled, false);
  assert.equal(e.bouton.textContent, 'Acheter · 14,99 €');
});

test('une erreur de connexion synchrone libère également le bouton', async () => {
  const e = environnement();
  e.repondre('erreur');
  assert.doesNotThrow(() => e.window.tjdAcheter('fiche-da-l2-s1', e.bouton));
  await flush();
  assert.equal(e.bouton.disabled, false);
  assert.equal(e.messages.length, 1);
  assert.equal(e.timers.size, 0);
});


const panierInitial = [{ id: 'fiche-da-l2-s1', nom: 'Fiche Droit administratif', prixCentimes: 1499 }];

test('le panier reste occupé après un nouveau rendu et un double clic lance une seule requête', async () => {
  const e = environnement({ panier: panierInitial });
  e.window.__payerPanier();
  e.window.__rendrePanier();
  assert.equal(e.bouton.disabled, true);
  e.window.__payerPanier(); await flush();
  assert.equal(e.demandes.length, 1);
  e.expirer(); await flush();
  assert.equal(e.bouton.disabled, false);
  assert.equal(e.bouton.textContent, 'Passer au paiement');
});

test('le délai du panier ignore une réponse tardive et le réessai conserve sa référence', async () => {
  const e = environnement({ panier: panierInitial });
  e.window.__payerPanier(); await flush();
  const reference = e.demandes[0].attemptId;
  e.expirer(); await flush();
  e.demandes[0].resoudre({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/tardif' }) });
  await flush();
  assert.deepEqual(e.redirections, []);
  e.repondre('succes');
  e.window.__payerPanier(); await flush();
  assert.equal(e.demandes[1].attemptId, reference);
  assert.deepEqual(e.redirections, ['https://checkout.stripe.com/paiement']);
  assert.equal(e.timers.size, 0);
  e.evenements.pageshow({ persisted: true });
  assert.equal(e.bouton.disabled, false);
  assert.equal(e.bouton.textContent, 'Passer au paiement');
});

test('le retour du paiement rétablit toutes les croix du panier conservé par le navigateur', async () => {
  const panier = [...panierInitial, { id: 'fiche-da-l2-s2', nom: 'Fiche S2', prixCentimes: 1999 }];
  const e = environnement({ panier });
  e.repondre('succes');
  e.window.__payerPanier();
  await flush();
  assert.equal(e.demandes.length, 1);
  assert.deepEqual(e.redirections, ['https://checkout.stripe.com/paiement']);
  assert.equal(e.bouton.disabled, true);
  assert.deepEqual(e.retraits.map(bouton => bouton.disabled), [true, true]);

  e.evenements.pageshow({ persisted: false });
  assert.deepEqual(e.retraits.map(bouton => bouton.disabled), [true, true]);

  e.evenements.pageshow({ persisted: true });
  assert.equal(e.bouton.disabled, false);
  assert.equal(e.bouton.textContent, 'Passer au paiement');
  assert.deepEqual(e.retraits.map(bouton => bouton.disabled), [false, false]);
  assert.equal(e.demandes.length, 1);
});

test('le panier attend la fin de la demande si le navigateur restaure la page pendant le chargement', async () => {
  const e = environnement({ panier: panierInitial });
  e.window.__payerPanier();
  await flush();
  e.evenements.pageshow({ persisted: true });
  assert.equal(e.bouton.disabled, true);
  assert.equal(e.retraits[0].disabled, true);
  e.window.__payerPanier();
  await flush();
  assert.equal(e.demandes.length, 1);

  e.demandes[0].resoudre({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/paiement' }) });
  await flush();
  assert.deepEqual(e.redirections, ['https://checkout.stripe.com/paiement']);
  e.evenements.pageshow({ persisted: true });
  assert.equal(e.bouton.disabled, false);
  assert.equal(e.retraits[0].disabled, false);
});

test('un panier modifié après le délai reçoit une nouvelle référence de paiement', async () => {
  const e = environnement({ panier: panierInitial });
  e.window.__payerPanier(); await flush();
  const reference = e.demandes[0].attemptId;
  e.expirer(); await flush();
  e.remplacerPanier([{ id: 'maj-da-l2-s1', nom: 'Majeures Droit administratif', prixCentimes: 1499 }]);
  e.repondre('succes');
  e.window.__payerPanier(); await flush();
  assert.notEqual(e.demandes[1].attemptId, reference);
  assert.deepEqual(e.demandes[1].produitIds, ['maj-da-l2-s1']);
  assert.deepEqual(e.redirections, ['https://checkout.stripe.com/paiement']);
});

for (const [mode, articles] of [['achat direct', null], ['panier', panierInitial]]) {
  test(`le retour du catalogue en ${mode} réserve la reprise locale à une redirection réussie`, async () => {
    const e = environnement({ panier: articles });
    const appels = [];
    e.window.location.search = '?niveau=l2&recherche=confidentiel-factice';
    e.window.location.hash = '#a-l-unite';
    e.window.tjdRetourCatalogue = {
      adresse() { return 'formations.html#retour-paiement'; },
      memoriser(adresse) { appels.push(['memoire', adresse]); }
    };
    e.window.location.assign = url => appels.push(['redirection', url]);
    function lancer() {
      if (articles) e.window.__payerPanier();
      else e.window.tjdAcheter('fiche-da-l2-s1', e.bouton);
    }
    e.repondre('erreur'); lancer(); await flush();
    assert.deepEqual(appels, []);
    e.repondre('succes'); lancer(); await flush();
    assert.equal(e.demandes.length, 2);
    for (const demande of e.demandes) {
      assert.equal(demande.pageActuelle, 'formations.html#retour-paiement');
      assert.doesNotMatch(JSON.stringify(demande), /confidentiel-factice|niveau=l2/);
    }
    assert.deepEqual(appels, [
      ['memoire', 'formations.html#retour-paiement'],
      ['redirection', 'https://checkout.stripe.com/paiement'],
    ]);
  });
}

test('le retour depuis une autre page reste celui de la page et de son ancre', async () => {
  const e = environnement();
  e.window.location.pathname = '/contrats-speciaux-l3.html';
  e.window.location.hash = '#programme';
  e.repondre('succes');
  e.window.tjdAcheter('fiche-contrats-speciaux-l3', e.bouton);
  await flush();
  assert.equal(e.demandes[0].pageActuelle, 'contrats-speciaux-l3.html#programme');
  assert.deepEqual(e.redirections, ['https://checkout.stripe.com/paiement']);
});
