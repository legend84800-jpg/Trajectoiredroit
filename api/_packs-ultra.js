// Composition des packs par semestre. Les références sont celles du catalogue
// vendu à l'unité. Un nouveau produit daté demande de valider le total attendu
// avant déploiement, pour éviter de modifier silencieusement le contenu vendu.
// Les références sans semestre explicite sont rattachées ci-dessous par matière.

const DEFINITIONS = {
  "pack-ultra-l1-s1": { nom: "Le Pack Ultra L1 semestre 1", prix: 23900, attendus: 31 },
  "pack-ultra-l1-s2": { nom: "Le Pack Ultra L1 semestre 2", prix: 19900, attendus: 22 },
  "pack-ultra-l2-s1": { nom: "Le Pack Ultra L2 semestre 1", prix: 22900, attendus: 28 },
  // Le montant saisi pour L2 S2 ("2009") attend la confirmation de Julien.
  "pack-ultra-l2-s2": { nom: "Le Pack Ultra L2 semestre 2", prix: null, attendus: 27 },
  "pack-ultra-l3-s1": { nom: "Le Pack Ultra L3 semestre 1", prix: 29900, attendus: 37 },
  "pack-ultra-l3-s2": { nom: "Le Pack Ultra L3 semestre 2", prix: 4900, attendus: 5 },
};

const RATTACHEMENTS_ANNUELS = {
  "pack-ultra-l1-s1": ["intro-droit-l1", "hist-droit-l1", "personnes-l1", "relations-internationales-l1"],
  "pack-ultra-l1-s2": ["hist-institutions-l1", "penal-general-l1"],
  "pack-ultra-l2-s1": [],
  "pack-ultra-l2-s2": ["biens-l2"],
  "pack-ultra-l3-s1": ["contrats-speciaux-l3", "procedure-penale-l3", "penal-special-l3", "travail-l3", "societes-l3"],
  "pack-ultra-l3-s2": [],
};

const RATTACHEMENTS_GENERIQUES = {
  "pack-ultra-l1-s1": ["fiche-arret-personnes"],
  "pack-ultra-l1-s2": ["fiche-arret-penal", "fiche-arret-famille"],
  "pack-ultra-l2-s1": ["fiche-arret-penal", "fiche-arret-contrats", "fiche-arret-administratif"],
  "pack-ultra-l2-s2": ["fiche-arret-obligations", "fiche-arret-administratif", "fiche-arret-biens"],
  "pack-ultra-l3-s1": ["fiche-arret-procedure-penale", "fiche-arret-societes"],
  "pack-ultra-l3-s2": [],
};

function referencesPour(packId, catalogue) {
  const semestre = packId.slice(-5);
  const rattachements = RATTACHEMENTS_ANNUELS[packId];
  const generiques = RATTACHEMENTS_GENERIQUES[packId];
  return Object.keys(catalogue).filter((id) => {
    if (id.startsWith("pack-") || id.startsWith("stage-") || id === "stage-methode") return false;
    if (id.includes(`-${semestre}`)) return true;
    if (rattachements.some((matiere) => id.endsWith(`-${matiere}`))) return true;
    return generiques.includes(id);
  });
}

function construireProduits(catalogue) {
  const packs = {};
  for (const [id, definition] of Object.entries(DEFINITIONS)) {
    const inclus = referencesPour(id, catalogue);
    if (inclus.length !== definition.attendus) {
      throw new Error(`${id}: ${inclus.length} références trouvées, ${definition.attendus} attendues. Vérifier la composition.`);
    }
    if (definition.prix === null) continue;
    const blobs = [];
    const blobsMeta = [];
    for (const reference of inclus) {
      const produit = catalogue[reference];
      for (const url of produit.blobs) {
        blobs.push(url);
        blobsMeta.push({ reference, nom: produit.nom });
      }
    }
    packs[id] = { nom: definition.nom, prix: definition.prix, inclus, blobs, blobsMeta };
  }
  return packs;
}

module.exports = { DEFINITIONS, referencesPour, construireProduits };
