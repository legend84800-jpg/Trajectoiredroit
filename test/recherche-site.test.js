const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { construireIndex } = require('../scripts/generer-index-recherche');

const racine = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(racine, 'assets/js/recherche.js'), 'utf8');
const contexte = vm.createContext({ window: {}, document: { readyState: 'loading', addEventListener() {} } });
vm.runInContext(source, contexte);
const rechercher = contexte.window.tjdRechercherPages;
const index = construireIndex(racine);

test('la recherche retrouve KPMG et Portalis parmi les pages publiées', () => {
  assert.ok(index.length >= 330);
  assert.ok(rechercher(index, 'arrêt KPMG').some((p) => p.u === '/arret-kpmg-2006-explique.html'));
  assert.ok(rechercher(index, 'Portalis').some((p) => p.u === '/portalis.html'));
});

test('les mots peuvent changer d’ordre et les accents restent facultatifs', () => {
  for (const requete of ['L2 contrats', 'contrats L2', 'DROIT ADMINISTRATIF L2', 'droit pénal', 'droit penal']) {
    assert.ok(rechercher(index, requete).length > 0, requete);
  }
  const avecAccents = Array.from(rechercher(index, 'droit pénal'), (p) => p.u);
  const sansAccents = Array.from(rechercher(index, 'droit penal'), (p) => p.u);
  assert.deepEqual(avecAccents, sansAccents);
  assert.equal(rechercher(index, 'qwertyzzzz').length, 0);
  assert.equal(rechercher(index, '   ').length, 0);
});

test('l’index exclut les pages privées ou techniques et les fichiers absents', () => {
  assert.equal(new Set(index.map((p) => p.u)).size, index.length);
  for (const page of index) {
    assert.doesNotMatch(page.u, /^\/(merci|mon-compte|produit-template|bientot|complements|donner-mon-avis|google)/);
    assert.ok(fs.existsSync(path.join(racine, page.u === '/' ? 'index.html' : page.u.slice(1))));
  }
});

test('les mots demandés doivent tous être présents', () => {
  const pages = [
    { t: 'Droit des contrats L2', c: 'Cours', u: '/contrats.html' },
    { t: 'Droit pénal L2', c: 'Cours', u: '/penal.html' },
    { t: 'Droit des contrats L3', c: 'Cours', u: '/contrats-l3.html' }
  ];
  assert.deepEqual(Array.from(rechercher(pages, 'L2 contrats'), (p) => p.u), ['/contrats.html']);
});
