const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../assets/js/achat.js'), 'utf8');
const debut = source.indexOf('  function panierInjecterMarkup() {');
const fin = source.indexOf('  function panierRendreListe()', debut);

function environnement(avecGestionCommune = false) {
  const ids = {}, ecouteurs = {}, appels = [];
  const document = { addEventListener(nom, fn) { ecouteurs[nom] = fn; }, querySelector: () => null, getElementById: (id) => ids[id] };
  function element() {
    const attrs = {}, classes = new Set(), handlers = {};
    const el = {
      children: [], inert: false, style: {}, isConnected: true, handlers,
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      setAttribute: (nom, val) => { attrs[nom] = val; },
      getAttribute: (nom) => Object.hasOwn(attrs, nom) ? attrs[nom] : null,
      removeAttribute: (nom) => { delete attrs[nom]; },
      appendChild(enfant) { el.children.push(enfant); },
      addEventListener(nom, fn) { handlers[nom] = fn; },
      getClientRects: () => [1], focus() { document.activeElement = el; },
      contains(cible) { return cible === el || el.children.some((enfant) => enfant.contains(cible)); },
      querySelectorAll() { return el.children.filter((enfant) => enfant.tagName === 'BUTTON' || enfant.tagName === 'A' || enfant.getAttribute('tabindex') !== null); },
      querySelector(selecteur) { return el.children.find((enfant) => selecteur.includes('data-tjd-panier-fermer') && enfant.getAttribute('data-tjd-panier-fermer') !== null); }
    };
    Object.defineProperty(el, 'id', { set(id) { ids[id] = el; }, get() { return Object.keys(ids).find((id) => ids[id] === el); } });
    Object.defineProperty(el, 'innerHTML', { set(html) {
      if (!html.includes('tjd-panier-panel')) return;
      for (const balise of html.matchAll(/<(button|h2|div|p)\b([^>]*)>/g)) {
        const attributs = balise[2];
        if (!attributs.includes('id=') && !attributs.includes('data-tjd-panier-fermer')) continue;
        const enfant = element(); enfant.tagName = balise[1].toUpperCase();
        for (const attribut of attributs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) enfant.setAttribute(attribut[1], attribut[2] || '');
        const id = attributs.match(/id="([^"]+)"/); if (id) enfant.id = id[1];
        el.children.push(enfant);
      }
    } });
    return el;
  }
  document.createElement = element;
  document.body = element(); document.body.style.overflow = 'auto';
  const fond = element(); document.body.appendChild(fond);
  const window = {};
  if (avecGestionCommune) window.tjdDialogues = {
    ouvrir(noeud, premier, retour) { appels.push(['ouvrir', noeud, premier, retour]); noeud.classList.add('open'); premier.focus(); },
    fermer(noeud) { appels.push(['fermer', noeud]); noeud.classList.remove('open'); appels[0][3].focus(); }
  };
  vm.runInNewContext(source.slice(debut, fin) + '\npanierInjecterMarkup();', { document, window, panierRendreListe() {}, panierCheckout() {} });
  const fab = ids.tjdPanierFab, panneau = ids.tjdPanierBackdrop, fermer = panneau.querySelector('[data-tjd-panier-fermer]');
  return { document, ecouteurs, appels, fond, fab, panneau, fermer, cta: ids.tjdPanierCta };
}

test('le panier emploie le dialogue commun et conserve son titre accessible', () => {
  const e = environnement(true);
  e.fab.focus(); e.fab.handlers.click();
  assert.equal(e.panneau.getAttribute('role'), 'dialog');
  assert.equal(e.panneau.getAttribute('aria-labelledby'), 'tjdPanierTitre');
  assert.equal(e.appels[0][0], 'ouvrir');
  assert.equal(e.document.activeElement, e.fermer);
  e.panneau.handlers.click({ target: e.panneau });
  assert.equal(e.appels[1][0], 'fermer');
  assert.equal(e.document.activeElement, e.fab);
});

test('sans main.js, le panier retient Tab puis rend le clavier après Échap', () => {
  const e = environnement();
  e.fab.focus(); e.fab.handlers.click();
  assert.equal(e.fond.inert, true);
  assert.equal(e.document.activeElement, e.fermer);
  e.ecouteurs.keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(e.document.activeElement, e.cta);
  e.ecouteurs.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(e.panneau.classList.contains('open'), false);
  assert.equal(e.document.activeElement, e.fab);
  assert.equal(e.fond.inert, false);
  assert.equal(e.document.body.style.overflow, 'auto');
});
