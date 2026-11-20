const CHEMIN_INCLUSIONS_PANIER = 'assets/panier-inclusions.json';

function construireInclusionsPanier(produits) {
  const catalogue = Object.entries(produits)
    .filter(([id, produit]) => /^[a-z0-9][a-z0-9-]*$/.test(id) && produit && !produit.venteSuspendue
      && typeof produit.nom === 'string' && produit.nom.trim()
      && Array.isArray(produit.blobs) && produit.blobs.length)
    .map(([id, produit]) => ({ id, nom: produit.nom, fichiers: new Set(produit.blobs) }));
  const inclusions = {};
  const noms = {};

  for (const pack of catalogue) {
    if (!pack.id.startsWith('pack-')) continue;
    const produitsInclus = catalogue.filter((produit) =>
      produit.fichiers.size < pack.fichiers.size
      && [...produit.fichiers].every((fichier) => pack.fichiers.has(fichier)));
    if (!produitsInclus.length) continue;

    inclusions[pack.id] = produitsInclus.map((produit) => produit.id);
    for (const produit of produitsInclus) noms[produit.id] = produit.nom;
  }

  return { inclusions, noms };
}

module.exports = { CHEMIN_INCLUSIONS_PANIER, construireInclusionsPanier };
