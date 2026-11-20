const CHEMIN_INCLUSIONS_PANIER = 'assets/panier-inclusions.json';

function construireInclusionsPanier(produits) {
  const catalogue = Object.entries(produits)
    .filter(([id, produit]) => /^[a-z0-9][a-z0-9-]*$/.test(id) && produit && !produit.venteSuspendue
      && typeof produit.nom === 'string' && produit.nom.trim());
  const noms = Object.fromEntries(catalogue.map(([id, produit]) => [id, produit.nom]));
  const prix = Object.fromEntries(catalogue.filter(([, produit]) => Number.isSafeInteger(produit.prix) && produit.prix > 0)
    .map(([id, produit]) => [id, produit.prix]));
  const avecFichiers = catalogue.filter(([, produit]) => Array.isArray(produit.blobs) && produit.blobs.length)
    .map(([id, produit]) => ({ id, fichiers: new Set(produit.blobs) }));
  const inclusions = {};

  for (const pack of avecFichiers) {
    if (!pack.id.startsWith('pack-')) continue;
    const produitsInclus = avecFichiers.filter((produit) =>
      produit.fichiers.size < pack.fichiers.size
      && [...produit.fichiers].every((fichier) => pack.fichiers.has(fichier)));
    if (!produitsInclus.length) continue;

    inclusions[pack.id] = produitsInclus.map((produit) => produit.id);
  }

  return { inclusions, noms, prix };
}

module.exports = { CHEMIN_INCLUSIONS_PANIER, construireInclusionsPanier };
