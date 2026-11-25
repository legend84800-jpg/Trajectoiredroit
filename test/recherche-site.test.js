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
    const destination = new URL(page.u, 'https://trajectoiredroit.com');
    const chemin = destination.pathname, ancre = destination.hash.slice(1);
    const fichier = path.join(racine, chemin === '/' ? 'index.html' : chemin.slice(1));
    assert.equal(destination.origin, 'https://trajectoiredroit.com', page.u);
    assert.ok(fs.existsSync(fichier), page.u);
    if (ancre) {
      const html = fs.readFileSync(fichier, 'utf8');
      if (page.u === '/revisions.html#citations') {
        assert.match(html, /<section\b[^>]*\sid="citations"/);
        continue;
      }
      if (page.g) {
        assert.ok(['/contrats-speciaux-l3.html#programme', '/ressources-gratuites.html#guides-gratuits'].includes(page.u));
        assert.ok(html.includes(`id="${ancre}"`), page.u);
        continue;
      }
      if (chemin === '/cas-pratiques-corriges.html') {
        const produit = destination.searchParams.get('matiere');
        const selecteur = html.match(/<select\b[^>]* id="choixRecueil"[^>]*>([\s\S]*?)<\/select>/)?.[1];
        assert.equal(ancre, 'recueils-cas-pratiques');
        assert.ok(html.includes(`id="${ancre}"`), page.u);
        assert.ok(selecteur?.includes(`value="${produit}"`), page.u);
        assert.ok(PRODUITS[produit] && !PRODUITS[produit].venteSuspendue, page.u);
        continue;
      }
      const carte = Array.from(html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi), (m) => m[0])
        .filter((article) => article.split('>')[0].includes(` id="${ancre}"`));
      assert.equal(carte.length, 1, page.u);
      assert.ok(carte[0].includes(`data-tjd-produit="${ancre}"`), page.u);
      assert.ok(PRODUITS[ancre] && !PRODUITS[ancre].venteSuspendue, page.u);
      if (chemin === '/majeures-preparees.html') {
        const niveaux = carte[0].split('>')[0].match(/\bdata-niveau="([^"]+)"/)?.[1].split(',');
        assert.ok(niveaux?.includes(destination.searchParams.get('niveau').toUpperCase()), page.u);
        assert.ok(carte[0].split('>')[0].includes('tabindex="-1"'), page.u);
      }
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

test('les fiches complètes actives mènent toutes à une carte au bon niveau dans Formations', () => {
  const prefixe = '/formations.html#';
  const fiches = index.filter((entree) => entree.u.startsWith(prefixe));
  const attendues = Object.entries(PRODUITS).filter(([, produit]) => produit.nom.startsWith('Fiche complète ') && !produit.venteSuspendue);
  assert.equal(fiches.length, attendues.length);
  assert.deepEqual(fiches.map((fiche) => fiche.u.slice(prefixe.length)).sort(), attendues.map(([id]) => id).sort());
  assert.ok(fiches.some((fiche) => fiche.u.endsWith('#cours-fiche-philo-droit-l2-s1')));
  for (const requete of ['fiche responsabilité civile L2S2', 'fiches complètes responsabilité civile L2-S2', 'fiche de révision obligations Licence 2 semestre 2']) {
    assert.equal(rechercher(index, requete)[0].u, prefixe + 'fiche-obligations-l2-s2', requete);
  }
  assert.equal(rechercher(index, 'fiche droit pénal L2 S1')[0].u, prefixe + 'fiche-penal-general-l1');
  assert.equal(rechercher(index, 'fiche droit pénal L2 S2')[0].u, prefixe + 'fiche-penal-general-l1');
  for (const semestre of ['S1', 'S2']) {
    const [fiche] = rechercher(index, 'fiche droit pénal général L2 ' + semestre);
    assert.equal(fiche.u, prefixe + 'fiche-penal-general-l1');
    assert.match(fiche.t, /L2 S1 ou S2$/);
  }
  assert.equal(rechercher(index, 'fiche droit des biens L2 S1').filter((entree) => entree.u.startsWith(prefixe)).length, 0);
});

test('la recherche QCM reconnaît aussi les années et semestres séparés par un tiret', () => {
  for (const repere of ['L1S2', 'L1-S2', 'L1 S2', 'L1 S.2', 'Licence 1 semestre 2']) {
    assert.equal(rechercher(index, 'QCM droit constitutionnel ' + repere)[0].u, '/flashcards-qcm.html#flashcards-qcm-constit-l1-s2');
  }
});

test('les majeures de droit administratif ouvrent la carte du semestre demandé', () => {
  assert.equal(index.filter((entree) => entree.c === 'Majeures préparées').length, 18);
  for (const [semestre, requetes] of [
    ['s1', ['majeures droit administratif S1', 'Droit administratif S1 majeures préparées']],
    ['s2', ['majeure préparée en droit administratif L2-S2', 'majeures droit administratif licence 2 semestre 2']],
  ]) {
    for (const requete of requetes) {
      const resultats = Array.from(rechercher(index, requete));
      assert.equal(resultats.length, 1, requete);
      assert.equal(resultats[0].u, `/majeures-preparees.html?niveau=l2#maj-da-l2-${semestre}`, requete);
      assert.equal(resultats[0].t, `Droit administratif · L2 ${semestre.toUpperCase()}`, requete);
    }
  }
  assert.equal(rechercher(index, 'majeures droit des personnes S2').length, 0);
});

test('les cas pratiques ouvrent le sélecteur public avec le bon semestre', () => {
  assert.equal(index.filter((entree) => entree.c === 'Cas pratiques corrigés').length, 17);
  for (const [semestre, requetes] of [
    ['s1', ['cas pratiques droit administratif S1', 'cas pratiques corrigés droit administratif L2S1']],
    ['s2', ['cas pratique corrigé droit administratif S2', 'droit administratif cas pratiques corrigés semestre 2']],
  ]) {
    for (const requete of requetes) {
      const resultats = Array.from(rechercher(index, requete));
      assert.equal(resultats.length, 1, requete);
      assert.equal(resultats[0].u, `/cas-pratiques-corriges.html?matiere=cas-pratique-da-l2-${semestre}#recueils-cas-pratiques`, requete);
      assert.equal(resultats[0].t, `Droit administratif · L2 ${semestre.toUpperCase()}`, requete);
    }
  }
  assert.equal(rechercher(index, 'cas pratiques droit des personnes S2').length, 0);
  assert.equal(rechercher(index, 'cas pratique droit administratif')[0].u, '/exemple-cas-pratique-corrige-droit-administratif.html');
  assert.deepEqual(Array.from(rechercher(index, 'droit administratif L2 S2').slice(0, 2), (entree) => entree.c), ['Flashcards + QCM', 'Fiche complète']);
});

test('les recherches de guides ou d’arrêts conservent le classement des pages', () => {
  const pages = index.filter((p) => !p.u.includes('#'));
  for (const requete of ['droit administratif', 'droit pénal', 'arrêt KPMG', 'Portalis', 'droit administratif L2']) {
    const ordre = Array.from(rechercher(pages, requete), (p) => p.u);
    assert.deepEqual(Array.from(rechercher(index, requete), (p) => p.u).slice(0, ordre.length), ordre, requete);
  }
});

test('la recherche d’une fiche d’arrêt retrouve la décision demandée', () => {
  for (const requete of ['fiche d’arrêt Blanco', 'FICHE D\'ARRET BLANCO', 'fiche de l’arrêt Blanco', 'fiche d’arrêt sur Blanco', 'fiche arrêt Blanco 1873']) {
    assert.equal(rechercher(index, requete)[0].u, '/arret-blanco-explique.html', requete);
  }
  assert.equal(rechercher(index, 'fiches d’arrêt KPMG')[0].u, '/arret-kpmg-2006-explique.html');
  assert.equal(rechercher(index, 'fiche d’arrêt inconnuqz').length, 0);
});

test('la recherche retrouve les fiches d’arrêt de la matière et du semestre demandés', () => {
  const offres = (requete) => Array.from(rechercher(index, requete), ({ t, c, u }) => ({ t, c, u }));
  assert.deepEqual(offres('fiches d’arrêt de droit administratif'), [
    { t: 'Droit administratif · L2', c: 'Fiches d’arrêt', u: '/revisions.html#fiche-arret-administratif' },
  ]);
  for (const requete of ['fiche arret droit constitutionnel S2', 'fiches d’arrêt de droit constitutionnel L1S2', 'fiche arrêt droit constitutionnel semestre 2']) {
    assert.deepEqual(offres(requete), [
      { t: 'Droit constitutionnel · L1 S2', c: 'Fiches d’arrêt', u: '/revisions.html#fiche-arret-constit-l1-s2' },
    ], requete);
  }
  assert.equal(offres('droit administratif fiches d’arrêt')[0].u, '/revisions.html#fiche-arret-administratif');
  assert.equal(offres('fiches d’arrêt droit des contrats S1')[0].u, '/revisions.html#fiche-arret-contrats');
  assert.equal(offres('fiches d’arrêt procédure civile L3')[0].u, '/revisions.html#fiche-arret-procedure-civile-l3-s1');
  assert.equal(offres('fiches d’arrêt droit administratif S2').length, 0);
  assert.ok(offres('fiche complète droit administratif').every((offre) => offre.c !== 'Fiches d’arrêt'));
});

test('les fiches d’arrêt vendues à l’unité ouvrent chacune leur carte publique', () => {
  const fichesArret = index.filter((page) => page.c === 'Fiches d’arrêt');
  const produitsActifs = Object.keys(PRODUITS).filter((produit) => produit.startsWith('fiche-arret-') && !PRODUITS[produit].venteSuspendue);
  assert.deepEqual(fichesArret.map((page) => page.u).sort(), produitsActifs.map((produit) => '/revisions.html#' + produit).sort());
});

test('la recherche explicite d’un guide ouvre la section publique correspondante', () => {
  for (const requete of ['guide contrats spéciaux', 'guide de contrats spéciaux', 'contrats speciaux guide gratuit Licence 3']) {
    assert.equal(rechercher(index, requete)[0].u, '/contrats-speciaux-l3.html#programme', requete);
  }
  for (const requete of ['guides gratuits', 'guide gratuit']) {
    assert.equal(rechercher(index, requete)[0].u, '/ressources-gratuites.html#guides-gratuits', requete);
  }
  assert.equal(rechercher(index, 'ressources gratuites')[0].u, '/ressources-gratuites.html');
  assert.equal(rechercher(index, 'contrats spéciaux')[0].u, '/contrats-speciaux-l3.html');
  assert.equal(rechercher(index, 'fiche complète contrats spéciaux L3')[0].u, '/formations.html#fiche-contrats-speciaux-l3');
});

test('les guides de matière reprennent les destinations de la liste des ressources gratuites', () => {
  const portail = fs.readFileSync(path.join(racine, 'ressources-gratuites.html'), 'utf8');
  const section = portail.match(/<section\b[^>]* id="guides-gratuits"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(section);
  const liens = Array.from(section.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g), ([, href, libelle]) => {
    const [page, ancre] = href.split('#');
    assert.ok(ancre && fs.readFileSync(path.join(racine, page), 'utf8').includes(`id="${ancre}"`), href);
    return [page === 'contrats-speciaux-l3.html' ? '/' + href : '/' + page, libelle];
  });
  assert.deepEqual(index.filter((page) => typeof page.g === 'string').map((page) => [page.u, page.g]).sort(), liens.filter(([href]) => !href.includes('#')).sort());
  for (const [destination, libelle] of liens) {
    assert.equal(rechercher(index, 'guide ' + libelle)[0].u, destination, libelle);
  }
  for (const [requete, destination] of [
    ['guide droit administratif', '/droit-administratif-l2.html'],
    ['Guide du droit administratif Licence 2', '/droit-administratif-l2.html'],
    ['guide de droit de la famille', '/droit-de-la-famille-l1.html'],
    ['guide de procédure pénale', '/procedure-penale-l3.html'],
  ]) {
    assert.equal(rechercher(index, requete)[0].u, destination, requete);
  }
  assert.deepEqual(Array.from(rechercher(index, 'guide contrats spéciaux'), (page) => page.u), ['/contrats-speciaux-l3.html#programme']);
});

test('la recherche générique de citations ouvre la section existante', () => {
  for (const requete of ['citations', 'fiche de citations', 'Fiches de citation PDF']) {
    assert.equal(rechercher(index, requete)[0].u, '/revisions.html#citations', requete);
  }
  const niveau = Array.from(rechercher(index, 'citations L2'));
  assert.equal(niveau.length, 7);
  assert.ok(niveau.every((resultat) => resultat.c === 'Fiches de citations' && /· L2\b/.test(resultat.t)));
});

test('les recherches de citations mènent aux cartes de la matière et du semestre demandés', () => {
  assert.deepEqual(Array.from(rechercher(index, 'citations droit administratif'), (page) => page.u), [
    '/revisions.html#citations-da-l2-s1', '/revisions.html#citations-da-l2-s2',
  ]);
  for (const [requete, identifiant] of [
    ['citations du droit administratif semestre 2', 'citations-da-l2-s2'],
    ['fiche de citations sur le droit administratif L2S2', 'citations-da-l2-s2'],
    ['citations de droit constitutionnel L1-S2', 'citations-constit-l1-s2'],
    ['citations de droit des contrats semestre 2', 'citations-obligations-l2-s2'],
    ['fiche de citations procédure pénale', 'citations-procedure-penale-l3'],
    ['citation libertés fondamentales', 'citations-libertes-fondamentales'],
  ]) {
    assert.deepEqual(Array.from(rechercher(index, requete), (page) => page.u), ['/revisions.html#' + identifiant], requete);
  }
  assert.equal(rechercher(index, 'citations droit des personnes semestre 2').length, 0);
  assert.equal(rechercher(index, 'citations inexistanteqz').length, 0);
  assert.equal(rechercher(index, 'droit administratif L2 S2').some((page) => page.c === 'Fiches de citations'), false);
});

test('seules les cartes individuelles publiques et ancrées de citations sont indexées', () => {
  const html = fs.readFileSync(path.join(racine, 'revisions.html'), 'utf8');
  const section = html.match(/<section\b[^>]*\sid="citations"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(section);
  const attendus = Array.from(section.matchAll(/data-tjd-produit="(citations-[^"]+)"/g), ([, produit]) => produit).sort();
  const cartes = index.filter((page) => page.c === 'Fiches de citations');
  assert.equal(cartes.length, 19);
  assert.deepEqual(cartes.map((page) => page.u.split('#')[1]).sort(), attendus);
  assert.ok(cartes.every((page) => page.u.startsWith('/revisions.html#citations-')));
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


test('les mêmes supports de droit commercial se trouvent en L2 et en L3', () => {
  assert.ok(rechercher(index, 'droit commercial L2').some((entree) => entree.u === '/droit-commercial-l2.html'));
  for (const [format, destination] of [
    ['fiche complète', '/formations.html#fiche-commercial-l3-s1'],
    ['majeures préparées', '/majeures-preparees.html?niveau=l3#maj-commercial-l3-s1'],
    ['cas pratiques corrigés', '/cas-pratiques-corriges.html?matiere=cas-pratique-commercial-l3-s1#recueils-cas-pratiques'],
  ]) {
    for (const niveau of ['L2', 'L3']) {
      const resultats = Array.from(rechercher(index, format + ' droit commercial ' + niveau + ' S1'));
      assert.equal(resultats.filter((entree) => entree.u === destination).length, 1, format + ' ' + niveau);
    }
  }
});
