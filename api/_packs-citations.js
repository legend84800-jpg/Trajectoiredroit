// Les packs annuels reprennent les PDF des fiches vendues à l'unité.
const PACKS = [
  {
    id: "pack-citations-l1",
    nom: "Pack annuel de fiches de citations L1",
    prix: 4500,
    fiches: [
      "citations-intro-droit-l1",
      "citations-hist-droit-l1",
      "citations-constit-l1-s1",
      "citations-constit-l1-s2",
      "citations-personnes-l1",
      "citations-hist-institutions-l1",
    ],
  },
  {
    id: "pack-citations-l2",
    nom: "Pack annuel de fiches de citations L2",
    prix: 4900,
    fiches: [
      "citations-da-l2-s1",
      "citations-da-l2-s2",
      "citations-obligations-l2-s1",
      "citations-obligations-l2-s2",
      "citations-penal-l2-s1",
      "citations-penal-l2-s2",
      "citations-biens-l2",
    ],
  },
  {
    id: "pack-citations-l3",
    nom: "Pack annuel de fiches de citations L3",
    prix: 3000,
    fiches: [
      "citations-societes-l3",
      "citations-travail-l3",
      "citations-procedure-penale-l3",
      "citations-rgo-l3",
    ],
  },
];

function construireProduits(produits) {
  return Object.fromEntries(PACKS.map((pack) => {
    const fiches = pack.fiches.map((id) => {
      const fiche = produits[id];
      if (!fiche || fiche.blobs.length !== 1) {
        throw new Error(`Fiche de citations absente ou incomplète : ${id}`);
      }
      return fiche;
    });
    return [pack.id, {
      nom: pack.nom,
      prix: pack.prix,
      blobs: fiches.map((fiche) => fiche.blobs[0]),
      blobsMeta: fiches.map((fiche) => ({ nom: fiche.nom })),
    }];
  }));
}

module.exports = { PACKS, construireProduits };
