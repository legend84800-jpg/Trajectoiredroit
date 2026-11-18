// Les Packs Partiels reprennent les fichiers des supports déjà vendus à l’unité.
const PRIX_PACK_PARTIEL = 6990;

const MATIERES = {
  constitutionnel: [
    "fiche-constit-l1-s1",
    "dissertation-constit-l1-s1",
    "flashcards-qcm-constit-l1-s1",
  ],
  introduction: [
    "fiche-intro-droit-l1",
    "cas-pratique-intro-droit-l1",
    "maj-intro-droit-l1",
    "flashcards-qcm-intro-droit-l1",
  ],
  contrats: [
    "fiche-contrats-l2-s1",
    "cas-pratique-contrats-l2-s1",
    "maj-contrats-l2-s1",
    "flashcards-qcm-contrats-l2-s1",
  ],
  administratif: [
    "fiche-da-l2-s1",
    "cas-pratique-da-l2-s1",
    "maj-da-l2-s1",
    "flashcards-qcm-da-l2-s1",
  ],
  travail: [
    "fiche-travail-l3-s1",
    "cas-pratique-travail-l3",
    "maj-travail-l3-s1",
    "flashcards-qcm-travail-l3-s1",
  ],
  societes: [
    "fiche-societes-l3-s1",
    "cas-pratique-societes-l3",
    "maj-societes-l3-s1",
    "flashcards-qcm-societes-l3-s1",
  ],
  contratsSpeciaux: [
    "fiche-contrats-speciaux-l3",
    "cas-pratique-contrats-speciaux-l3",
    "maj-contrats-speciaux-l3",
    "flashcards-qcm-contrats-speciaux-l3",
  ],
};

const PACKS = [
  {
    id: "pack-partiel-l1-s1",
    nom: "Pack Partiel L1 S1, droit constitutionnel et introduction au droit",
    matieres: ["constitutionnel", "introduction"],
  },
  {
    id: "pack-partiel-l2-s1",
    nom: "Pack Partiel L2 S1, droit des contrats et droit administratif",
    matieres: ["contrats", "administratif"],
  },
  {
    id: "pack-partiel-l3-travail-societes",
    nom: "Pack Partiel L3 S1, droit du travail et droit des sociétés",
    matieres: ["travail", "societes"],
  },
  {
    id: "pack-partiel-l3-travail-contrats-speciaux",
    nom: "Pack Partiel L3 S1, droit du travail et contrats spéciaux",
    matieres: ["travail", "contratsSpeciaux"],
  },
  {
    id: "pack-partiel-l3-societes-contrats-speciaux",
    nom: "Pack Partiel L3 S1, droit des sociétés et contrats spéciaux",
    matieres: ["societes", "contratsSpeciaux"],
  },
];

function construireProduits(produits) {
  return Object.fromEntries(PACKS.map(({ id, nom, matieres }) => {
    const references = matieres.flatMap(matiere => MATIERES[matiere]);
    const fichiers = references.flatMap(reference => {
      const produit = produits[reference];
      if (!produit || produit.venteSuspendue || !produit.blobs?.length) {
        throw new Error("Support indisponible pour " + id + ", " + reference);
      }
      return produit.blobs;
    });
    return [id, { nom, prix: PRIX_PACK_PARTIEL, blobs: [...new Set(fichiers)] }];
  }));
}

module.exports = { construireProduits };
