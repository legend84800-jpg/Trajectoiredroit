const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync(require.resolve('../assets/js/main.js'), 'utf8');
const code = source.slice(source.indexOf('// ----- 3. Burger menu mobile'), source.indexOf('// ----- 4. Bascule saisonnière'));

function environnement() {
  const document = { body: { style: { overflow: 'auto' } } };
  function cible(attributs = {}) {
    const classes = new Set();
    const ecouteurs = {};
    const element = {
      style: {},
      tabIndex: 0,
      classList: {
        contains: nom => classes.has(nom),
        toggle(nom, actif) { if (actif) classes.add(nom); else classes.delete(nom); }
      },
      getAttribute: nom => attributs[nom] ?? null,
      setAttribute(nom, valeur) { attributs[nom] = valeur; },
      getClientRects: () => [1],
      addEventListener(nom, agir) { ecouteurs[nom] = agir; },
      emettre(nom, evenement = {}) { ecouteurs[nom]?.(evenement); },
      click() { element.emettre('click', { target: element }); },
      focus() { document.activeElement = element; }
    };
    return element;
  }
  const bouton = cible({ 'aria-label': 'Ouvrir le menu', 'aria-expanded': 'false' });
  const menu = cible();
  const media = Object.assign(cible(), { matches: true });
  const recherche = cible(), declencheurRecherche = cible(), sommaire = cible(), dernier = cible();
  const invisible = cible(), masque = cible(), inactif = cible();
  invisible.getClientRects = () => [];
  masque.visibility = 'hidden';
  inactif.disabled = true;
  let retourRecherche;
  let dialogueOuvert = false;
  declencheurRecherche.addEventListener('click', () => { retourRecherche = document.activeElement; dialogueOuvert = true; });
  const clavier = cible();
  Object.assign(document, {
    getElementById: id => ({ burgerBtn: bouton, mobileNav: menu }[id]),
    querySelector: selecteur => ({
      '.site-header': { getBoundingClientRect: () => ({ bottom: 70 }) },
      '.search-trigger': declencheurRecherche
    }[selecteur]),
    addEventListener: clavier.addEventListener
  });
  menu.hidden = true;
  menu.querySelector = selecteur => selecteur === '[data-mobile-search]' ? recherche : null;
  menu.querySelectorAll = () => [recherche, sommaire, invisible, masque, inactif, dernier];
  const window = { matchMedia: () => media, tjdDialogues: { estOuvert: () => dialogueOuvert } };
  const getComputedStyle = el => ({ visibility: el.visibility || 'visible' });
  runInNewContext(code, { document, window, getComputedStyle });

  function touche(key, shiftKey = false) {
    const evenement = { key, shiftKey, preventDefault() { this.defaultPrevented = true; } };
    clavier.emettre('keydown', evenement);
    return evenement.defaultPrevented === true;
  }
  return { bouton, menu, media, recherche, sommaire, dernier, document, touche, retourRecherche: () => retourRecherche };
}

test('Échap ferme le menu, remet le nom d’ouverture et rend le focus au bouton', () => {
  const e = environnement();
  e.bouton.click();
  assert.equal(e.bouton.getAttribute('aria-label'), 'Fermer le menu');
  assert.equal(e.bouton.getAttribute('aria-expanded'), 'true');
  assert.equal(e.document.body.style.overflow, 'hidden');
  e.dernier.focus();
  assert.equal(e.touche('Escape'), true);
  assert.equal(e.menu.hidden, true);
  assert.equal(e.document.activeElement, e.bouton);
  assert.equal(e.bouton.getAttribute('aria-label'), 'Ouvrir le menu');
  assert.equal(e.bouton.getAttribute('aria-expanded'), 'false');
  assert.equal(e.document.body.style.overflow, 'auto');
  assert.equal(e.touche('Tab'), false);
});

test('Tab boucle sur la croix et les seules commandes visibles du menu', () => {
  const e = environnement();
  e.bouton.click();
  e.bouton.focus();
  for (const cible of [e.recherche, e.sommaire, e.dernier, e.bouton]) {
    assert.equal(e.touche('Tab'), true);
    assert.equal(e.document.activeElement, cible);
  }
  assert.equal(e.touche('Tab', true), true);
  assert.equal(e.document.activeElement, e.dernier);
  assert.equal(e.touche('Enter'), false);
});

test('liens, recherche et passage à la navigation desktop libèrent le défilement', () => {
  const e = environnement();
  e.bouton.click();
  e.menu.emettre('click', { target: { closest: () => null } });
  assert.equal(e.menu.hidden, false);
  e.menu.emettre('click', { target: { closest: () => true } });
  assert.equal(e.menu.hidden, true);
  e.bouton.click();
  e.media.matches = false;
  e.media.emettre('change');
  assert.equal(e.menu.hidden, true);
  assert.equal(e.document.body.style.overflow, 'auto');
  assert.equal(e.touche('Tab'), false);
  e.bouton.click();
  assert.equal(e.menu.hidden, true);
  e.media.matches = true;
  e.bouton.click();
  e.recherche.click();
  assert.equal(e.menu.hidden, true);
  assert.equal(e.document.body.style.overflow, 'auto');
  assert.equal(e.retourRecherche(), e.bouton);
});
