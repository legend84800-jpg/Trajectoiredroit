const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { construireIndex } = require('../scripts/generer-index-recherche');
const PRODUITS = require('../api/_produits');

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
    const [chemin, ancre] = page.u.split('#');
    const fichier = path.join(racine, chemin === '/' ? 'index.html' : chemin.slice(1));
    assert.ok(fs.existsSync(fichier), page.u);
    if (ancre) {
      const html = fs.readFileSync(fichier, 'utf8');
      const carte = Array.from(html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi), (m) => m[0])
        .filter((article) => article.split('>')[0].includes(` id="${ancre}"`));
      assert.equal(carte.length, 1, page.u);
      assert.ok(carte[0].includes(`data-tjd-produit="${ancre}"`), page.u);
      assert.ok(PRODUITS[ancre] && !PRODUITS[ancre].venteSuspendue, page.u);
    }
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

test('les flashcards et QCM de droit administratif mènent aux deux cartes de L2', () => {
  const resultat = Array.from(rechercher(index, 'QCM droit administratif'));
  assert.deepEqual(resultat.map(({ t, c, u }) => ({ t, c, u })), [
    { t: 'Droit administratif · L2 S1', c: 'Flashcards + QCM', u: '/flashcards-qcm.html#flashcards-qcm-da-l2-s1' },
    { t: 'Droit administratif · L2 S2', c: 'Flashcards + QCM', u: '/flashcards-qcm.html#flashcards-qcm-da-l2-s2' }
  ]);
  for (const requete of ['Flashcards de droit administratif L2 S2', 'QCM droit administratif L2S2', 'QCM droit administratif semestre 2', 'QCMs droit administratif licence 2 semestre 2']) {
    assert.deepEqual(Array.from(rechercher(index, requete), (p) => p.u), [resultat[1].u], requete);
  }
});

test('l’index couvre les cartes individuelles sans inventer de semestre', () => {
  const cartes = index.filter((p) => p.u.startsWith('/flashcards-qcm.html#'));
  assert.equal(cartes.length, 18);
  assert.deepEqual(Array.from(rechercher(index, 'QCM droit des contrats semestre 2'), (p) => p.u),
    ['/flashcards-qcm.html#flashcards-qcm-obligations-l2-s2']);
  assert.equal(rechercher(index, 'flashcards droit constitutionnel').length, 2);
  assert.equal(rechercher(index, 'flashcards droit des personnes')[0].t, 'Droit des personnes · L1');
  assert.equal(rechercher(index, 'QCM droit des personnes S2').length, 0);
});

test('les recherches de guides ou d’arrêts conservent le classement des pages', () => {
  const pages = index.filter((p) => !p.u.includes('#'));
  for (const requete of ['droit administratif', 'droit pénal', 'arrêt KPMG', 'Portalis', 'droit administratif L2']) {
    const ordre = Array.from(rechercher(pages, requete), (p) => p.u);
    assert.deepEqual(Array.from(rechercher(index, requete), (p) => p.u).slice(0, ordre.length), ordre, requete);
  }
});

test('une carte sans ancre utilisable est ignorée et sa page reste dans l’index', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'tjd-recherche-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  const page = 'flashcards-qcm.html';
  const html = fs.readFileSync(path.join(racine, page), 'utf8')
    .replace(' id="flashcards-qcm-da-l2-s1"', '')
    .replace('id="flashcards-qcm-da-l2-s2"', 'id="autre-carte"');
  fs.writeFileSync(path.join(site, page), html);
  const entrees = construireIndex(site);
  assert.ok(entrees.some((entree) => entree.u === '/' + page));
  assert.equal(rechercher(entrees, 'QCM droit administratif').length, 0);
  assert.equal(rechercher(entrees, 'QCM droit constitutionnel').length, 2);
});
