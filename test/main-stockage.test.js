const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/main.js'), 'utf8');

function contexteAvecStockage(contenu, stockages, gettersRefuses) {
  const contexte = vm.createContext({ ...contenu, DOMException, __stockages: stockages, __gettersRefuses: gettersRefuses });
  // Les getters sont créés dans la VM, comme les propriétés globales du navigateur.
  vm.runInContext(`(function () {
    const stockages = __stockages;
    const refuses = __gettersRefuses;
    delete globalThis.__stockages;
    delete globalThis.__gettersRefuses;
    Object.keys(stockages).forEach(function (nom) {
      const descripteur = { get() {
        if (refuses) throw new DOMException('Accès interdit', 'SecurityError');
        return stockages[nom];
      } };
      Object.defineProperty(globalThis, nom, descripteur);
      if (typeof window !== 'undefined') Object.defineProperty(window, nom, descripteur);
    });
  })();`, contexte);
  if (gettersRefuses) {
    for (const nom of Object.keys(stockages)) {
      assert.equal(vm.runInContext(`(function () { try { ${nom}; } catch (erreur) { return erreur.name; } })();`, contexte), 'SecurityError');
    }
  }
  return contexte;
}

function element() {
  const classes = new Set();
  const attributs = {};
  const enfants = new Map();
  const ecouteurs = {};
  return {
    style: {}, ecouteurs, ajoutsOpen: 0,
    classList: {
      add(nom) { classes.add(nom); },
      remove(nom) { classes.delete(nom); },
      contains(nom) { return classes.has(nom); },
      toggle(nom) { if (classes.has(nom)) { classes.delete(nom); return false; } classes.add(nom); return true; }
    },
    setAttribute(nom, valeur) { attributs[nom] = valeur; },
    getAttribute(nom) { return attributs[nom] || null; },
    removeAttribute(nom) { delete attributs[nom]; },
    addEventListener(nom, action) { (ecouteurs[nom] ||= []).push(action); },
    appendChild() {}, insertBefore() {}, focus() {},
    querySelector(selecteur) {
      if (!enfants.has(selecteur)) enfants.set(selecteur, element());
      return enfants.get(selecteur);
    },
    querySelectorAll() { return []; }
  };
}

function environnement({ gettersRefuses = false, ecritureRefusee = false, dejaVu = false } = {}) {
  let maintenant = 0;
  const minuteries = [];
  const ecouteursDocument = {};
  const ecouteursFenetre = {};
  const memoire = { localStorage: {}, sessionStorage: dejaVu ? { exitShown: '1' } : {} };
  const modal = element();
  const ajouterClasse = modal.classList.add;
  modal.classList.add = (nom) => { if (nom === 'open') modal.ajoutsOpen++; ajouterClasse(nom); };
  const burger = element();
  const mobileNav = element();
  // Ces deux actions existent seulement sur les pages qui les affichent.
  mobileNav.querySelector = () => null;
  const elements = { exitModal: modal, burgerBtn: burger, mobileNav };
  const document = {
    readyState: 'loading', referrer: '', body: element(), documentElement: element(),
    getElementById(id) { return elements[id] || null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement: element,
    addEventListener(nom, action) { (ecouteursDocument[nom] ||= []).push(action); }
  };
  document.documentElement.scrollHeight = 3000;
  const fenetre = {
    location: { search: '', pathname: '/majeures-preparees.html', hash: '' },
    scrollY: 300, innerHeight: 844,
    matchMedia: () => ({ matches: false }),
    addEventListener(nom, action) { (ecouteursFenetre[nom] ||= []).push(action); }
  };
  const contenu = {
    window: fenetre, document, URLSearchParams,
    Date: class extends Date { static now() { return maintenant; } },
    setTimeout(action, delai) { minuteries.push({ action, delai }); },
    clearTimeout() {}
  };
  const stockages = {};
  for (const nom of ['localStorage', 'sessionStorage']) {
    stockages[nom] = {
      getItem(cle) { return memoire[nom][cle] || null; },
      setItem(cle, valeur) {
        if (ecritureRefusee) throw new DOMException('Écriture interdite', 'SecurityError');
        memoire[nom][cle] = valeur;
      },
      removeItem(cle) { delete memoire[nom][cle]; }
    };
  }
  const contexte = contexteAvecStockage(contenu, stockages, gettersRefuses);
  // Aucun remplacement du script, et les initialisations différées sont exécutées.
  vm.runInContext(source, contexte);
  document.readyState = 'interactive';
  for (const action of ecouteursDocument.DOMContentLoaded || []) action();
  return {
    modal, burger, mobileNav, memoire, minuteries, ecouteursDocument,
    attendre() {
      maintenant = 60000;
      for (const minuterie of minuteries.filter((item) => item.delai === 60000)) minuterie.action();
    }
  };
}

test('main termine son initialisation quand les deux getters de stockage jettent SecurityError', () => {
  const env = environnement({ gettersRefuses: true });
  // Le formulaire est initialisé après la lecture exitShown qui bloquait le script.
  assert.equal(env.ecouteursDocument.submit.length, 1);
  env.burger.ecouteurs.click[0]();
  assert.equal(env.mobileNav.hidden, false);
  assert.equal(env.mobileNav.classList.contains('open'), true);
  assert.doesNotThrow(() => env.attendre());
  assert.equal(env.modal.classList.contains('open'), true);
  env.modal.ecouteurs.click[0]({ target: env.modal });
  env.attendre();
  assert.equal(env.modal.ajoutsOpen, 1);
  assert.equal(env.modal.classList.contains('open'), false);
});

test('la fenêtre de sortie fonctionne une fois par page si seule son écriture est refusée', () => {
  const env = environnement({ ecritureRefusee: true });
  assert.doesNotThrow(() => env.attendre());
  assert.equal(env.modal.classList.contains('open'), true);
  env.attendre();
  assert.equal(env.modal.ajoutsOpen, 1);
  assert.equal(env.memoire.sessionStorage.exitShown, undefined);
});

test('la fenêtre de sortie conserve son comportement lorsque le stockage fonctionne', () => {
  const env = environnement();
  env.attendre();
  assert.equal(env.memoire.sessionStorage.exitShown, '1');
  assert.equal(env.modal.classList.contains('open'), true);
  const dejaVu = environnement({ dejaVu: true });
  dejaVu.attendre();
  assert.equal(dejaVu.modal.classList.contains('open'), false);
  assert.equal(dejaVu.ecouteursDocument.submit.length, 1);
});

const html = fs.readFileSync(path.join(__dirname, '../majeures-preparees.html'), 'utf8');
const scriptTheme = html.match(/<script>(\/\* anti-flash dark mode[\s\S]*?)<\/script>/);
assert.ok(scriptTheme, 'Le script du thème doit être présent dans la page Majeures.');

for (const valeur of ['dark', null, 'SecurityError']) {
  test(`le thème initial reste utilisable avec le stockage ${valeur || 'vide'}`, () => {
    const racine = element();
    const contexte = contexteAvecStockage(
      { document: { documentElement: racine } },
      { localStorage: { getItem: () => valeur } },
      valeur === 'SecurityError'
    );
    assert.doesNotThrow(() => vm.runInContext(scriptTheme[1], contexte));
    assert.equal(racine.getAttribute('data-theme'), valeur === 'dark' ? 'dark' : null);
  });
}
