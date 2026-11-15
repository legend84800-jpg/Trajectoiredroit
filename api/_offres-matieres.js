// Offre de la matière d'un inscrit (15/11/2026, audits des routines du 15/11, codes A1, A4 et A5).
//
// L'attribut Brevo MATIERE contient l'identifiant d'un produit (cas-pratique-contrats-l2-s1,
// maj-biens-l2, fiche-da-l2-s1, dissertation-intro-droit-l1...). Ce module en déduit la matière
// (contrats-l2-s1, biens-l2...) puis :
//   - le nom de la matière à écrire dans un email (attributs MATIERE_NOM et MATIERE_DE) ;
//   - la page qui vend, dans cette matière, le format demandé (exercices corrigés, majeures,
//     fiche complète). La redirection /api/offre s'en sert pour le lien personnalisé de la
//     newsletter, qui porte ?m={{contact.MATIERE}}.

const PRODUITS = require("./_produits");
const { COMPTES } = require("./_corriges-exercices");

const SITE = "https://trajectoiredroit.com";

// nom : nom de la matière tel que l'étudiant le connaît. de : complément prêt à écrire
// après « les corrigés », « les majeures »... page : page de la matière sur le site.
const SUJETS = {
  "intro-droit-l1": { nom: "Introduction au droit L1", de: "d'introduction au droit L1", page: "introduction-au-droit-l1.html" },
  "hist-droit-l1": { nom: "Histoire du droit L1", de: "d'histoire du droit L1", page: "histoire-du-droit-l1.html" },
  "hist-institutions-l1": { nom: "Histoire des institutions L1", de: "d'histoire des institutions L1", page: "histoire-des-institutions-l1.html" },
  "personnes-l1": { nom: "Droit des personnes L1", de: "de droit des personnes L1", page: "droit-des-personnes-l1.html" },
  "famille-l1-s2": { nom: "Droit de la famille L1", de: "de droit de la famille L1", page: "droit-de-la-famille-l1.html" },
  "constit-l1-s1": { nom: "Droit constitutionnel L1 S1", de: "de droit constitutionnel L1", page: "droit-constitutionnel-l1.html" },
  "constit-l1-s2": { nom: "Droit constitutionnel L1 S2", de: "de droit constitutionnel L1", page: "droit-constitutionnel-l1.html" },
  "penal-general-l1": { nom: "Droit pénal général L1", de: "de droit pénal général L1", page: "droit-penal-general-l1.html" },
  "relations-internationales-l1": { nom: "Relations internationales L1", de: "de relations internationales L1", page: "relations-internationales-l1.html" },
  "da-l2-s1": { nom: "Droit administratif L2 S1", de: "de droit administratif L2", page: "droit-administratif-l2.html" },
  "da-l2-s2": { nom: "Droit administratif L2 S2", de: "de droit administratif L2", page: "droit-administratif-l2.html" },
  "contrats-l2-s1": { nom: "Droit des contrats L2", de: "de droit des contrats L2", page: "droit-des-contrats-l2.html" },
  "obligations-l2-s2": { nom: "Droit des obligations L2 S2", de: "de droit des obligations L2", page: "droit-des-obligations-l2.html" },
  "penal-l2-s1": { nom: "Droit pénal L2 S1", de: "de droit pénal L2", page: "droit-penal-l2.html" },
  "penal-l2-s2": { nom: "Droit pénal L2 S2", de: "de droit pénal L2", page: "droit-penal-l2.html" },
  "biens-l2": { nom: "Droit des biens L2", de: "de droit des biens L2", page: "droit-des-biens-l2.html" },
  "commercial-l3-s1": { nom: "Droit commercial L3 S1", de: "de droit commercial L3", page: "droit-commercial-l3.html" },
  "commercial-l3-s2": { nom: "Droit commercial L3 S2", de: "de droit commercial L3", page: "droit-commercial-l3.html" },
  "societes-l3-s1": { nom: "Droit des sociétés L3 S1", de: "de droit des sociétés L3", page: "droit-des-societes-l3.html" },
  "societes-l3-s2": { nom: "Droit des sociétés L3 S2", de: "de droit des sociétés L3", page: "droit-des-societes-l3.html" },
  "contrats-speciaux-l3": { nom: "Contrats spéciaux L3", de: "de contrats spéciaux L3", page: "contrats-speciaux-l3.html" },
  "travail-l3-s1": { nom: "Droit du travail L3", de: "de droit du travail L3", page: "droit-du-travail-l3.html" },
  "procedure-penale-l3": { nom: "Procédure pénale L3", de: "de procédure pénale L3", page: "procedure-penale-l3.html" },
  "penal-special-l3": { nom: "Droit pénal spécial L3", de: "de droit pénal spécial L3", page: "" },
  "procedure-civile-l3-s1": { nom: "Procédure civile L3", de: "de procédure civile L3", page: "" },
  "dip-l3-s2": { nom: "Droit international privé L3", de: "de droit international privé L3", page: "" },
};

// Identifiants dont la matière ne se lit pas en retirant seulement le préfixe du format.
const ALIAS = { "travail-l3": "travail-l3-s1", "societes-l3": "societes-l3-s1" };
const PREFIXES = ["cas-pratique-", "commentaire-arret-", "dissertation-", "maj-", "cours-fiche-",
  "flashcards-qcm-", "audio-video-", "citations-", "fiche-arret-", "fiche-", "cours-complet-"];

function sujetDe(id) {
  if (typeof id !== "string") return null;
  const brut = id.trim().toLowerCase();
  const prefixe = PREFIXES.find(p => brut.startsWith(p));
  if (!prefixe) return null;
  let cle = brut.slice(prefixe.length);
  if (ALIAS[cle]) cle = ALIAS[cle];
  if (SUJETS[cle]) return cle;
  if (SUJETS[cle + "-s1"]) return cle + "-s1";
  return null;
}

// Attributs Brevo écrits sur le contact, lus par la newsletter ({{ contact.MATIERE_DE }}).
function attributsMatiere(id) {
  const cle = sujetDe(id);
  if (!cle) return { MATIERE_NOM: "", MATIERE_DE: "" };
  return { MATIERE_NOM: SUJETS[cle].nom, MATIERE_DE: SUJETS[cle].de };
}

const FORMATS = {
  exercices: { prefixes: ["cas-pratique-", "commentaire-arret-", "dissertation-"], repli: "corriges.html" },
  majeures: { prefixes: ["maj-"], repli: "majeures-preparees.html" },
  fiche: { prefixes: ["fiche-"], repli: "cours-fiches.html" },
};

function produitsDuSujet(cle) {
  return Object.keys(PRODUITS).filter(id => !PRODUITS[id].venteSuspendue && sujetDe(id) === cle);
}

// Chemin de la page qui vend le format demandé dans la matière de l'identifiant fourni.
function cheminOffre(id, format) {
  const f = FORMATS[format] ? format : "exercices";
  const cle = sujetDe(id);
  if (!cle) return FORMATS[f].repli;
  const produits = produitsDuSujet(cle);
  const demande = String(id).trim().toLowerCase();
  if (f === "exercices") {
    // Le recueil de l'inscrit d'abord (celui de son corrigé offert), puis les autres formats d'exercice.
    const choix = (COMPTES[demande] !== undefined && demande) || FORMATS.exercices.prefixes
      .map(p => produits.find(x => x.startsWith(p) && COMPTES[x] !== undefined)).find(Boolean);
    if (choix) return "corriges.html?produit=" + encodeURIComponent(choix) + "#recueil-selectionne";
  }
  if (f === "majeures") {
    const maj = produits.find(x => x.startsWith("maj-"));
    if (maj) return "majeures-preparees.html?produit=" + encodeURIComponent(maj);
  }
  return SUJETS[cle].page || FORMATS[f].repli;
}

function urlOffre(id, format, params) {
  const chemin = cheminOffre(id, format);
  const [base, ancre] = chemin.split("#");
  const url = new URL(SITE + "/" + base);
  for (const [k, v] of Object.entries(params || {})) if (v) url.searchParams.set(k, v);
  return url.toString() + (ancre ? "#" + ancre : "");
}

module.exports = { SUJETS, sujetDe, attributsMatiere, cheminOffre, urlOffre, FORMATS };
