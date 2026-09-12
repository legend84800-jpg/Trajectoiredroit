// Génère la partie "PRODUITS ET SERVICES" du prompt de l'assistant (api/chat.js) à
// partir du vrai catalogue (_produits.js), en réutilisant la même classification par
// famille que les suggestions post achat (_suggestions-post-achat.js), pour n'avoir
// qu'une seule vérité sur "quelle famille est ce produit" dans tout le site.
// But : qu'un format entier (fiches de citations, fiches d'arrêt payantes...) ne
// puisse plus disparaître silencieusement du prompt comme le 11/09/2026, où le
// catalogue tapé à la main dans chat.js ignorait ces deux formats et attribuait les
// flashcards + QCM à la mauvaise page.

const PRODUITS = require("./_produits");
const { CATALOGUE_ANALYSE } = require("./_suggestions-post-achat");

function euros(centimes) {
  return (centimes / 100).toFixed(2).replace(/\.00$/, "").replace(".", ",") + " €";
}

function idsDe(famille) {
  return CATALOGUE_ANALYSE.filter((p) => p.famille === famille).map((p) => p.id);
}

// Un seul prix si tout le sous-ensemble est au même tarif, sinon une fourchette :
// reste correct même si une famille se met un jour à varier en prix.
function prixTexte(ids) {
  const valeurs = [...new Set(ids.map((id) => PRODUITS[id].prix))].sort((a, b) => a - b);
  if (valeurs.length === 1) return euros(valeurs[0]);
  return `${euros(valeurs[0])} à ${euros(valeurs[valeurs.length - 1])}`;
}

function genererProduitsEtServices() {
  const ficheComplete = idsDe("fiche-complete");
  const coursComplet = idsDe("cours-complet");
  const majeure = idsDe("majeure");
  const ficheArret = idsDe("fiche-arret");
  const citations = idsDe("citations");
  const flashcards = idsDe("flashcards-qcm");
  const casPratique = idsDe("cas-pratique");
  const commentaire = idsDe("commentaire-arret");
  const dissertation = idsDe("dissertation");
  const exercices = [...casPratique, ...commentaire, ...dissertation];

  return `PRODUITS ET SERVICES (tous les PDF sont couverts par la garantie satisfait ou remboursé 7 jours, un simple email suffit) :
formations.html — les fiches complètes PDF (${prixTexte(ficheComplete)} la matière, ${ficheComplete.length} matières), les packs par année (L1, L2, L3) et le pack licence complète à 179 €
cours-fiches.html — les cours complets PDF, le format le plus développé par matière (${prixTexte(coursComplet)}, ${coursComplet.length} matières), plus les packs annuels par année
majeures-preparees.html — majeures préparées PDF (la règle de droit condition par condition, pour les cas pratiques, ${prixTexte(majeure)}, ${majeure.length} matières), plus les packs annuels par année
revisions.html — fiches d'arrêt par matière (${prixTexte(ficheArret)}, ${ficheArret.length} matières) et fiches de citations par matière (${prixTexte(citations)}, ${citations.length} matières), plus les packs annuels
flashcards-qcm.html — flashcards + QCM par matière avec deck Anki inclus (${prixTexte(flashcards)}, ${flashcards.length} matières)
corriges.html — cas pratiques corrigés (${casPratique.length} matières), commentaires d'arrêt corrigés (${commentaire.length} matières) et dissertations corrigées (${dissertation.length} matières), ${prixTexte(exercices)} chacun, plus des packs annuels par année
outil-fiche-arret.html — Portalis, l'outil qui corrige les copies par IA (1 essai gratuit, puis 6 €/mois)
cours-particuliers.html — cours particuliers de droit en visio avec Julien, 98 €/h
stage-methode.html — stage de méthode en direct, ${euros(PRODUITS["stage-methode"].prix)}
quiz-methode.html — quiz gratuit en 3 minutes pour voir où on perd des points (sans inscription)`;
}

module.exports = { genererProduitsEtServices };
