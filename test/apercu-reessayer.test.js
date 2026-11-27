const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../assets/js/main.js'), 'utf8');
const dialogues = source.slice(source.indexOf('window.tjdDialogues ='), source.indexOf('/* ----- RECHERCHE SITE-WIDE'));
const controleur = source.slice(source.indexOf('/* ----- APERÇU PDF'), source.indexOf('/* Sur téléphone, la barre basse'));

function environnement() {
  let focus, optionsRetour;
  function element() {
    const attributs = new Map(), classes = new Set(), ecouteurs = new Map(), controles = new Map();
    return {
      children: [], hidden: false, isConnected: true, style: {},
      classList: {
        add: classe => classes.add(classe), remove: classe => classes.delete(classe),
        contains: classe => classes.has(classe),
        toggle: (classe, actif) => actif ? classes.add(classe) : classes.delete(classe)
      },
      getAttribute: nom => attributs.get(nom) ?? null,
      setAttribute: (nom, valeur) => attributs.set(nom, String(valeur)),
      removeAttribute: nom => attributs.delete(nom),
      addEventListener: (nom, fn) => ecouteurs.set(nom, fn),
      emettre(nom, donnees = {}) {
        const evenement = {
          target: this,
          stopPropagation() { this.arrete = true; },
          stopImmediatePropagation() { this.arrete = true; },
          preventDefault() { this.defaultPrevented = true; },
          ...donnees
        };
        ecouteurs.get(nom)?.(evenement);
        return evenement;
      },
      focus(options) { focus = this; optionsRetour = options; },
      contains(noeud) { return this === noeud || this.children.some(enfant => enfant.contains(noeud)); },
      appendChild(enfant) { this.children.push(enfant); enfant.parentElement = this; },
      set innerHTML(html) {
        this.markup = html;
        this.children.forEach(enfant => { enfant.isConnected = false; });
        this.children = [];
      },
      querySelector(nom) {
        if (!controles.has(nom)) controles.set(nom, element());
        return controles.get(nom);
      },
      querySelectorAll() { return this.children.map(enfant => enfant.children[0]); }
    };
  }

  const declencheur = element();
  const images = ['/assets/apercus/extrait-a.webp', '/assets/apercus/extrait-b.webp?v=2026'];
  declencheur.setAttribute('data-apercu', JSON.stringify(images));
  declencheur.setAttribute('data-apercu-price', '19,99 €');
  declencheur.setAttribute('data-apercu-cta', 'fiche-da-l2-s1');
  const lien = element();
  lien.href = 'https://example.test/assets/apercus/extrait-public.webp';
  lien.pathname = new URL(lien.href).pathname;
  lien.setAttribute('aria-describedby', 'matiere');
  const noeuds = Object.fromEntries(['Title', 'Sub', 'Imgs', 'Etat', 'Price', 'Cta'].map(id => ['apercu' + id, element()]));
  noeuds.matiere = { textContent: 'Droit administratif' };
  const document = Object.assign(element(), {
    baseURI: 'https://example.test/fiche.html', body: element(), createElement: element,
    querySelectorAll: selecteur => selecteur === '[data-apercu]' ? [declencheur] : [lien],
    getElementById: id => noeuds[id] || null,
    dispatchEvent() {}
  });
  const entrees = [{ filtre: 'L2' }];
  let position = 0, retoursDemandes = 0, attendreRetour = false;
  const fenetre = element();
  fenetre.setTimeout = fn => fn();
  function parcourir(sens) {
    if (position + sens < 0 || position + sens >= entrees.length) return;
    position += sens;
    fenetre.emettre('popstate', { state: entrees[position] });
  }
  fenetre.history = {
    get state() { return entrees[position]; },
    get length() { return entrees.length; },
    pushState(etat) { entrees.splice(++position, entrees.length, etat); },
    replaceState(etat) { entrees[position] = etat; },
    back() {
      retoursDemandes++;
      if (!attendreRetour) parcourir(-1);
    }
  };
  runInNewContext(dialogues + controleur, { document, window: fenetre, URL, CustomEvent: Event });
  declencheur.emettre('click');
  return {
    declencheur, lien, document, images, noeuds, modal: document.body.children[0],
    visionneuse: document.body.children[1], focus: () => focus, optionsRetour: () => optionsRetour,
    historique: fenetre.history, parcourir,
    differerRetour: () => { attendreRetour = true; },
    retoursDemandes: () => retoursDemandes
  };
}

test('la modale masque le sous-titre vide et retrouve le texte informatif à l’ouverture suivante', () => {
  const { declencheur, document, noeuds } = environnement();
  const sousTitre = noeuds.apercuSub;
  assert.equal(sousTitre.textContent, '');
  assert.equal(sousTitre.hidden, true);

  document.emettre('keydown', { key: 'Escape' });
  const informatif = 'Sommaire complet, puis un extrait.';
  declencheur.setAttribute('data-apercu-sub', informatif);
  declencheur.emettre('click');
  assert.equal(sousTitre.textContent, informatif);
  assert.equal(sousTitre.hidden, false);

  document.emettre('keydown', { key: 'Escape' });
  declencheur.setAttribute('data-apercu-sub', ' ');
  declencheur.emettre('click');
  assert.equal(sousTitre.textContent, '');
  assert.equal(sousTitre.hidden, true);
});

test('réessayer conserve le même extrait, le focus et les autres images après échec répété', () => {
  const { images, noeuds, modal, visionneuse, focus } = environnement();
  const [premier, second] = noeuds.apercuImgs.children;
  const [image, action] = second.children;
  assert.match(modal.markup, /id="apercuEtat" role="status"/);
  assert.equal(action.hidden, true);
  assert.equal(image.loading, 'lazy');
  assert.equal(image.src, images[1]);
  assert.equal(noeuds.apercuPrice.textContent, '19,99 €');
  assert.equal(noeuds.apercuCta.getAttribute('data-tjd-produit'), 'fiche-da-l2-s1');

  image.emettre('error');
  assert.equal(image.hidden, true);
  assert.equal(action.textContent, 'Réessayer');
  assert.equal(second.getAttribute('aria-label'), 'Réessayer de charger l’extrait 2');
  assert.equal(noeuds.apercuEtat.textContent, 'Impossible de charger l’extrait 2.');
  second.focus();
  assert.equal(second.emettre('click').arrete, true);
  const premiereTentative = image.src;
  assert.equal(new URL(premiereTentative).pathname, '/assets/apercus/extrait-b.webp');
  assert.equal(new URL(premiereTentative).searchParams.get('v'), '2026');
  assert.equal(image.loading, 'eager');
  assert.equal(second.getAttribute('aria-disabled'), 'true');
  assert.equal(action.textContent, 'Chargement…');
  second.emettre('click');
  assert.equal(image.src, premiereTentative);
  assert.equal(visionneuse.classList.contains('open'), false);

  image.emettre('error');
  assert.equal(second.getAttribute('aria-disabled'), null);
  assert.equal(action.textContent, 'Réessayer');
  second.emettre('click');
  assert.notEqual(image.src, premiereTentative);
  assert.equal(new URL(image.src).pathname, new URL(premiereTentative).pathname);
  noeuds.apercuImgs.scrollTop = 210;
  image.emettre('load');
  assert.equal(focus(), second);
  assert.equal(noeuds.apercuImgs.scrollTop, 210);
  assert.equal(premier.children[0].src, images[0]);
  assert.equal(image.hidden, false);
  assert.equal(action.hidden, true);
  assert.equal(second.getAttribute('aria-label'), 'Agrandir l’extrait 2');
  assert.equal(noeuds.apercuEtat.textContent, 'L’extrait 2 est chargé.');
  assert.equal(second.emettre('click').arrete, undefined);
  assert.equal(visionneuse.querySelector('.apercu-zoom__compteur').textContent, 'Page 2 sur 2');
});

test('un extrait indisponible garde sa place dans la navigation et la réouverture repart sans erreur', () => {
  const { declencheur, document, images, noeuds, visionneuse, focus } = environnement();
  const [premier, second] = noeuds.apercuImgs.children;
  const imageEnEchec = second.children[0];
  imageEnEchec.emettre('error');
  premier.emettre('click');
  assert.equal(visionneuse.querySelector('.apercu-zoom__compteur').textContent, 'Page 1 sur 2');
  visionneuse.querySelector('.apercu-zoom__suivante').emettre('click');
  assert.equal(visionneuse.classList.contains('open'), false);
  assert.equal(focus(), second);

  document.emettre('keydown', { key: 'Escape' });
  declencheur.emettre('click');
  imageEnEchec.emettre('error');
  assert.equal(noeuds.apercuEtat.textContent, '');
  assert.equal(noeuds.apercuImgs.children[1].children[0].src, images[1]);
  assert.equal(noeuds.apercuImgs.children[1].getAttribute('aria-label'), 'Agrandir l’extrait 2');
});

test('la fermeture du zoom rend le focus à la page affichée après navigation', () => {
  const { declencheur, document, noeuds, modal, visionneuse, focus } = environnement();
  const [premier, second] = noeuds.apercuImgs.children;
  const fermer = visionneuse.querySelector('.apercu-zoom__close');

  premier.emettre('click');
  visionneuse.querySelector('.apercu-zoom__suivante').emettre('click');
  fermer.emettre('click');
  assert.equal(focus(), second);
  assert.equal(visionneuse.classList.contains('open'), false);
  assert.equal(modal.classList.contains('open'), true);
  assert.equal(modal.inert, false);

  second.emettre('click');
  visionneuse.emettre('keydown', { key: 'ArrowLeft', target: fermer });
  assert.equal(document.emettre('keydown', { key: 'Escape' }).defaultPrevented, true);
  assert.equal(focus(), premier);
  assert.equal(visionneuse.classList.contains('open'), false);
  assert.equal(modal.classList.contains('open'), true);

  document.emettre('keydown', { key: 'Escape' });
  assert.equal(focus(), declencheur);
  assert.equal(modal.classList.contains('open'), false);
});

test('un lien vers un extrait public ouvre directement le zoom et conserve le défilement au retour', () => {
  const { document, lien, modal, visionneuse, focus, optionsRetour } = environnement();
  document.emettre('keydown', { key: 'Escape' });
  assert.equal(lien.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(lien.emettre('click', { metaKey: true }).defaultPrevented, undefined);
  assert.equal(visionneuse.classList.contains('open'), false);
  assert.equal(lien.emettre('click').defaultPrevented, true);
  assert.equal(visionneuse.classList.contains('open'), true);
  assert.equal(modal.classList.contains('open'), false);
  assert.equal(visionneuse.querySelector('img').src, lien.href);
  assert.equal(visionneuse.querySelector('img').alt, 'Extrait de la fiche complète · Droit administratif');
  assert.equal(visionneuse.querySelector('.apercu-zoom__navigation').hidden, true);
  document.emettre('keydown', { key: 'Escape' });
  assert.equal(focus(), lien);
  assert.equal(optionsRetour().preventScroll, true);
});

test('les retours et avances du navigateur suivent chaque niveau de l’aperçu', () => {
  const { declencheur, lien, noeuds, modal, visionneuse, focus, historique, parcourir } = environnement();
  noeuds.apercuImgs.children[0].emettre('click');
  visionneuse.querySelector('.apercu-zoom__suivante').emettre('click');
  assert.equal(historique.length, 3);
  assert.equal(historique.state.filtre, 'L2');

  parcourir(-1);
  assert.equal(visionneuse.classList.contains('open'), false);
  assert.equal(modal.classList.contains('open'), true);
  assert.equal(focus(), noeuds.apercuImgs.children[1]);
  parcourir(-1);
  assert.equal(modal.classList.contains('open'), false);
  assert.equal(focus(), declencheur);

  parcourir(1);
  assert.equal(modal.classList.contains('open'), true);
  parcourir(1);
  assert.equal(visionneuse.classList.contains('open'), true);
  assert.equal(visionneuse.querySelector('.apercu-zoom__compteur').textContent, 'Page 2 sur 2');

  parcourir(-2);
  lien.emettre('click');
  assert.equal(historique.length, 2);
  assert.equal(visionneuse.classList.contains('open'), true);
  parcourir(-1);
  assert.equal(visionneuse.classList.contains('open'), false);
  assert.equal(modal.classList.contains('open'), false);
  assert.equal(focus(), lien);
  parcourir(1);
  assert.equal(visionneuse.querySelector('img').src, lien.href);
  assert.equal(visionneuse.classList.contains('open'), true);
});

test('des demandes de fermeture rapprochées ne consomment qu’une entrée', () => {
  const { document, noeuds, modal, visionneuse, parcourir, differerRetour, retoursDemandes } = environnement();
  noeuds.apercuImgs.children[0].emettre('click');
  const fermer = visionneuse.querySelector('.apercu-zoom__close');
  differerRetour();
  fermer.emettre('click');
  fermer.emettre('click');
  document.emettre('keydown', { key: 'Escape' });
  assert.equal(retoursDemandes(), 1);
  parcourir(-1);
  assert.equal(visionneuse.classList.contains('open'), false);
  assert.equal(modal.classList.contains('open'), true);
  document.emettre('keydown', { key: 'Escape' });
  assert.equal(retoursDemandes(), 2);
  parcourir(-1);
  assert.equal(modal.classList.contains('open'), false);
});
