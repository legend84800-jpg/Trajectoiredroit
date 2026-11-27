const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../assets/js/achat.js'), 'utf8');
const debut = source.indexOf('  function panierInjecterMarkup() {');
const fin = source.indexOf('  function panierRendreListe()', debut);

function environnement(avecGestionCommune = false, avecHistorique = false) {
  const ids = {}, ecouteurs = {}, appels = [], ecouteursFenetre = {}, ajouts = [];
  const document = { addEventListener(nom, fn) { ecouteurs[nom] = fn; }, querySelector: () => null, querySelectorAll: () => [...ajouts], getElementById: (id) => ids[id] };
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
      getClientRects: () => el.hidden ? [] : [1], focus(options) { document.activeElement = el; el.optionsFocus = options; },
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
        enfant.hidden = enfant.getAttribute('hidden') !== null;
        enfant.closest = (selecteur) => selecteur === '[data-tjd-panier-fermer]' && enfant.getAttribute('data-tjd-panier-fermer') !== null ? enfant : null;
        el.children.push(enfant);
      }
    } });
    return el;
  }
  document.createElement = element;
  document.body = element(); document.body.style.overflow = 'auto';
  const fond = element(); document.body.appendChild(fond);
  const pageCatalogue = '/formations.html?niveau=l2#fiche-da-l2-s2';
  const etatCatalogue = { filtre: 'L2', lecture: { page: 2 } };
  const entrees = [{ url: '/', etat: null }, { url: pageCatalogue, etat: etatCatalogue }];
  let position = 1;
  let retourDiffere = false;
  let retoursDemandes = 0;
  function avancer(sens) {
    const cible = position + sens;
    if (cible < 0 || cible >= entrees.length) return;
    position = cible;
    ecouteursFenetre.popstate?.({ state: entrees[position].etat });
  }
  const defilements = [];
  const window = {
    location: { get href() { return entrees[position].url; } },
    scrollX: 0, scrollY: 742, innerHeight: 844,
    scrollTo(position) { defilements.push(position); },
    setTimeout(fn) { fn(); },
    addEventListener(nom, fn) { ecouteursFenetre[nom] = fn; }
  };
  if (avecHistorique) window.history = {
    get state() { return entrees[position].etat; },
    get url() { return entrees[position].url; },
    get length() { return entrees.length; },
    pushState(etat, _, url = this.url) { entrees.splice(++position, entrees.length, { url, etat }); },
    back() { retoursDemandes++; if (!retourDiffere) avancer(-1); },
  };
  let retourDialogue, optionsRetourDialogue, fermerSurEchap;
  if (avecGestionCommune) window.tjdDialogues = {
    ouvrir(noeud, premier, retour, options, echap) {
      appels.push(['ouvrir', noeud, premier, retour]);
      retourDialogue = retour;
      optionsRetourDialogue = options;
      fermerSurEchap = echap;
      noeud.classList.add('open');
      premier.focus();
    },
    fermer(noeud) {
      appels.push(['fermer', noeud]);
      noeud.classList.remove('open');
      const retour = typeof retourDialogue === 'function' ? retourDialogue() : retourDialogue;
      retour?.focus(optionsRetourDialogue);
    }
  };
  vm.runInNewContext(source.slice(debut, fin) + '\npanierInjecterMarkup();', { document, window, panierRendreListe() {}, panierCheckout() {} });
  const fab = ids.tjdPanierFab, panneau = ids.tjdPanierBackdrop, fermer = panneau.querySelector('[data-tjd-panier-fermer]');
  return {
    document, ecouteurs, appels, fond, fab, panneau, fermer, cta: ids.tjdPanierCta, continuer: ids.tjdPanierContinuer,
    ajouterBoutonEnVue() {
      const bouton = element();
      bouton.getBoundingClientRect = () => ({ top: 100, bottom: 140, height: 40 });
      ajouts.push(bouton);
      return bouton;
    },
    historique: window.history, pageCatalogue, etatCatalogue, avancer, defilements,
    fermerSurEchap: () => fermerSurEchap(),
    differerRetour() { retourDiffere = true; },
    get retoursDemandes() { return retoursDemandes; }
  };
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


test('Retour ferme le panier, conserve la page et son état, puis retrouve la page précédente', () => {
  const e = environnement(true, true);
  e.fab.handlers.click();
  e.fab.handlers.click();
  assert.equal(e.historique.url, e.pageCatalogue);
  assert.equal(e.historique.length, 3);
  assert.equal(e.historique.state.filtre, e.etatCatalogue.filtre);
  assert.deepEqual(e.historique.state.lecture, e.etatCatalogue.lecture);
  assert.equal(e.historique.state.tjdPanier, true);

  e.avancer(-1);
  assert.equal(e.panneau.classList.contains('open'), false);
  assert.equal(e.historique.state, e.etatCatalogue);
  assert.equal(e.historique.url, e.pageCatalogue);
  assert.equal(e.document.activeElement, e.fab);
  assert.equal(e.fab.optionsFocus.preventScroll, true);
  assert.equal(e.defilements.length, 1);
  assert.equal(e.defilements[0].top, 742);

  e.avancer(-1);
  assert.equal(e.defilements.length, 1);
  assert.equal(e.historique.url, '/');
});

test('la croix et Échap consomment la même entrée avant le Retour suivant', () => {
  const e = environnement(true, true);
  e.fab.handlers.click();
  e.panneau.handlers.click({ target: e.panneau });
  assert.equal(e.panneau.classList.contains('open'), false);
  assert.equal(e.historique.state, e.etatCatalogue);

  e.fab.handlers.click();
  assert.equal(e.historique.length, 3);
  e.differerRetour();
  e.fermerSurEchap();
  e.panneau.handlers.click({ target: e.panneau });
  assert.equal(e.retoursDemandes, 2);
  e.avancer(-1);
  assert.equal(e.panneau.classList.contains('open'), false);
  assert.equal(e.historique.state, e.etatCatalogue);
  e.avancer(-1);
  assert.equal(e.historique.url, '/');
});

test('le navigateur peut rouvrir le panier en avançant dans l’historique', () => {
  const e = environnement(false, true);
  e.fab.handlers.click();
  e.avancer(-1);
  assert.equal(e.panneau.classList.contains('open'), false);
  e.avancer(1);
  assert.equal(e.panneau.classList.contains('open'), true);
  assert.equal(e.document.activeElement, e.fermer);
});


test('l’action du panier vide ferme le panneau et rend le clavier à une action visible', () => {
  const e = environnement(true, true);
  const ajout = e.ajouterBoutonEnVue();
  e.fab.handlers.click();

  e.fab.tabIndex = -1;
  assert.equal(e.continuer.getAttribute('aria-describedby'), 'tjdPanierEtatVide');
  e.continuer.hidden = false;
  e.continuer.focus();
  e.panneau.handlers.click({ target: e.continuer });

  assert.equal(e.panneau.classList.contains('open'), false);
  assert.equal(e.historique.state, e.etatCatalogue);
  assert.equal(e.historique.url, e.pageCatalogue);
  assert.equal(e.document.activeElement, ajout);
  assert.equal(ajout.optionsFocus.preventScroll, true);
  assert.equal(e.defilements.at(-1).top, 742);
});
