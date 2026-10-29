// Les prix et les fichiers restent définis dans api/_produits.js.
// Ce fichier réunit seulement les choix de présentation du catalogue.
const BESOINS = [
  {
    titre: "Comprendre mon cours",
    supports: [
      { nom: "Fiche complète", href: "formations.html#a-l-unite", format: "Fiche complète ", unite: " / semestre ou matière" },
      { nom: "Cours complet", href: "cours-fiches.html#grille-cours-fiches", format: "Cours complet ", unite: " / semestre ou matière" },
    ],
    contenu: "La fiche réunit les règles du cours. Le cours complet développe les explications.",
    lien: { nom: "Comparer les deux formats sur le dol", href: "formations.html#fiche-ou-cours" },
  },
  {
    titre: "Voir ou écouter les explications",
    supports: [
      { nom: "Cours en images", href: "droit-des-contrats-en-images.html", ids: ["cours-images-contrats-l2-s1"], unite: "" },
      { nom: "Podcasts et vidéos", href: "pack-ultra.html#pack-ultra-podcasts", famille: "audio-video-", unite: " / matière" },
    ],
    contenu: "Le cours en images porte sur les contrats de L2 S1. Les podcasts et les vidéos reprennent les leçons des matières proposées, avec un extrait à écouter avant de choisir.",
  },
  {
    titre: "Rédiger mes exercices",
    supports: [
      { nom: "Majeures préparées", href: "majeures-preparees.html", format: "Majeures préparées ", unite: " / recueil" },
      { nom: "Exercices corrigés", href: "corriges.html", format: "Cas pratiques corrigés ", unite: " / recueil" },
      { nom: "Portalis IA", href: "portalis.html#formules", portalis: true, unite: " / mois" },
    ],
    contenu: "Les majeures donnent les règles déjà rédigées pour le cas pratique. Les corrigés montrent comment traiter les sujets proposés. Avec Portalis, tu ajoutes ton propre sujet pour obtenir un corrigé.",
  },
  {
    titre: "Mémoriser et me tester",
    supports: [
      { nom: "Flashcards et QCM", href: "flashcards-qcm.html", format: "Flashcards + QCM ", unite: " / matière" },
      { nom: "Fiches d’arrêt", href: "revisions.html#fiches-arret", format: "Fiches d'arrêt ", unite: " / matière" },
    ],
    contenu: "Les cartes et les questions à choix multiples te permettent de vérifier ce que tu as retenu. Les fiches d’arrêt expliquent les décisions à connaître, depuis les faits jusqu’à la solution.",
  },
  {
    titre: "Préparer mes accroches",
    supports: [
      { nom: "Fiches de citations", href: "revisions.html#citations", famille: "citations-", unite: " / matière" },
    ],
    contenu: "Tu retrouves les citations classées par thème pour préparer l’introduction de tes devoirs et les relier au sujet.",
  },
  {
    titre: "Regrouper mes ressources",
    supports: [
      { nom: "Pack annuel de fiches", href: "formations.html#packs-annee", ids: ["pack-l1", "pack-l2", "pack-l3"], minimum: true, unite: " / année" },
      { nom: "Pack Ultra", href: "pack-ultra.html#pack-ultra", famille: "pack-ultra-", minimum: true, unite: " / semestre" },
    ],
    contenu: "Le pack annuel rassemble les fiches de ton année. Le Pack Ultra réunit plusieurs formats pour un semestre. Tu peux ouvrir leur liste de matières avant de choisir.",
  },
];

const APERCUS = [
  { id: "cours-fiche-finances-publiques-l2-s1", fichier: "cours-fiche-finances-publiques-l2-s1.pdf", titre: "Finances publiques · L2 S1 · Fiche complète", pages: [3, 12, 25], total: 66, sha256: "e3580913268090cf3aad89fc545ebd917788c5fd0efc72b6700fc07ade3d60cf", sha256R2: "9bc8c30a80e1020c6ddcd877299faf651255f60b3d936405342ec1029f31378e", modificationR2: "2026-10-23T04:06:17+00:00", texteLocalIdentique: true },
  { id: "cours-fiche-philo-droit-l2-s1", fichier: "cours-fiche-philo-droit-l2-s1.pdf", titre: "Philosophie du droit · L2 S1 · Fiche complète", pages: [3, 17, 40], total: 61, sha256: "8d813a0f189bfc94232cec5b2f89aa2f79c52f1a312918d52e70099de6a402f3", sha256R2: "cefc29870cbd551f4568af4c6ecd38779186e6f423d97cd3c02416a65179f10e", modificationR2: "2026-10-29T00:07:57+00:00", texteLocalIdentique: true },
  { id: "cours-complet-finances-publiques-l2-s1", fichier: "cours-complet-finances-publiques-l2-s1.pdf", titre: "Finances publiques · L2 S1 · Cours complet", pages: [3, 14, 29], total: 51, sha256: "0fec8b522686024f21b841f2d54019fefa79c3e3f1507a1a5a79b6512bf0d184", sha256R2: "6d22f84b9c58838174f81f8b60fd94238c8b5e9fba6bbb57a394e75003df1edb", modificationR2: "2026-10-29T00:01:48+00:00", texteLocalIdentique: true },
  { id: "cours-complet-philosophie-du-droit-l2-s1", fichier: "cours-complet-philosophie-du-droit-l2-s1.pdf", titre: "Philosophie du droit · L2 S1 · Cours complet", pages: [3, 16, 40], total: 62, sha256: "054ad880461b393a451440828047a129c40dcf3929c2bf13dc67c578e13dfe29", sha256R2: "1a3274400f91ff2694b3fd799c7971c29f9f23f397e51531175c783a73a7bf55", modificationR2: "2026-10-29T00:01:55+00:00", texteLocalIdentique: true },
];

// Lecture authentifiée des deux objets livrés, le 29 octobre 2026.
const COMPARAISON_DOL = [
  { format: "fiche", produit: "fiche-contrats-l2-s1", cleR2: "tjd/fiche-contrats-l2-s1.pdf", total: 202, pagePDF: 88,
    sha256PDF: "22ae131343e6e1d1898600a1c303d9d09cbfd04bb6690c556968a8c07bfd3c21", modificationR2: "2026-10-29T03:45:38+00:00",
    image: "assets/apercus/comparatif-dol-fiche-20261029.png", sha256Image: "9b5f9740a67139cf61019496297b98a0928759ce831c32a370e5f236a349f9c0",
    alt: "Extrait de la fiche de droit des contrats, page 88 du PDF, avec le début du chapitre sur le dol et ses éléments constitutifs" },
  { format: "cours", produit: "cours-fiche-contrats-l2-s1", cleR2: "tjd/cours-fiche-contrats-l2-s1.pdf", total: 275, pagePDF: 113,
    sha256PDF: "a5c6cd7fab7f0481b0113adc197a3d0a9fdebbe2db7894111d998243379bc18a", modificationR2: "2026-10-29T03:46:08+00:00",
    image: "assets/apercus/comparatif-dol-cours-20261029.png", sha256Image: "f10c410be81942aa4bc8acd375bb923bdfd69bf6f8008dfcf724bcc75e5dfa67",
    alt: "Extrait du cours de droit des contrats, page 113 du PDF, avec l’exemple du compteur kilométrique trafiqué et la réticence dolosive" },
];

// Titres reproduits depuis le sommaire (page 2) de chaque PDF livré.
const SOMMAIRES = {
  "cours-fiche-finances-publiques-l2-s1": ["Introduction aux finances publiques", "Les principes budgétaires", "La LOLF et le droit budgétaire contemporain", "La procédure budgétaire", "L'exécution et le contrôle budgétaires"],
  "cours-fiche-philo-droit-l2-s1": ["Qu'est-ce que la philosophie du droit ?", "Jusnaturalisme : de l'Antiquité à l'époque moderne", "Les grandes théories positivistes", "Rawls, Dworkin et les théories de la justice", "Au-delà du positivisme : réalisme, CLS et théories critiques"],
  "cours-complet-finances-publiques-l2-s1": ["Fondements et histoire des finances publiques", "Les grands principes du droit budgétaire", "La LOLF et le droit budgétaire contemporain", "La procédure budgétaire", "L'exécution et le contrôle budgétaires"],
  "cours-complet-philosophie-du-droit-l2-s1": ["Qu'est-ce que la philosophie du droit ?", "Le jusnaturalisme (droit naturel)", "Le positivisme juridique", "Rawls, Dworkin et les théories de la justice", "Le réalisme juridique et les courants critiques"],
};
for (const apercu of APERCUS) apercu.sommaire = SOMMAIRES[apercu.id];

module.exports = { BESOINS, APERCUS, COMPARAISON_DOL };
