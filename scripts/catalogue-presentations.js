// Les prix et les fichiers sont définis dans api/_produits.js.
// Ce fichier réunit seulement les choix de présentation du catalogue.
const BESOINS = [
  {
    titre: "Comprendre mon cours",
    supports: [
      { nom: "Fiche complète", href: "formations.html#a-l-unite", format: "Fiche complète ", unite: " / semestre ou matière" },
    ],
    contenu: "La fiche complète reprend le programme chapitre par chapitre, avec les règles et les arrêts à connaître.",
    lien: { nom: "Lire un extrait de fiche", href: "formations.html#extrait-fiche-contrats" },
  },
  {
    titre: "Voir ou écouter les explications",
    supports: [
      { nom: "Cours en images", href: "droit-des-contrats-en-images.html", ids: ["cours-images-contrats-l2-s1"], unite: "" },
      { nom: "Podcasts et vidéos par matière", choixMatieres: true, famille: "audio-video-", unite: " le cours" },
    ],
    contenu: "Le cours en images porte sur les contrats de L2 S1. Choisis ta matière pour écouter un podcast ou regarder un extrait vidéo.",
  },
  {
    titre: "Rédiger mes exercices",
    supports: [
      { nom: "Majeures préparées", href: "majeures-preparees.html", format: "Majeures préparées ", unite: " / PDF" },
      { nom: "Exercices corrigés", href: "corriges.html", format: "Cas pratiques corrigés ", unite: " / PDF" },
      { nom: "Portalis IA", href: "portalis.html#formules", portalis: true, unite: " / mois" },
    ],
    contenu: "Une majeure préparée donne une règle de droit déjà rédigée, prête à écrire dans un cas pratique. Les corrigés montrent, sujet par sujet, comment construire la réponse puis la rédiger. Portalis rédige un corrigé à partir de ton propre sujet.",
  },
  {
    titre: "Mémoriser et me tester",
    supports: [
      { nom: "Flashcards et QCM", href: "flashcards-qcm.html", format: "Flashcards + QCM ", unite: " / semestre ou matière" },
      { nom: "Fiches d’arrêt", href: "revisions.html#fiches-arret", format: "Fiches d'arrêt ", unite: " / semestre ou matière" },
    ],
    contenu: "Les cartes et les questions à choix multiples te permettent de vérifier ce que tu as retenu. Les fiches d’arrêt expliquent les décisions à connaître, depuis les faits jusqu’à la solution.",
  },
  {
    titre: "Préparer mes accroches",
    supports: [
      { nom: "Fiches de citations", href: "revisions.html#citations", famille: "citations-", unite: " / semestre ou matière" },
    ],
    contenu: "Les citations sont classées par thème. On choisit celle qui pose le problème du sujet, puis on s’en sert pour ouvrir l’introduction d’une dissertation ou d’un commentaire.",
  },
  {
    titre: "Regrouper mes ressources",
    supports: [
      { nom: "Pack annuel de fiches", href: "formations.html#packs-annee", ids: ["pack-l1-revision", "pack-l2", "pack-l3"], minimum: true, unite: " / année" },
      { nom: "Pack Ultra", href: "pack-ultra.html#pack-ultra", famille: "pack-ultra-", minimum: true, unite: " / semestre" },
    ],
    contenu: "Le pack annuel rassemble les fiches de ton année. Le Pack Ultra réunit les fiches, les podcasts et vidéos, ainsi que les exercices corrigés disponibles dans ton semestre. La liste des matières de chaque pack se consulte avant de choisir.",
  },
];

const APERCUS = [
  { id: "cours-fiche-finances-publiques-l2-s1", fichier: "cours-fiche-finances-publiques-l2-s1.pdf", titre: "Finances publiques · L2 S1 · Fiche complète", pages: [3, 12, 25], total: 66, sha256: "e3580913268090cf3aad89fc545ebd917788c5fd0efc72b6700fc07ade3d60cf", sha256R2: "9bc8c30a80e1020c6ddcd877299faf651255f60b3d936405342ec1029f31378e", modificationR2: "2026-10-23T04:06:17+00:00", texteLocalIdentique: true },
  { id: "cours-fiche-philo-droit-l2-s1", fichier: "cours-fiche-philo-droit-l2-s1.pdf", titre: "Philosophie du droit · L2 S1 · Fiche complète", pages: [3, 17, 40], total: 61, sha256: "8d813a0f189bfc94232cec5b2f89aa2f79c52f1a312918d52e70099de6a402f3", sha256R2: "cefc29870cbd551f4568af4c6ecd38779186e6f423d97cd3c02416a65179f10e", modificationR2: "2026-10-29T00:07:57+00:00", texteLocalIdentique: true },
];

// Références des extraits du comparateur de formats.
const COMPARAISON_DOL = [
  { format: "fiche", produit: "fiche-contrats-l2-s1", cleR2: "tjd/fiche-contrats-l2-s1.pdf", total: 208, pagePDF: 92,
    sha256PDF: "45f05314c67a5e1f78f6a52b1512c0ed5186eaa4bf5d9fa3b50001778aa2d244", modificationR2: "2026-11-06T22:27:42+00:00",
    image: "assets/apercus/comparatif-dol-fiche-20261106-hierarchie.png", sha256Image: "4d7a7d258aac0e06c3308c3531257ce0b9adf7aaa23a797f3c8de4aac82109ef",
    alt: "Extrait de la fiche de droit des contrats, page 92 du PDF, avec le début du chapitre sur le dol et ses éléments constitutifs" },
];

// Titres reproduits depuis le sommaire (page 2) de chaque PDF livré.
const SOMMAIRES = {
  "cours-fiche-finances-publiques-l2-s1": ["Introduction aux finances publiques", "Les principes budgétaires", "La LOLF et le droit budgétaire contemporain", "La procédure budgétaire", "L'exécution et le contrôle budgétaires"],
  "cours-fiche-philo-droit-l2-s1": ["Qu'est-ce que la philosophie du droit ?", "Jusnaturalisme : de l'Antiquité à l'époque moderne", "Les grandes théories positivistes", "Rawls, Dworkin et les théories de la justice", "Au-delà du positivisme : réalisme, CLS et théories critiques"],
};
for (const apercu of APERCUS) apercu.sommaire = SOMMAIRES[apercu.id];

const { produits: apercusVerifies } = require("./apercus-produits.json");
for (const item of APERCUS) {
  const apercu = apercusVerifies[item.id];
  if (!apercu) continue;
  item.pages = apercu.variantes[0].pages;
  item.images = apercu.variantes[0].images;
  item.total = apercu.pages_pdf;
  item.sha256 = apercu.sha256;
  item.sha256R2 = apercu.sha256;
  delete item.modificationR2;
}
for (const extrait of COMPARAISON_DOL) {
  const apercu = apercusVerifies[extrait.produit];
  const choix = apercu?.comparaison_dol;
  if (!choix) continue;
  extrait.total = apercu.pages_pdf;
  extrait.pagePDF = choix.page_pdf;
  extrait.sha256PDF = apercu.sha256;
  extrait.image = choix.image;
  extrait.sha256Image = apercu.preuves_images[choix.image].sha256_image;
  extrait.alt = extrait.alt.replace(/page \d+ du PDF/, `page ${choix.page_pdf} du PDF`);
  delete extrait.modificationR2;
}

module.exports = { BESOINS, APERCUS, COMPARAISON_DOL };
