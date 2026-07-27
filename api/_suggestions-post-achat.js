// Vague 2.6 : suggestions affichées sur merci-achat.html juste après le paiement,
// le moment où la confiance de l'acheteur est maximale. Construit dynamiquement
// depuis _produits.js (aucune donnée dupliquée) : déduit la matière et la famille
// de chaque produit à partir de son nom, puis propose 2-3 compléments de la même
// matière dans une famille différente de celle déjà achetée.

const PRODUITS = require("./_produits");

const FAMILLES = [
  { prefixe: "Pack ", famille: "pack", priorite: 1 },
  { prefixe: "Cours complet", famille: "cours-complet", priorite: 2 },
  { prefixe: "Fiche complète", famille: "fiche-complete", priorite: 3 },
  { prefixe: "Majeures préparées", famille: "majeure", priorite: 4 },
  { prefixe: "Flashcards + QCM", famille: "flashcards-qcm", priorite: 5 },
  { prefixe: "Fiches d'arrêt", famille: "fiche-arret", priorite: 6 },
  { prefixe: "Commentaires d'arrêt", famille: "commentaire-arret", priorite: 7 },
  { prefixe: "Cas pratiques corrigés", famille: "cas-pratique", priorite: 7 },
  { prefixe: "Dissertations corrigées", famille: "dissertation", priorite: 7 },
  { prefixe: "Fiche de citations", famille: "citations", priorite: 8 },
];

function analyserProduit(id, nom) {
  const match = FAMILLES.find((f) => nom.startsWith(f.prefixe));
  const famille = match ? match.famille : "autre";
  const priorite = match ? match.priorite : 9;
  const matiere = nom
    .replace(/^(Pack |Cours complet |Fiche complète |Majeures préparées |Flashcards \+ QCM |Fiches d'arrêt |Commentaires d'arrêt |Cas pratiques corrigés |Dissertations corrigées |Fiche de citations )/, "")
    .replace(/\s*\(.*$/, "")
    .replace(/\s+S[12]$/i, "")
    .replace(/\s*complet$/i, "")
    .trim()
    .toLowerCase();
  return { id, nom, famille, priorite, matiere };
}

const CATALOGUE_ANALYSE = Object.entries(PRODUITS).map(([id, p]) => analyserProduit(id, p.nom));

// Retourne jusqu'à `max` produits complémentaires : même matière, famille différente
// de celles déjà achetées, triés par priorité (pack et cours complet en tête).
function suggererComplements(produitIdsAchetes, max) {
  const achetes = CATALOGUE_ANALYSE.filter((p) => produitIdsAchetes.includes(p.id));
  if (!achetes.length) return [];

  const famillesDejaAchetees = new Set(achetes.map((p) => p.famille));
  const matieresAchetees = new Set(achetes.map((p) => p.matiere));

  const candidats = CATALOGUE_ANALYSE.filter(
    (p) =>
      !produitIdsAchetes.includes(p.id) &&
      matieresAchetees.has(p.matiere) &&
      !famillesDejaAchetees.has(p.famille)
  ).sort((a, b) => a.priorite - b.priorite);

  const vus = new Set();
  const resultat = [];
  for (const c of candidats) {
    if (vus.has(c.famille)) continue; // une seule suggestion par famille, pour varier
    vus.add(c.famille);
    resultat.push({ id: c.id, nom: PRODUITS[c.id].nom, prix: PRODUITS[c.id].prix });
    if (resultat.length >= max) break;
  }
  return resultat;
}

module.exports = { suggererComplements };
