// Catalogue des produits TJD.
// Clé = id produit utilisé dans les metadata Stripe et dans les tokens de téléchargement.

const BLOB = "https://pugq0h77i21rhva7.public.blob.vercel-storage.com/tjd";

const PRODUITS = {
  // Fiches compilées – 14,99 €
  "fiche-da-l2-s1":             { nom: "Fiches Droit administratif L2 S1",           prix: 1499, blobs: [`${BLOB}/fiche-da-l2-s1.pdf`] },
  "fiche-da-l2-s2":             { nom: "Fiches Droit administratif L2 S2",           prix: 1499, blobs: [`${BLOB}/fiche-da-l2-s2.pdf`] },
  "fiche-constit-l1-s1":        { nom: "Fiches Droit constitutionnel L1 S1",         prix: 1499, blobs: [`${BLOB}/fiche-constit-l1-s1.pdf`] },
  "fiche-constit-l1-s2":        { nom: "Fiches Droit constitutionnel L1 S2",         prix: 1499, blobs: [`${BLOB}/fiche-constit-l1-s2.pdf`] },
  "fiche-intro-droit-l1":       { nom: "Fiches Introduction au droit L1 S1",         prix: 1499, blobs: [`${BLOB}/fiche-intro-droit-l1.pdf`] },
  "fiche-hist-droit-l1":        { nom: "Fiches Histoire du droit L1 S1",             prix: 1499, blobs: [`${BLOB}/fiche-hist-droit-l1.pdf`] },
  "fiche-hist-institutions-l1": { nom: "Fiches Histoire des institutions L1 S2",     prix: 1499, blobs: [`${BLOB}/fiche-hist-institutions-l1.pdf`] },
  "fiche-personnes-l1":         { nom: "Fiches Droit des personnes L1",              prix: 1499, blobs: [`${BLOB}/fiche-personnes-l1.pdf`] },
  "fiche-famille-l1-s2":        { nom: "Fiches Droit de la famille L1 S2",           prix: 1499, blobs: [`${BLOB}/fiche-famille-l1-s2.pdf`] },
  "fiche-contrats-l2-s1":       { nom: "Fiches Droit des contrats L2 S1",            prix: 1499, blobs: [`${BLOB}/fiche-contrats-l2-s1.pdf`] },
  "fiche-obligations-l2-s2":    { nom: "Fiches Droit des obligations L2 S2",         prix: 1499, blobs: [`${BLOB}/fiche-obligations-l2-s2.pdf`] },
  "fiche-penal-general-l1":     { nom: "Fiches Droit pénal général L1 S2",           prix: 1499, blobs: [`${BLOB}/fiche-penal-general-l1.pdf`] },
  "fiche-penal-l2-s1":          { nom: "Fiches Droit pénal L2 S1",                   prix: 1499, blobs: [`${BLOB}/fiche-penal-l2-s1.pdf`] },
  "fiche-biens-l2":             { nom: "Fiches Droit des biens L2",                  prix: 1499, blobs: [`${BLOB}/fiche-biens-l2.pdf`] },
  "fiche-commercial-l3-s1":     { nom: "Fiches Droit commercial L3 S1",              prix: 1499, blobs: [`${BLOB}/fiche-commercial-l3-s1.pdf`] },
  "fiche-societes-l3-s1":       { nom: "Fiches Droit des sociétés L3 S1",            prix: 1499, blobs: [`${BLOB}/fiche-societes-l3-s1.pdf`] },
  "fiche-contrats-speciaux-l3": { nom: "Fiches Contrats spéciaux L3",                prix: 1499, blobs: [`${BLOB}/fiche-contrats-speciaux-l3.pdf`] },
  "fiche-travail-l3-s1":        { nom: "Fiches Droit du travail L3 S1",              prix: 1499, blobs: [`${BLOB}/fiche-travail-l3-s1.pdf`] },
  "fiche-procedure-penale-l3":  { nom: "Fiches Procédure pénale L3",                 prix: 1499, blobs: [`${BLOB}/fiche-procedure-penale-l3.pdf`] },
  "fiche-relations-internationales-l1": { nom: "Fiches Relations internationales L1", prix: 1499, blobs: [`${BLOB}/fiche-relations-internationales-l1.pdf`] },

  // Majeures préparées – 12,99 €
  "maj-intro-droit-l1":     { nom: "Majeures préparées Introduction au droit L1",    prix: 1299, blobs: [`${BLOB}/maj-intro-droit-l1.pdf`] },
  "maj-personnes-l1":       { nom: "Majeures préparées Droit des personnes L1",      prix: 1299, blobs: [`${BLOB}/maj-personnes-l1.pdf`] },
  "maj-famille-l1-s2":      { nom: "Majeures préparées Droit de la famille L1 S2",   prix: 1299, blobs: [`${BLOB}/maj-famille-l1-s2.pdf`] },
  "maj-da-l2-s1":           { nom: "Majeures préparées Droit administratif L2 S1",   prix: 1299, blobs: [`${BLOB}/maj-da-l2-s1.pdf`] },
  "maj-da-l2-s2":           { nom: "Majeures préparées Droit administratif L2 S2",   prix: 1299, blobs: [`${BLOB}/maj-da-l2-s2.pdf`] },
  "maj-contrats-l2-s1":     { nom: "Majeures préparées Droit des contrats L2 S1",    prix: 1299, blobs: [`${BLOB}/maj-contrats-l2-s1.pdf`] },
  "maj-obligations-l2-s2":  { nom: "Majeures préparées Droit des obligations L2 S2", prix: 1299, blobs: [`${BLOB}/maj-obligations-l2-s2.pdf`] },
  "maj-penal-l2-s1":        { nom: "Majeures préparées Droit pénal L2 S1",           prix: 1299, blobs: [`${BLOB}/maj-penal-l2-s1.pdf`] },
  "maj-penal-l2-s2":        { nom: "Majeures préparées Droit pénal L2 S2",           prix: 1299, blobs: [`${BLOB}/maj-penal-l2-s2.pdf`] },
  "maj-biens-l2":           { nom: "Majeures préparées Droit des biens L2",          prix: 1299, blobs: [`${BLOB}/maj-biens-l2.pdf`] },
  "maj-commercial-l3-s1":   { nom: "Majeures préparées Droit commercial L3 S1",      prix: 1299, blobs: [`${BLOB}/maj-commercial-l3-s1.pdf`] },

  // Packs
  "pack-l1": {
    nom: "Pack Fiches L1 intégral (8 matières)",
    prix: 9800,
    blobs: [
      `${BLOB}/fiche-intro-droit-l1.pdf`,
      `${BLOB}/fiche-constit-l1-s1.pdf`,
      `${BLOB}/fiche-constit-l1-s2.pdf`,
      `${BLOB}/fiche-hist-droit-l1.pdf`,
      `${BLOB}/fiche-hist-institutions-l1.pdf`,
      `${BLOB}/fiche-personnes-l1.pdf`,
      `${BLOB}/fiche-famille-l1-s2.pdf`,
      `${BLOB}/fiche-penal-general-l1.pdf`,
    ],
  },
  "pack-l2": {
    nom: "Pack Fiches L2 intégral (6 matières)",
    prix: 6800,
    blobs: [
      `${BLOB}/fiche-da-l2-s1.pdf`,
      `${BLOB}/fiche-da-l2-s2.pdf`,
      `${BLOB}/fiche-contrats-l2-s1.pdf`,
      `${BLOB}/fiche-obligations-l2-s2.pdf`,
      `${BLOB}/fiche-penal-l2-s1.pdf`,
      `${BLOB}/fiche-biens-l2.pdf`,
    ],
  },
  "pack-l3": {
    nom: "Pack Fiches L3 intégral (5 matières)",
    prix: 5800,
    blobs: [
      `${BLOB}/fiche-commercial-l3-s1.pdf`,
      `${BLOB}/fiche-societes-l3-s1.pdf`,
      `${BLOB}/fiche-contrats-speciaux-l3.pdf`,
      `${BLOB}/fiche-travail-l3-s1.pdf`,
      `${BLOB}/fiche-procedure-penale-l3.pdf`,
    ],
  },
  "pack-complet": {
    nom: "Pack Fiches L1+L2+L3 intégral (19 matières)",
    prix: 17900,
    blobs: [
      `${BLOB}/fiche-intro-droit-l1.pdf`,
      `${BLOB}/fiche-constit-l1-s1.pdf`,
      `${BLOB}/fiche-constit-l1-s2.pdf`,
      `${BLOB}/fiche-hist-droit-l1.pdf`,
      `${BLOB}/fiche-hist-institutions-l1.pdf`,
      `${BLOB}/fiche-personnes-l1.pdf`,
      `${BLOB}/fiche-famille-l1-s2.pdf`,
      `${BLOB}/fiche-penal-general-l1.pdf`,
      `${BLOB}/fiche-da-l2-s1.pdf`,
      `${BLOB}/fiche-da-l2-s2.pdf`,
      `${BLOB}/fiche-contrats-l2-s1.pdf`,
      `${BLOB}/fiche-obligations-l2-s2.pdf`,
      `${BLOB}/fiche-penal-l2-s1.pdf`,
      `${BLOB}/fiche-biens-l2.pdf`,
      `${BLOB}/fiche-commercial-l3-s1.pdf`,
      `${BLOB}/fiche-societes-l3-s1.pdf`,
      `${BLOB}/fiche-contrats-speciaux-l3.pdf`,
      `${BLOB}/fiche-travail-l3-s1.pdf`,
      `${BLOB}/fiche-procedure-penale-l3.pdf`,
    ],
  },
};

module.exports = PRODUITS;
