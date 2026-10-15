// Suggestions de compléments après un achat (merci-achat.html, complements.html,
// Mon compte). Construit dynamiquement depuis _produits.js, sans donnée dupliquée.
//
// Version 2 (14/10/2026), calée sur les rachats réels observés dans Stripe :
//   - la même matière dans un autre format (fiche DA, puis cours complet DA,
//     puis fiches d'arrêt de droit administratif) ;
//   - le même format dans les autres matières de la même année (majeures DA,
//     puis majeures contrats et majeures pénal L2) ;
//   - le semestre suivant de la même matière, dans le format déjà acheté.
// Un pack n'est proposé que s'il ne contient rien de ce que l'étudiant possède
// déjà : il ne repaie jamais un PDF qu'il a.

const PRODUITS = require("./_produits");

const FAMILLES = [
  { prefixe: "Pack ", famille: "pack", priorite: 1 },
  { prefixe: "Le Pack ", famille: "pack", priorite: 1 },
  { prefixe: "Cours complet", famille: "cours-complet", priorite: 2 },
  { prefixe: "Fiche complète", famille: "fiche-complete", priorite: 3 },
  { prefixe: "Podcasts et vidéos", famille: "podcasts-videos", priorite: 3 },
  { prefixe: "Majeures préparées", famille: "majeure", priorite: 4 },
  { prefixe: "Flashcards + QCM", famille: "flashcards-qcm", priorite: 5 },
  { prefixe: "Fiches d'arrêt", famille: "fiche-arret", priorite: 6 },
  { prefixe: "Commentaires d'arrêt", famille: "commentaire-arret", priorite: 7 },
  { prefixe: "Cas pratiques corrigés", famille: "cas-pratique", priorite: 7 },
  { prefixe: "Dissertations corrigées", famille: "dissertation", priorite: 7 },
  { prefixe: "Fiche de citations", famille: "citations", priorite: 8 },
];

// Ordre de proposition dans une même matière : d'abord ce qui sert à apprendre,
// puis ce qui sert à s'entraîner, enfin les révisions éclair.
const ORDRE_MEME_MATIERE = {
  "fiche-complete": 1,
  majeure: 2,
  "cas-pratique": 3,
  "commentaire-arret": 3,
  dissertation: 3,
  "cours-complet": 4,
  "flashcards-qcm": 5,
  "fiche-arret": 6,
  "podcasts-videos": 6,
  citations: 8,
};

// Préfixes d'identifiant, du plus long au plus court, pour isoler la matière.
const PREFIXES_ID = [
  "pack-matiere-", "cours-complet-", "cours-fiche-", "fiche-arret-", "flashcards-qcm-",
  "commentaire-arret-", "cas-pratique-", "dissertation-", "audio-video-", "citations-",
  "fiche-", "maj-",
];

// Quelques identifiants n'utilisent pas le même mot pour la matière.
const ALIAS_SUJET = {
  administratif: "da",
  "philosophie-du-droit": "philo-droit",
};

// Les contrats (L2 S1) et la responsabilité civile (L2 S2) forment le même cours
// de droit des obligations, réparti sur deux semestres.
const GROUPE_SUJET = {
  contrats: "obligations",
};

function analyserNom(nom) {
  const match = FAMILLES.find((f) => nom.startsWith(f.prefixe));
  const famille = match ? match.famille : "autre";
  const priorite = match ? match.priorite : 9;
  const matiere = nom
    .replace(/^(Le Pack |Pack |Cours complet |Fiche complète |Majeures préparées |Flashcards \+ QCM |Fiches d'arrêt |Commentaires d'arrêt |Cas pratiques corrigés |Dissertations corrigées |Fiche de citations |Podcasts et vidéos )/, "")
    .replace(/\s*\(.*$/, "")
    .replace(/\s+S[12]$/i, "")
    .replace(/\s*complet$/i, "")
    .trim()
    .toLowerCase();
  return { famille, priorite, matiere };
}

function analyserId(id) {
  const prefixe = PREFIXES_ID.find((p) => id.startsWith(p));
  if (!prefixe) return { sujet: null, niveau: null, semestre: null };
  const reste = id.slice(prefixe.length);
  const m = reste.match(/^(.*?)(?:-(l[123]))?(?:-(s[12]))?$/);
  if (!m || !m[1]) return { sujet: null, niveau: null, semestre: null };
  const sujet = ALIAS_SUJET[m[1]] || m[1];
  return { sujet, niveau: m[2] || null, semestre: m[3] || null };
}

function analyserProduit(id, produit) {
  const { famille, priorite, matiere } = analyserNom(produit.nom);
  const { sujet, niveau, semestre } = analyserId(id);
  return {
    id,
    nom: produit.nom,
    prix: produit.prix,
    famille: id.startsWith("pack-matiere-") ? "pack-matiere" : famille,
    priorite,
    matiere,
    sujet,
    groupe: sujet ? (GROUPE_SUJET[sujet] || sujet) : null,
    niveau,
    semestre,
    blobs: Array.isArray(produit.blobs) ? produit.blobs : [],
    suspendu: !!produit.venteSuspendue,
  };
}

const CATALOGUE_ANALYSE = Object.entries(PRODUITS).map(([id, p]) => analyserProduit(id, p));
const PAR_ID = new Map(CATALOGUE_ANALYSE.map((p) => [p.id, p]));

// Les fiches d'arrêt n'indiquent pas toujours l'année dans leur identifiant : on
// reprend l'année la plus fréquente des autres produits de la même matière.
(function completerNiveaux() {
  const comptes = new Map();
  for (const p of CATALOGUE_ANALYSE) {
    if (!p.groupe || !p.niveau) continue;
    const c = comptes.get(p.groupe) || {};
    c[p.niveau] = (c[p.niveau] || 0) + 1;
    comptes.set(p.groupe, c);
  }
  for (const p of CATALOGUE_ANALYSE) {
    if (p.niveau || !p.groupe || !comptes.has(p.groupe)) continue;
    const c = comptes.get(p.groupe);
    p.niveau = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  }
})();

const FAMILLES_PROPOSABLES = new Set([
  "pack-matiere", "cours-complet", "fiche-complete", "podcasts-videos", "majeure",
  "flashcards-qcm", "fiche-arret", "commentaire-arret", "cas-pratique", "dissertation",
]);

function proposable(p) {
  return p && !p.suspendu && p.prix > 0 && p.groupe && FAMILLES_PROPOSABLES.has(p.famille);
}

function memeSemestre(a, b) {
  return !a.semestre || !b.semestre || a.semestre === b.semestre;
}

// Retourne jusqu'à `max` produits complémentaires, avec la raison de chaque
// proposition : "meme-matiere", "autre-matiere", "semestre-suivant" ou "pack".
function suggererComplements(produitIdsAchetes, max = 4) {
  const ids = (produitIdsAchetes || []).filter((id) => PAR_ID.has(id));
  if (!ids.length) return [];

  // Tout ce que l'étudiant a déjà, y compris les produits contenus dans un pack acheté.
  const blobsPossedes = new Set(ids.flatMap((id) => PAR_ID.get(id).blobs));
  const possede = (p) => ids.includes(p.id)
    || (p.blobs.length > 0 && p.blobs.every((b) => blobsPossedes.has(b)));
  const chevauche = (p) => p.blobs.some((b) => blobsPossedes.has(b));

  // Un pack annuel n'a pas de matière : on raisonne sur les produits qu'il contient.
  const achetes = CATALOGUE_ANALYSE.filter((p) => p.groupe && possede(p));
  if (!achetes.length) return [];

  const candidats = CATALOGUE_ANALYSE.filter((p) => proposable(p) && !possede(p));
  const groupes = new Set(achetes.map((p) => p.groupe).filter(Boolean));
  // Années dominantes seulement : le Pack L2 contient aussi une fiche de L1, qui ne
  // doit pas faire proposer toute la L1 à un étudiant de L2.
  const comptesNiveaux = {};
  for (const p of achetes) if (p.niveau) comptesNiveaux[p.niveau] = (comptesNiveaux[p.niveau] || 0) + 1;
  const maxNiveau = Math.max(0, ...Object.values(comptesNiveaux));
  const niveaux = new Set(Object.keys(comptesNiveaux).filter((n) => comptesNiveaux[n] * 2 >= maxNiveau));
  const famillesAchetees = new Set(achetes.map((p) => p.famille));
  const famillesParGroupe = new Map();
  for (const a of achetes) {
    if (!a.groupe) continue;
    if (!famillesParGroupe.has(a.groupe)) famillesParGroupe.set(a.groupe, new Set());
    famillesParGroupe.get(a.groupe).add(a.famille);
  }

  // 1. Même matière, même semestre, un format pas encore acheté.
  const memeMatiere = candidats
    .filter((p) => p.famille !== "pack-matiere" && groupes.has(p.groupe)
      && !famillesParGroupe.get(p.groupe).has(p.famille)
      && achetes.some((a) => a.groupe === p.groupe && memeSemestre(a, p)))
    .sort((a, b) => (ORDRE_MEME_MATIERE[a.famille] || 9) - (ORDRE_MEME_MATIERE[b.famille] || 9));

  // 2. Même format, autre matière de la même année.
  const autreMatiere = candidats
    .filter((p) => p.famille !== "pack-matiere" && !groupes.has(p.groupe)
      && famillesAchetees.has(p.famille) && niveaux.has(p.niveau))
    .sort((a, b) => {
      const semA = achetes.some((x) => x.famille === a.famille && memeSemestre(x, a)) ? 0 : 1;
      const semB = achetes.some((x) => x.famille === b.famille && memeSemestre(x, b)) ? 0 : 1;
      return semA - semB;
    });

  // 3. Le semestre suivant de la même matière, dans le format déjà acheté.
  const semestreSuivant = candidats
    .filter((p) => p.famille !== "pack-matiere" && groupes.has(p.groupe)
      && achetes.some((a) => a.groupe === p.groupe && a.famille === p.famille
        && a.semestre && p.semestre && a.semestre !== p.semestre));

  // 4. Le pack de la matière, seulement s'il ne contient rien de déjà acheté.
  const packs = candidats
    .filter((p) => p.famille === "pack-matiere" && groupes.has(p.groupe) && !chevauche(p));

  const sources = [
    { liste: packs, raison: "pack" },
    { liste: memeMatiere, raison: "meme-matiere" },
    { liste: autreMatiere, raison: "autre-matiere" },
    { liste: semestreSuivant, raison: "semestre-suivant" },
  ];

  const resultat = [];
  const vus = new Set();
  const famillesProposeesParGroupe = new Map();
  let ajoutDansTour = true;
  while (resultat.length < max && ajoutDansTour) {
    ajoutDansTour = false;
    for (const { liste, raison } of sources) {
      if (resultat.length >= max) break;
      const suivant = liste.find((p) => {
        if (vus.has(p.id)) return false;
        // Dans une même matière, un seul produit par format, pour varier.
        const cle = `${p.groupe}|${p.famille}`;
        return !famillesProposeesParGroupe.has(cle);
      });
      if (!suivant) continue;
      vus.add(suivant.id);
      famillesProposeesParGroupe.set(`${suivant.groupe}|${suivant.famille}`, true);
      resultat.push({ id: suivant.id, nom: suivant.nom, prix: suivant.prix, raison });
      ajoutDansTour = true;
    }
  }
  return resultat;
}

module.exports = { suggererComplements, CATALOGUE_ANALYSE };
