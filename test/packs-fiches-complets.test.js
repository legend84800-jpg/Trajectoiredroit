const test = require('node:test');
const assert = require('node:assert/strict');
const produits = require('../api/_produits');

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
  const union = new Set(['pack-l1','pack-l2','pack-l3'].flatMap(id => produits[id].blobs));
  assert.deepEqual(new Set(produits['pack-complet'].blobs), union);
  assert.equal(produits['pack-complet'].prix, 17900);
  assert.equal(produits['pack-complet'].blobs.length, 62);
  assert.equal(produits['pack-l2'].blobs.length, 21);
  assert.equal(produits['pack-l2'].prix, 7900);
});
