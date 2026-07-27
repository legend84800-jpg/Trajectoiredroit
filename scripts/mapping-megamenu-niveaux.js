// Vague 4.6 : matières par niveau pour le nouveau megamenu Fiches inversé.
// Même catalogue que scripts/mapping-matieres.js, réorganisé par niveau plutôt
// que par matière, avec le libellé court utilisé dans le menu (pas le nom complet
// "Droit administratif L2" mais juste "Droit administratif").
const NIVEAUX = {
  L1: {
    label: "L1",
    pageReussir: "reussir-sa-l1.html",
    matieres: [
      { nom: "Introduction au droit", href: "introduction-au-droit-l1.html" },
      { nom: "Droit constitutionnel", href: "droit-constitutionnel-l1.html" },
      { nom: "Histoire du droit", href: "histoire-du-droit-l1.html" },
      { nom: "Histoire des institutions", href: "histoire-des-institutions-l1.html" },
      { nom: "Relations internationales", href: "relations-internationales-l1.html" },
      { nom: "Droit des personnes", href: "droit-des-personnes-l1.html" },
      { nom: "Droit de la famille", href: "droit-de-la-famille-l1.html" },
      { nom: "Droit pénal général", href: "droit-penal-general-l1.html" },
    ],
  },
  L2: {
    label: "L2",
    pageReussir: "reussir-sa-l2.html",
    matieres: [
      { nom: "Droit administratif", href: "droit-administratif-l2.html" },
      { nom: "Droit des contrats", href: "droit-des-contrats-l2.html" },
      { nom: "Droit des obligations", href: "droit-des-obligations-l2.html" },
      { nom: "Droit pénal", href: "droit-penal-l2.html" },
      { nom: "Droit des biens", href: "droit-des-biens-l2.html" },
    ],
  },
  L3: {
    label: "L3",
    pageReussir: "reussir-sa-l3.html",
    matieres: [
      { nom: "Droit commercial", href: "droit-commercial-l3.html" },
      { nom: "Droit des sociétés", href: "droit-des-societes-l3.html" },
      { nom: "Contrats spéciaux", href: "contrats-speciaux-l3.html" },
      { nom: "Droit du travail", href: "droit-du-travail-l3.html" },
      { nom: "Procédure pénale", href: "procedure-penale-l3.html" },
    ],
  },
};

module.exports = { NIVEAUX };
