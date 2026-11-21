const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../assets/js/main.js'), 'utf8');
const controleur = source.slice(source.indexOf('/* ----- APERÇU PDF'), source.indexOf('/* Sur téléphone, la barre basse'));

function environnement() {
  let focus;
  function element() {
    const attributs = new Map(), classes = new Set(), ecouteurs = new Map(), controles = new Map();
    return {
      children: [], hidden: false, isConnected: true,
      classList: {
        add: classe => classes.add(classe), remove: classe => classes.delete(classe),
        toggle: (classe, actif) => actif ? classes.add(classe) : classes.delete(classe)
      },
      getAttribute: nom => attributs.get(nom) ?? null,
      setAttribute: (nom, valeur) => attributs.set(nom, String(valeur)),
      removeAttribute: nom => attributs.delete(nom),
      addEventListener: (nom, fn) => ecouteurs.set(nom, fn),
      emettre(nom) {
        const evenement = { stopPropagation() { this.arrete = true; } };
        ecouteurs.get(nom)?.(evenement);
        return evenement;
      },
      focus() { focus = this; },
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
  const noeuds = Object.fromEntries(['Title', 'Sub', 'Imgs', 'Etat', 'Price', 'Cta'].map(id => ['apercu' + id, element()]));
  const document = {
    baseURI: 'https://example.test/fiche.html', body: element(), createElement: element,
    querySelectorAll: () => [declencheur], getElementById: id => noeuds[id] || null
  };
  const window = { tjdDialogues: {
    ouvrir(dialogue) { dialogue.ouvert = true; },
    fermer(dialogue) { dialogue.ouvert = false; }
  } };
  runInNewContext(controleur, { document, window, URL });
  declencheur.emettre('click');
  return { declencheur, images, noeuds, modal: document.body.children[0], visionneuse: document.body.children[1], focus: () => focus };
}

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
  assert.equal(visionneuse.ouvert, undefined);

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
  const { declencheur, images, noeuds, visionneuse, focus } = environnement();
  const [premier, second] = noeuds.apercuImgs.children;
  const imageEnEchec = second.children[0];
  imageEnEchec.emettre('error');
  premier.emettre('click');
  assert.equal(visionneuse.querySelector('.apercu-zoom__compteur').textContent, 'Page 1 sur 2');
  visionneuse.querySelector('.apercu-zoom__suivante').emettre('click');
  assert.equal(visionneuse.ouvert, false);
  assert.equal(focus(), second);

  declencheur.emettre('click');
  imageEnEchec.emettre('error');
  assert.equal(noeuds.apercuEtat.textContent, '');
  assert.equal(noeuds.apercuImgs.children[1].children[0].src, images[1]);
  assert.equal(noeuds.apercuImgs.children[1].getAttribute('aria-label'), 'Agrandir l’extrait 2');
});
