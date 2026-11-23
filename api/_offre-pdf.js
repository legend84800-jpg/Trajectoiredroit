// Produit de la même matière proposé après un document offert (proposition C40, 23/11/2026).
//
// Un seul choix par document, lu à la fois par la dernière page du PDF offert
// (livrables/automatisation/pdf-offert-premier-ecran/page_offre.py), par le mail de
// livraison J+0 et par la relance J+3. La page du PDF et les deux mails mènent ainsi
// au même produit, par un lien direct vers sa page, sans code de réduction.
//
//   fiche d'arrêt        -> compilation de commentaires (ou majeures) recommandée pour
//                           cet arrêt, sinon le produit de la matière de la fiche ;
//   corrigé de matière   -> compilation de cas pratiques corrigés de la matière ;
//   corrigé d'exercice   -> compilation dont l'exercice est tiré.

const PRODUITS = require("./_produits");
const FICHES = require("./_fiches-arrets.json");
const EXERCICES = require("./_corriges-exercices.json");
const PLANS = require("./_plans-commentaires.json");
const RECOMMANDATIONS = require("./_recommandations-arrets.json");
const { SUJETS, sujetDe } = require("./_offres-matieres");

const SITE = "https://trajectoiredroit.com";

const recommandationParPage = new Map();
for (const [produit, r] of Object.entries(RECOMMANDATIONS)) {
  for (const plan of r.plans) {
    const entree = PLANS[plan];
    if (entree) recommandationParPage.set(entree.page, { produit, destination: r.destination });
  }
}

// Page où le produit se présente et s'achète.
function cheminProduit(id) {
  if (id.startsWith("fiche-")) return `formations.html#${id}`;
  if (id.startsWith("maj-")) return `majeures-preparees.html#${id}`;
  if (id === "cours-images-contrats-l2-s1") return "droit-des-contrats-en-images.html";
  if (id.startsWith("commentaire-arret-")) return `commentaires-arret-corriges.html#${id}`;
  // Cas pratiques et dissertations : bloc d'achat du produit choisi.
  return `corriges.html?produit=${encodeURIComponent(id)}#recueil-selectionne`;
}

function avecSuivi(chemin, { source, medium, campagne, contenu }) {
  const url = new URL(chemin, SITE + "/");
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", campagne);
  url.searchParams.set("utm_content", contenu);
  return url.href;
}

// type : "fiche-arret" | "corrige-offert" | "corrige-exercice".
// canal : "pdf" pour la dernière page du PDF, "email" pour les mails Brevo.
function offreDocument(type, slug, canal = "email") {
  let produit;
  let chemin;
  if (type === "fiche-arret") {
    const f = FICHES[slug];
    if (!f) return null;
    const reco = recommandationParPage.get(f.page);
    produit = reco ? reco.produit : f.produit;
    // Une fiche complète recommandée mène à sa carte produit plutôt qu'à la page de la matière.
    chemin = reco && !produit.startsWith("fiche-") ? reco.destination : cheminProduit(produit);
  } else if (type === "corrige-offert") {
    produit = slug;
    chemin = cheminProduit(produit);
  } else if (type === "corrige-exercice") {
    const x = EXERCICES[slug];
    if (!x) return null;
    produit = x.produit;
    chemin = cheminProduit(produit);
  } else {
    return null;
  }
  const p = PRODUITS[produit];
  if (!p) return null;
  // « de droit administratif L2 S1 », pour les phrases de la page et des mails.
  const cle = sujetDe(produit);
  const semestre = p.nom.match(/ (S[12])$/)?.[1];
  const de = cle ? SUJETS[cle].de + (semestre ? " " + semestre : "") : "de " + p.nom;
  const suivi = canal === "pdf"
    ? { source: "pdf-offert", medium: "pdf", campagne: type, contenu: slug }
    : { source: "brevo", medium: "email", campagne: type, contenu: slug };
  return {
    produit,
    nom: p.nom,
    prix: p.prix,
    de,
    url: avecSuivi(chemin, suivi),
    adresse: "trajectoiredroit.com/" + chemin.split("?")[0].split("#")[0],
  };
}

// Tous les documents offerts, pour le générateur de la dernière page.
function documentsOfferts(corrigesMatiere) {
  const liste = [];
  for (const [slug, f] of Object.entries(FICHES)) liste.push({ type: "fiche-arret", slug, pdf: f.pdf, titre: f.titre });
  for (const slug of corrigesMatiere) liste.push({ type: "corrige-offert", slug });
  for (const [slug, x] of Object.entries(EXERCICES)) liste.push({ type: "corrige-exercice", slug, pdf: x.pdf, titre: x.titre });
  return liste.map(d => ({ ...d, offre: offreDocument(d.type, d.slug, "pdf") }));
}

module.exports = { offreDocument, documentsOfferts, cheminProduit };

if (require.main === module) {
  const { CORRIGES_OFFERTS, urlPdf } = require("./lead");
  const docs = documentsOfferts(Object.keys(CORRIGES_OFFERTS))
    .map(d => d.type === "corrige-offert" ? { ...d, pdf: urlPdf(d.slug) } : d);
  process.stdout.write(JSON.stringify(docs, null, 1));
}
