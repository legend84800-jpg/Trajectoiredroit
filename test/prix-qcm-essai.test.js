const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const PROD = require('../api/_produits');
const { synchroniserPrixFormats } = require('../scripts/synchroniser-prix-formats');

const site = path.resolve(__dirname, '..');
const page = 'flashcards-qcm.html';
const html = fs.readFileSync(path.join(site, page), 'utf8');

test('chaque matière du QCM reprend le prix catalogue de sa propre carte et reste synchronisée', () => {
  const contexte = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(site, 'assets/js/qcm-essai-donnees.js'), 'utf8'), contexte);
  const prix = new Map();
  for (const [, id, montant] of html.matchAll(/<article\b[^>]*\sid="(flashcards-qcm-[a-z0-9-]+)"[^>]*\sdata-qcm-prix-centimes="(\d+)"/g)) {
    assert.ok(!prix.has(id), id);
    prix.set(id, Number(montant));
  }
  assert.equal(prix.size, contexte.window.TJD_QCM_ESSAI.length);
  for (const { id } of contexte.window.TJD_QCM_ESSAI) {
    assert.ok(PROD[id] && !PROD[id].venteSuspendue);
    assert.equal(prix.get(id), PROD[id].prix, id);
  }
  assert.equal(synchroniserPrixFormats(html, page), html);
});

test('la génération corrige un prix périmé et ignore les cartes non identifiées', () => {
  const id = 'flashcards-qcm-da-l2-s2';
  const carte = `<article id="${id}" data-qcm-prix-centimes="123"><button data-tjd-produit="${id}">Acheter</button></article>`;
  const carteSansOffre = `<article id="${id}" data-qcm-prix-centimes="123"><p>Exemple</p></article>`;
  const autreFormat = '<article id="fiche-da-l2-s2"><p>Exemple</p></article>';
  assert.equal(synchroniserPrixFormats(carte, page), carte.replace('123', String(PROD[id].prix)));
  assert.equal(synchroniserPrixFormats(carteSansOffre, page), carteSansOffre.replace(' data-qcm-prix-centimes="123"', ''));
  assert.equal(synchroniserPrixFormats(autreFormat, page), autreFormat);
  assert.equal(synchroniserPrixFormats(carte, 'autre-page.html'), carte);
});
