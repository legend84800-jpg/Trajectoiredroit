const PRIX_KIT = 6900;
const NOMBRE_MATIERES = 3;

const programmes = {
  l1: [
    ["constitutionnel-s1", "constitutionnel", "Droit constitutionnel", "S1", "fiche-constit-l1-s1", "dissertation-constit-l1-s1", "flashcards-qcm-constit-l1-s1"],
    ["intro-droit", "intro-droit", "Introduction au droit", "S1", "fiche-intro-droit-l1", "maj-intro-droit-l1", "flashcards-qcm-intro-droit-l1"],
    ["histoire-du-droit", "histoire-du-droit", "Histoire du droit", "S1", "fiche-hist-droit-l1", "dissertation-hist-droit-l1", "flashcards-qcm-hist-droit-l1"],
    ["personnes", "personnes", "Droit des personnes", "", "fiche-personnes-l1", "maj-personnes-l1", "flashcards-qcm-personnes-l1"],
    ["constitutionnel-s2", "constitutionnel", "Droit constitutionnel", "S2", "fiche-constit-l1-s2", "dissertation-constit-l1-s2", "flashcards-qcm-constit-l1-s2"],
    ["famille", "famille", "Droit de la famille", "S2", "fiche-famille-l1-s2", "maj-famille-l1-s2", "flashcards-qcm-famille-l1-s2"],
  ],
  l2: [
    ["contrats", "contrats", "Droit des contrats", "S1", "fiche-contrats-l2-s1", "maj-contrats-l2-s1", "flashcards-qcm-contrats-l2-s1"],
    ["administratif-s1", "administratif", "Droit administratif", "S1", "fiche-da-l2-s1", "maj-da-l2-s1", "flashcards-qcm-da-l2-s1"],
    ["penal", "penal", "Droit pénal", "S1", "fiche-penal-l2-s1", "maj-penal-l2-s1", "flashcards-qcm-penal-l2-s1"],
    ["responsabilite", "responsabilite", "Responsabilité civile", "S2", "fiche-obligations-l2-s2", "maj-obligations-l2-s2", "flashcards-qcm-obligations-l2-s2"],
    ["administratif-s2", "administratif", "Droit administratif", "S2", "fiche-da-l2-s2", "maj-da-l2-s2", "flashcards-qcm-da-l2-s2"],
    ["biens", "biens", "Droit des biens", "", "fiche-biens-l2", "maj-biens-l2", "flashcards-qcm-biens-l2"],
  ],
  l3: [
    ["travail", "travail", "Droit du travail", "S1", "fiche-travail-l3-s1", "maj-travail-l3-s1", "flashcards-qcm-travail-l3-s1"],
    ["societes", "societes", "Droit des sociétés", "S1", "fiche-societes-l3-s1", "maj-societes-l3-s1", "flashcards-qcm-societes-l3-s1"],
    ["contrats-speciaux", "contrats-speciaux", "Contrats spéciaux", "S1", "fiche-contrats-speciaux-l3", "maj-contrats-speciaux-l3", "flashcards-qcm-contrats-speciaux-l3"],
    ["commercial", "commercial", "Droit commercial", "S1", "fiche-commercial-l3-s1", "maj-commercial-l3-s1", "flashcards-qcm-commercial-l3-s1"],
  ],
};

function lireMatiere(entree, produits) {
  const [code, discipline, nom, semestre, fiche, application, qcm] = entree;
  const supports = [fiche, application, qcm].map((reference) => produits[reference]);
  if (supports.some((support) => !support?.blobs?.length || !Number.isInteger(support.prix))) return null;
  return {
    code,
    discipline,
    nom,
    semestre,
    formatApplication: application.startsWith("maj-") ? "Majeures préparées" : "Dissertations corrigées",
    prixSepare: supports.reduce((total, support) => total + support.prix, 0),
    suspendue: supports.some((support) => support.venteSuspendue),
    fichiers: supports.flatMap((support) => support.blobs),
  };
}

function codeKit(niveau, matieres) {
  const codes = matieres.map((matiere) => matiere.code).sort().join("--");
  return `pack-kit-partiels-${niveau}--${codes}`;
}

function construireProduits(produits) {
  const kits = {};
  for (const [niveau, programme] of Object.entries(programmes)) {
    const matieres = programme.map((entree) => lireMatiere(entree, produits)).filter(Boolean);
    for (let i = 0; i < matieres.length - 2; i++) {
      for (let j = i + 1; j < matieres.length - 1; j++) {
        for (let k = j + 1; k < matieres.length; k++) {
          const trio = [matieres[i], matieres[j], matieres[k]];
          if (new Set(trio.map((matiere) => matiere.discipline)).size !== NOMBRE_MATIERES) continue;
          const noms = trio.map(({ nom, semestre }) => semestre ? `${nom} (${semestre})` : nom).join(", ");
          kits[codeKit(niveau, trio)] = {
            nom: `Kit Partiels ${niveau.toUpperCase()}, ${noms}`,
            prix: PRIX_KIT,
            echeancesAutorisees: [2],
            venteSuspendue: trio.some((matiere) => matiere.suspendue),
            blobs: [...new Set(trio.flatMap((matiere) => matiere.fichiers))],
          };
        }
      }
    }
  }
  return kits;
}

function donneesPage(produits) {
  const niveaux = Object.fromEntries(Object.entries(programmes).map(([niveau, entrees]) => [
    niveau,
    entrees
      .map((entree) => lireMatiere(entree, produits))
      .filter((matiere) => matiere && !matiere.suspendue)
      .map(({ code, discipline, nom, semestre, formatApplication, prixSepare }) => ({
        code, discipline, nom, semestre, formatApplication, prixSepare,
      })),
  ]));
  return { prix: PRIX_KIT, nombreMatieres: NOMBRE_MATIERES, niveaux };
}

module.exports = { construireProduits, donneesPage };
