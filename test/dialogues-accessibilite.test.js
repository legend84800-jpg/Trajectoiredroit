const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/main.js'), 'utf8');
const code = source.slice(source.indexOf('window.tjdDialogues ='), source.indexOf('/* ----- RECHERCHE SITE-WIDE -----'));

function environnement() {
  const ecouteurs = {};
  const document = {
    addEventListener(nom, fn) { ecouteurs[nom] = fn; },
    dispatchEvent() {}
  };
  function element() {
    const attrs = {}, classes = new Set();
    const el = {
      isConnected: true, inert: false, children: [], style: {},
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      getAttribute: (nom) => Object.hasOwn(attrs, nom) ? attrs[nom] : null,
      setAttribute: (nom, val) => { attrs[nom] = val; },
      removeAttribute: (nom) => { delete attrs[nom]; },
      getClientRects: () => [1],
      focus() { document.activeElement = el; },
      contains(cible) { return el === cible || el.children.some((enfant) => enfant.contains(cible)); },
      querySelectorAll() { return el.children; }
    };
    return el;
  }
  const page = element(), declencheur = element(), modal = element(), fermer = element(), dernier = element();
  const viewer = element(), fermerViewer = element();
  page.children = [declencheur]; modal.children = [fermer, dernier]; viewer.children = [fermerViewer];
  document.body = { children: [page, modal, viewer], style: { overflow: 'auto' } };
  document.activeElement = declencheur;
  const contexte = vm.createContext({ window: {}, document, CustomEvent: class { constructor(nom) { this.type = nom; } } });
  vm.runInContext(code, contexte);
  function touche(key, shiftKey = false) {
    const evenement = { key, shiftKey, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
    ecouteurs.keydown(evenement);
    return evenement;
  }
  return { api: contexte.window.tjdDialogues, document, page, declencheur, modal, fermer, dernier, viewer, fermerViewer, touche };
}

test('la fenêtre reçoit le clavier et le rend au bouton après Échap', () => {
  const e = environnement();
  e.api.ouvrir(e.modal, e.fermer, e.declencheur);
  assert.equal(e.document.activeElement, e.fermer);
  assert.equal(e.page.inert, true);
  assert.equal(e.document.body.style.overflow, 'hidden');
  e.touche('Escape');
  assert.equal(e.document.activeElement, e.declencheur);
  assert.equal(e.page.inert, false);
  assert.equal(e.page.getAttribute('aria-hidden'), null);
  assert.equal(e.document.body.style.overflow, 'auto');
});

test('Tab et Maj Tab restent dans la fenêtre ouverte', () => {
  const e = environnement();
  e.api.ouvrir(e.modal, e.fermer, e.declencheur);
  e.dernier.focus();
  assert.equal(e.touche('Tab').prevented, true);
  assert.equal(e.document.activeElement, e.fermer);
  assert.equal(e.touche('Tab', true).prevented, true);
  assert.equal(e.document.activeElement, e.dernier);
});

test('Échap ferme d’abord l’agrandissement et revient à son extrait', () => {
  const e = environnement();
  e.api.ouvrir(e.modal, e.fermer, e.declencheur);
  e.api.ouvrir(e.viewer, e.fermerViewer, e.dernier);
  assert.equal(e.viewer.inert, false);
  assert.equal(e.viewer.getAttribute('aria-hidden'), null);
  e.touche('Escape');
  assert.equal(e.modal.classList.contains('open'), true);
  assert.equal(e.viewer.classList.contains('open'), false);
  assert.equal(e.document.activeElement, e.dernier);
  assert.equal(e.modal.inert, false);
  assert.equal(e.page.inert, true);
  e.touche('Escape');
  assert.equal(e.document.activeElement, e.declencheur);
  assert.equal(e.page.inert, false);
});
