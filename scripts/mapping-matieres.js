// Mapping matière -> produit(s) pour la vague 2 (encarts produit sur trafic SEO existant).
// Ne touche jamais à api/_produits.js (source de vérité serveur) : ce fichier ne fait que
// pointer vers les ids qui y sont déjà définis, pour piloter la génération de HTML statique.
// Utilisé par scripts/generer-encarts-produit.js et scripts/generer-section-matiere.js.

const MATIERES = {
  "droit-administratif-l2": {
    nom: "Droit administratif L2",
    semestres: [
      { label: "Semestre 1", id: "fiche-da-l2-s1", prix: "14,99 €", apercus: ["assets/apercus/da-l2-s1-1.jpg", "assets/apercus/da-l2-s1-2.jpg"] },
      { label: "Semestre 2", id: "fiche-da-l2-s2", prix: "14,99 €", apercus: ["assets/apercus/admin-l2-s2-1.jpg", "assets/apercus/admin-l2-s2-2.jpg"] },
    ],
  },
  "droit-commercial-l3": {
    nom: "Droit commercial L3",
    semestres: [
      { label: null, id: "fiche-commercial-l3-s1", prix: "14,99 €", apercus: ["assets/apercus/commercial-l3-s1-1.jpg", "assets/apercus/commercial-l3-s1-2.jpg"] },
    ],
  },
  "droit-constitutionnel-l1": {
    nom: "Droit constitutionnel L1",
    semestres: [
      { label: "Semestre 1", id: "fiche-constit-l1-s1", prix: "14,99 €", apercus: ["assets/apercus/constit-l1-s1-1.jpg", "assets/apercus/constit-l1-s1-2.jpg"] },
      { label: "Semestre 2", id: "fiche-constit-l1-s2", prix: "14,99 €", apercus: ["assets/apercus/constit-l1-s2-1.jpg", "assets/apercus/constit-l1-s2-2.jpg"] },
    ],
  },
  "droit-de-la-famille-l1": {
    nom: "Droit de la famille L1",
    semestres: [
      { label: null, id: "fiche-famille-l1-s2", prix: "14,99 €", apercus: ["assets/apercus/famille-l1-s2-1.jpg", "assets/apercus/famille-l1-s2-2.jpg"] },
    ],
  },
  "droit-des-biens-l2": {
    nom: "Droit des biens L2",
    semestres: [
      { label: null, id: "fiche-biens-l2", prix: "14,99 €", apercus: ["assets/apercus/biens-l2-1.jpg", "assets/apercus/biens-l2-2.jpg"] },
    ],
  },
  "droit-des-contrats-l2": {
    nom: "Droit des contrats L2",
    semestres: [
      { label: null, id: "fiche-contrats-l2-s1", prix: "14,99 €", apercus: ["assets/apercus/contrats-l2-s1-1.jpg", "assets/apercus/contrats-l2-s1-2.jpg"] },
    ],
  },
  "droit-des-obligations-l2": {
    nom: "Droit des obligations L2",
    semestres: [
      { label: null, id: "fiche-obligations-l2-s2", prix: "14,99 €", apercus: ["assets/apercus/obligations-l2-s2-1.jpg", "assets/apercus/obligations-l2-s2-2.jpg"] },
    ],
  },
  "droit-des-personnes-l1": {
    nom: "Droit des personnes L1",
    semestres: [
      { label: null, id: "fiche-personnes-l1", prix: "14,99 €", apercus: ["assets/apercus/personnes-l1-1.jpg"] },
    ],
  },
  "droit-des-societes-l3": {
    nom: "Droit des sociétés L3",
    semestres: [
      { label: null, id: "fiche-societes-l3-s1", prix: "14,99 €", apercus: ["assets/apercus/societes-l3-s1-1.jpg", "assets/apercus/societes-l3-s1-2.jpg"] },
    ],
  },
  "droit-du-travail-l3": {
    nom: "Droit du travail L3",
    semestres: [
      { label: null, id: "fiche-travail-l3-s1", prix: "14,99 €", apercus: ["assets/apercus/travail-l3-s1-1.jpg", "assets/apercus/travail-l3-s1-2.jpg"] },
    ],
  },
  "droit-penal-general-l1": {
    nom: "Droit pénal général L1",
    semestres: [
      { label: null, id: "fiche-penal-general-l1", prix: "14,99 €", apercus: ["assets/apercus/penal-general-l1-1.jpg"] },
    ],
  },
  "droit-penal-l2": {
    nom: "Droit pénal L2",
    semestres: [
      { label: null, id: "fiche-penal-l2-s1", prix: "14,99 €", apercus: ["assets/apercus/penal-l2-s1-1.jpg", "assets/apercus/penal-l2-s1-2.jpg"] },
    ],
  },
  "histoire-des-institutions-l1": {
    nom: "Histoire des institutions L1",
    semestres: [
      { label: null, id: "fiche-hist-institutions-l1", prix: "14,99 €", apercus: ["assets/apercus/hist-institutions-l1-1.jpg", "assets/apercus/hist-institutions-l1-2.jpg"] },
    ],
  },
  "histoire-du-droit-l1": {
    nom: "Histoire du droit L1",
    semestres: [
      { label: null, id: "fiche-hist-droit-l1", prix: "14,99 €", apercus: ["assets/apercus/hist-droit-l1-1.jpg", "assets/apercus/hist-droit-l1-2.jpg"] },
    ],
  },
  "introduction-au-droit-l1": {
    nom: "Introduction au droit L1",
    semestres: [
      { label: null, id: "fiche-intro-droit-l1", prix: "14,99 €", apercus: ["assets/apercus/intro-droit-l1-1.jpg", "assets/apercus/intro-droit-l1-2.jpg"] },
    ],
  },
  "procedure-penale-l3": {
    nom: "Procédure pénale L3",
    semestres: [
      { label: null, id: "fiche-procedure-penale-l3", prix: "14,99 €", apercus: ["assets/apercus/procedure-penale-l3-1.jpg", "assets/apercus/procedure-penale-l3-2.jpg"] },
    ],
  },
  "contrats-speciaux-l3": {
    nom: "Contrats spéciaux L3",
    semestres: [
      { label: null, id: "fiche-contrats-speciaux-l3", prix: "14,99 €", apercus: ["assets/apercus/contrats-speciaux-l3-1.jpg", "assets/apercus/contrats-speciaux-l3-2.jpg"] },
    ],
  },
  "relations-internationales-l1": {
    nom: "Relations internationales L1",
    semestres: [
      { label: null, id: "fiche-relations-internationales-l1", prix: "14,99 €", apercus: [] },
    ],
  },
};

// Pages "fiche d'arrêt" -> slug de la page matière correspondante dans MATIERES.
// Établi à partir du lien réel du CTA final de chaque page (source de vérité déjà publiée sur le site).
// "arret-cesareo-2006-explique" est volontairement absent : c'est un arrêt de procédure civile,
// matière sans page pilier ni produit dans le catalogue. Pas d'encart produit sur cette page.
const ARRETS_VERS_MATIERE = {
  "arret-baby-loup-2014-explique": "droit-du-travail-l3",
  "arret-bac-eloka-explique": "droit-administratif-l2",
  "arret-baldus-explique": "droit-des-contrats-l2",
  "arret-barel-1954-explique": "droit-administratif-l2",
  "arret-benjamin-explique": "droit-administratif-l2",
  "arret-bertrand-1997-explique": "droit-des-obligations-l2",
  "arret-blanco-explique": "droit-administratif-l2",
  "arret-cadot-explique": "droit-administratif-l2",
  "arret-canal-de-craponne-explique": "droit-des-contrats-l2",
  "arret-chronopost-explique": "droit-des-contrats-l2",
  "arret-costa-enel-1964-explique": "droit-constitutionnel-l1",
  "arret-costedoat-2000-explique": "droit-des-obligations-l2",
  "arret-dame-lamotte-explique": "droit-administratif-l2",
  "arret-empietement-1990-explique": "droit-des-biens-l2",
  "arret-franck-1941-explique": "droit-des-obligations-l2",
  "arret-fruehauf-explique": "droit-des-societes-l3",
  "arret-gisti-1978-explique": "droit-administratif-l2",
  "arret-iron-mountain-2020-explique": "droit-des-societes-l3",
  "arret-jacques-vabre-explique": "droit-constitutionnel-l1",
  "arret-jandheur-1930-explique": "droit-des-obligations-l2",
  "arret-kpmg-2006-explique": "droit-administratif-l2",
  "arret-laboube-1956-explique": "droit-penal-general-l1",
  "arret-lacour-1962-explique": "droit-penal-general-l1",
  "arret-magnier-1961-explique": "droit-administratif-l2",
  "arret-manoukian-explique": "droit-des-contrats-l2",
  "arret-mennesson-2019-explique": "droit-des-personnes-l1",
  "arret-narcy-1963-explique": "droit-administratif-l2",
  "arret-nicolo-explique": "droit-administratif-l2",
  "arret-perdereau-1986-explique": "droit-penal-general-l1",
  "arret-perruche-2000-explique": "droit-des-personnes-l1",
  "arret-sarran-1998-explique": "droit-constitutionnel-l1",
  "arret-sexe-neutre-2017-explique": "droit-des-personnes-l1",
  "arret-terrier-1903-explique": "droit-administratif-l2",
  "arret-tresor-2002-explique": "droit-des-biens-l2",
  "arret-ville-nouvelle-est-explique": "droit-administratif-l2",
  "arret-nikon": "droit-du-travail-l3",
};

// Pages fiche-revision / comment-reviser -> matière. "comment-reviser-le-droit" est générique
// (pas une matière précise) : elle reçoit un encart catalogue générique, pas un produit matière.
const REVISION_VERS_MATIERE = {
  "fiche-revision-droit-administratif-l2": "droit-administratif-l2",
  "comment-reviser-le-droit-administratif-l2": "droit-administratif-l2",
  "comment-reviser-le-droit-des-obligations-l2": "droit-des-obligations-l2",
};

const PAGES_GENERIQUES = ["comment-reviser-le-droit"];

module.exports = { MATIERES, ARRETS_VERS_MATIERE, REVISION_VERS_MATIERE, PAGES_GENERIQUES };
