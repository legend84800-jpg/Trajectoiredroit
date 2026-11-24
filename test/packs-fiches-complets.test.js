const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const produits = require('../api/_produits');
const { construireLiensTelechargement } = require('../api/_liens-telechargement');
const { construireInclusionsPanier } = require('../scripts/generer-inclusions-panier');

const attentes = {
  'pack-l1': { prix: 8700, fichiers: 27, ajout: 'fiche-penal-general-l1', anciens: ['fiche-intro-droit-l1','fiche-constit-l1-s1','fiche-constit-l1-s2','fiche-hist-droit-l1','fiche-hist-institutions-l1','fiche-personnes-l1','fiche-famille-l1-s2','fiche-relations-internationales-l1'] },
  'pack-l3': { prix: 5800, fichiers: 17, ajout: 'fiche-societes-l3-s2', anciens: ['fiche-commercial-l3-s1','fiche-societes-l3-s1','fiche-contrats-speciaux-l3','fiche-travail-l3-s1','fiche-procedure-penale-l3'] }
};
for (const [id, attendu] of Object.entries(attentes)) test(id + ' conserve ses fichiers et son prix en ajoutant la fiche manquante', () => {
  const p = produits[id];
  assert.equal(p.prix, attendu.prix);
  assert.equal(p.blobs.length, attendu.fichiers);
  assert.equal(new Set(p.blobs).size, p.blobs.length);
  for (const unite of [...attendu.anciens, attendu.ajout]) {
    for (const fichier of produits[unite].blobs) assert.ok(p.blobs.includes(fichier), unite);
  }
});

test('la licence contient les fiches des trois packs sans fichier en double', () => {
  const union = new Set(['pack-l1-revision', 'pack-l2-revision', 'pack-l3'].flatMap(id => produits[id].blobs));
  assert.deepEqual(new Set(produits['pack-complet-revision'].blobs), union);
  assert.equal(produits['pack-complet-revision'].prix, 17900);
  assert.equal(produits['pack-complet-revision'].blobs.length, 63);
  assert.equal(produits['pack-l2-revision'].blobs.length, 22);
  assert.equal(produits['pack-l2-revision'].prix, 7900);
});

test('le pénal général reste dans les anciens packs L1 et se vend dans les packs L2', () => {
  for (const [l1, l2, support] of [
    ['pack-l1', 'pack-l2-revision', 'fiche-penal-general-l1'],
    ['pack-cas-pratiques-l1', 'pack-cas-pratiques-l2', 'cas-pratique-penal-general-l1'],
    ['pack-flashcards-qcm-l1', 'pack-flashcards-qcm-l2', 'flashcards-qcm-penal-general-l1'],
  ]) {
    const fichiers = produits[support].blobs;
    const ancien = produits[l1];
    const nouveau = produits[l1 + '-revision'];
    assert.equal(ancien.venteSuspendue, true);
    assert.ok(!nouveau.venteSuspendue);
    assert.equal(nouveau.prix, ancien.prix);
    assert.ok(fichiers.every(fichier => ancien.blobs.includes(fichier)));
    assert.ok(fichiers.every(fichier => produits[l2].blobs.includes(fichier)));
    assert.deepEqual(nouveau.blobs, ancien.blobs.filter(fichier => !fichiers.includes(fichier)));
  }
});

test('la fiche de pénal retirée reste attachée aux anciens achats seulement', () => {
  const ancienneFiche = produits['fiche-penal-l2-s1'];
  const ficheUnique = produits['fiche-penal-general-l1'];
  assert.equal(ancienneFiche.venteSuspendue, true);
  assert.ok(!ficheUnique.venteSuspendue);
  for (const id of ['pack-l2', 'pack-complet', 'pack-matiere-penal-l2']) {
    assert.equal(produits[id].venteSuspendue, true, id);
    assert.ok(ancienneFiche.blobs.every(fichier => produits[id].blobs.includes(fichier)), id);
    const revision = produits[id + '-revision'];
    assert.ok(!revision.venteSuspendue, id);
    assert.equal(revision.prix, produits[id].prix, id);
    assert.ok(ficheUnique.blobs.every(fichier => revision.blobs.includes(fichier)), id);
  }
  for (const [id, produit] of Object.entries(produits)) {
    if (!produit.venteSuspendue) assert.ok(!produit.blobs?.some(fichier => ancienneFiche.blobs.includes(fichier)), id);
  }
});

const deuxFichesL2 = ['cours-fiche-finances-publiques-l2-s1', 'cours-fiche-philo-droit-l2-s1'];
const anciennesListes = {
  'pack-l2': { taille: 21, empreinte: '9fafbf412a8c757d3e4a16c37555938e28f0ae9d971ba5bbc9218b636b820a82' },
  'pack-complet': { taille: 62, empreinte: 'e53b3397b6cd534f54a056dfc0e81948994465c88bcacbe2983f6d3d4a184cab' },
};

test('les deux fiches et leurs plans sont ajoutés après tous les anciens indices de téléchargement', () => {
  const ajouts = deuxFichesL2.flatMap(id => produits[id].blobs);
  const panier = construireInclusionsPanier(produits);
  for (const [id, avant] of Object.entries(anciennesListes)) {
    const { blobs } = produits[id];
    const empreinte = createHash('sha256').update(JSON.stringify(blobs.slice(0, avant.taille))).digest('hex');
    assert.equal(empreinte, avant.empreinte, id);
    assert.deepEqual(blobs.slice(avant.taille), ajouts, id);
    assert.equal(new Set(blobs).size, blobs.length, id);
    for (const fiche of deuxFichesL2) assert.ok(panier.inclusions[id + '-revision'].includes(fiche), fiche);
  }
});

test('Mon compte propose les nouveaux fichiers sur deux anciens achats fictifs', async () => {
  const code = fs.readFileSync(require.resolve('../api/mes-telechargements'), 'utf8');
  const lignes = Object.keys(anciennesListes).map(id => ({
    produit_ids: [id], session_id: 'cs_test_ancien_' + id, cree_le: '2026-10-01T00:00:00Z',
  }));
  const modules = {
    './_produits': produits,
    './_supabase': {
      utilisateurDepuisJWT: async () => ({ email: 'etudiant@example.invalid' }),
      selectionner: async () => lignes,
    },
    './_liens-telechargement': { construireLiensTelechargement },
    './_suggestions-post-achat': { suggererComplements: () => [] },
  };
  const contexte = {
    module: { exports: {} }, require: id => modules[id], process: { env: { DOWNLOAD_SECRET: 'secret-de-test' } }, console,
  };
  vm.runInNewContext(code, contexte);
  const reponse = { setHeader() {}, status(code) { this.code = code; return this; }, json(corps) { this.corps = corps; } };
  await contexte.module.exports({ method: 'POST', body: { accessToken: 'jeton-fictif' } }, reponse);
  assert.equal(reponse.code, 200);
  for (const achat of reponse.corps.achats) {
    const [{ id, fichiers }] = achat.produits;
    assert.equal(fichiers.length, anciennesListes[id].taille + 4);
    assert.match(fichiers.at(-4).nom, /Finances publiques/);
    assert.match(fichiers.at(-3).nom, /Finances publiques.+plan/);
    assert.match(fichiers.at(-2).nom, /Philosophie du droit/);
    assert.match(fichiers.at(-1).nom, /Philosophie du droit.+plan/);
    for (let index = 0; index < fichiers.length; index++) {
      const url = new URL(fichiers[index].url);
      assert.equal(url.pathname, '/api/telecharger');
      assert.equal(url.searchParams.get('b'), String(index));
      assert.equal(url.searchParams.get('sid'), achat.sessionId);
    }
  }
});
