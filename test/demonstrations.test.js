const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/demonstrations.js'), 'utf8');

function environnement(options = {}) {
  const matomo = [], ga4 = [], reperes = [];
  const elements = new Map();
  function element(id, attributs = {}) {
    const listeners = {};
    const e = {
      id, attributs, open: false, disabled: false,
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
      emit(type, cible = e) {
        const event = { target: cible, defaultPrevented: false };
        for (const fn of listeners[type] || []) fn(event);
        return event;
      },
      getAttribute: (nom) => attributs[nom] ?? null,
      hasAttribute: (nom) => Object.hasOwn(attributs, nom),
      closest: () => e,
      contains: (cible) => cible.parent === e,
      querySelector: () => e.repere,
    };
    elements.set(id, e);
    return e;
  }
  const blocs = ['extrait-fiche-intro', 'exemple-flashcards-qcm', 'exemple-loyaute-preuve', 'essai-memorisation-intro'];
  for (const id of blocs) {
    const e = element(id);
    e.repere = element(id + '-repere');
  }
  element('demo-flashcard-reponse');
  element('demo-qcm-corrige');
  const docListeners = {};
  const document = {
    readyState: options.loading ? 'loading' : 'complete', hidden: !!options.hidden,
    getElementById: (id) => elements.get(id) || null,
    addEventListener: (type, fn) => { docListeners[type] = fn; },
  };
  let callback;
  const window = {
    location: { hostname: 'trajectoiredroit.com', protocol: 'https:', search: '', pathname: '/flashcards-qcm.html', ...options.location },
    tjdTestInterne: !!options.interne,
    _paq: { push(data) { if (options.panne === 'matomo') throw Error('panne'); matomo.push(data); } },
    gtag(...data) { if (options.panne === 'ga4') throw Error('panne'); ga4.push(data); },
    IntersectionObserver: options.sansObserver ? undefined : class {
      constructor(fn) { callback = fn; }
      observe(e) { reperes.push(e); }
      disconnect() { reperes.length = 0; }
    },
  };
  const localStorage = { getItem() { if (options.stockageBloque) throw Error('bloqué'); return options.stockage || null; } };
  vm.runInNewContext(source, { window, document, localStorage, URLSearchParams });
  return {
    matomo, ga4, elements, document, docListeners, reperes,
    afficher(id, ratio = 1) { callback([{ target: elements.get(id).repere, isIntersecting: ratio > 0, intersectionRatio: ratio }]); },
    action(bloc, attributs, options = {}) {
      const cible = element('cible-' + elements.size, attributs);
      Object.assign(cible, { parent: elements.get(bloc), ...options });
      return elements.get(bloc).emit('click', cible);
    },
    actions: () => matomo.map((ligne) => ligne.slice(2).join(':')),
  };
}

test('une page chargée ne compte pas un exemple non visible; une exposition se compte une fois', () => {
  const e = environnement();
  assert.equal(e.matomo.length, 0);
  e.afficher('extrait-fiche-intro', 0.49);
  assert.equal(e.matomo.length, 0);
  e.afficher('extrait-fiche-intro', 0.5);
  e.afficher('extrait-fiche-intro');
  assert.deepEqual(e.actions(), ['ExempleVisible:clarte_intro']);
  assert.equal(e.ga4[0][1], 'demo_view');
  assert.equal(e.ga4[0][2].demo_id, 'clarte_intro');
});

test('les trois extraits sont distingués et un onglet masqué ne crée pas une exposition', () => {
  const e = environnement({ hidden: true });
  e.afficher('exemple-loyaute-preuve');
  assert.equal(e.matomo.length, 0);
  e.document.hidden = false;
  e.docListeners.visibilitychange();
  assert.equal(e.reperes.length, 3);
  e.afficher('exemple-loyaute-preuve');
  e.afficher('exemple-flashcards-qcm');
  assert.deepEqual(e.actions(), ['ExempleVisible:methode_loyaute', 'ExempleVisible:memorisation_intro']);
});

test('la carte, le premier choix QCM et le corrigé ont chacun leur compteur sans recueillir la réponse', () => {
  const e = environnement();
  for (const id of ['demo-flashcard-reponse', 'demo-qcm-corrige']) {
    const detail = e.elements.get(id);
    detail.emit('toggle');
    detail.open = true; detail.emit('toggle');
    detail.open = false; detail.emit('toggle');
    detail.open = true; detail.emit('toggle');
  }
  const memo = e.elements.get('exemple-flashcards-qcm');
  memo.emit('change', { name: 'autre', checked: true });
  memo.emit('change', { name: 'demo-memorisation-intro', checked: false });
  memo.emit('change', { name: 'demo-memorisation-intro', checked: true, value: 'B' });
  memo.emit('change', { name: 'demo-memorisation-intro', checked: true, value: 'A' });
  assert.deepEqual(e.actions(), [
    'ExempleVisible:memorisation_intro', 'ReponseFlashcard:memorisation_intro',
    'CorrigeQcm:memorisation_intro', 'ChoixQcm:memorisation_intro',
  ]);
  assert.ok(!JSON.stringify([e.matomo, e.ga4]).includes('"value"'));
});

test('les boutons de démonstration se distinguent du catalogue et restent accessibles', () => {
  const e = environnement();
  e.action('extrait-fiche-intro', { 'data-tjd-produit': 'autre-produit' });
  e.action('extrait-fiche-intro', { 'data-tjd-produit': 'fiche-intro-droit-l1' }, { parent: null });
  e.action('extrait-fiche-intro', { 'data-tjd-produit': 'fiche-intro-droit-l1' }, { disabled: true });
  assert.equal(e.matomo.length, 0);
  const evenement = e.action('extrait-fiche-intro', { 'data-apercu': 'images' });
  e.action('extrait-fiche-intro', { 'data-tjd-produit': 'fiche-intro-droit-l1' });
  e.action('exemple-flashcards-qcm', { 'data-tjd-produit': 'flashcards-qcm-intro-droit-l1' });
  e.action('exemple-loyaute-preuve', { 'data-demonstration-cta': '' });
  assert.equal(evenement.defaultPrevented, false);
  assert.ok(e.actions().includes('ApercuFiche:clarte_intro'));
  assert.ok(e.actions().includes('ClicAcheter:clarte_intro'));
  assert.ok(e.actions().includes('ClicAcheter:memorisation_intro'));
  assert.ok(e.actions().includes('ProgrammeStage:methode_loyaute'));
});

test('le lien du quiz mesure uniquement le passage vers les exemples de mémorisation', () => {
  const e = environnement();
  e.action('essai-memorisation-intro', { href: 'formations.html' });
  e.action('essai-memorisation-intro', { href: 'flashcards-qcm.html#exemple-flashcards-qcm' });
  e.action('essai-memorisation-intro', { href: 'flashcards-qcm.html#exemple-flashcards-qcm' });
  assert.deepEqual(e.actions(), ['VersMemorisation:quiz_intro']);
});

for (const [nom, options] of [
  ['paramètre interne', { location: { search: '?tjd_test=1' } }],
  ['mode interne persistant', { stockage: '1' }],
  ['indicateur interne global', { interne: true }],
  ['localhost', { location: { hostname: 'localhost', protocol: 'http:' } }],
  ['adresse IP locale', { location: { hostname: '127.0.0.1', protocol: 'http:' } }],
  ['fichier local', { location: { protocol: 'file:' } }],
  ['prévisualisation Vercel', { location: { hostname: 'trajectoiredroit-test.vercel.app' } }],
]) {
  test(`${nom} est exclu des compteurs`, () => {
    const e = environnement(options);
    e.action('exemple-loyaute-preuve', { 'data-demonstration-cta': '' });
    assert.equal(e.matomo.length + e.ga4.length, 0);
    assert.equal(e.reperes.length, 0);
  });
}

test('la sortie explicite du mode interne et le domaine www sont admis', () => {
  const e = environnement({ stockage: '1', interne: true, location: { search: '?tjd_test=0', hostname: 'www.trajectoiredroit.com' } });
  e.afficher('extrait-fiche-intro');
  assert.equal(e.matomo.length, 1);
});

test('sans observer ou sans stockage, les interactions continuent à être mesurées', () => {
  const e = environnement({ sansObserver: true, stockageBloque: true });
  const evenement = e.action('exemple-loyaute-preuve', { 'data-demonstration-cta': '' });
  assert.equal(evenement.defaultPrevented, false);
  assert.deepEqual(e.actions(), ['ExempleVisible:methode_loyaute', 'ProgrammeStage:methode_loyaute']);
});

for (const panne of ['ga4', 'matomo']) {
  test(`une panne ${panne} ne bloque ni le bouton ni l'autre outil`, () => {
    const e = environnement({ panne });
    const evenement = e.action('extrait-fiche-intro', { 'data-tjd-produit': 'fiche-intro-droit-l1' });
    assert.equal(evenement.defaultPrevented, false);
    assert.equal((panne === 'ga4' ? e.matomo : e.ga4).length, 2);
  });
}

test('le script attend le DOM quand il est chargé avant les exemples', () => {
  const e = environnement({ loading: true });
  assert.equal(e.reperes.length, 0);
  e.docListeners.DOMContentLoaded();
  assert.equal(e.reperes.length, 3);
});
