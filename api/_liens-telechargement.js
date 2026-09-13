// Génération des liens de téléchargement signés (HMAC), partagée entre le webhook Stripe
// (liens 48h envoyés par email) et api/mes-telechargements.js (liens courts régénérés à la
// demande depuis l'espace compte, pour un accès "à vie" réel sans lien permanent qui pourrait fuiter).

const crypto = require("crypto");

function genererToken(produitId, blobIndex, expiry, secret, sessionId = "") {
  const message = sessionId
    ? `${produitId}|${blobIndex}|${expiry}|${sessionId}`
    : `${produitId}|${blobIndex}|${expiry}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function genererJetonPersonnalisation({
  produitId,
  blobIndex,
  expiry,
  sessionId,
  sourceUrl,
  nomProduit,
  nomFichier,
}, secret) {
  const message = [
    "pdf-personnalise-v2",
    produitId,
    String(blobIndex),
    String(expiry),
    sessionId,
    sourceUrl,
    nomProduit,
    nomFichier,
  ].join("|");
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

// Le libellé du fichier principal dépend de la famille de produit (identifiée
// par le préfixe de son nom), faute de quoi le nom de fichier brut fuitait
// dans l'email du client (ex: "fiche da l2 s1" au lieu de "la fiche complète").
function libelleFichierPrincipal(nomProduit) {
  if (nomProduit.startsWith("Cours complet")) return "le cours complet";
  if (nomProduit.startsWith("Majeures préparées")) return "les majeures préparées";
  if (nomProduit.startsWith("Fiche complète")) return "la fiche complète";
  if (nomProduit.startsWith("Fiches d'arrêt")) return "les fiches d'arrêt";
  if (nomProduit.startsWith("Pack")) return "le pack";
  return "le PDF principal";
}

function construireLiensTelechargement(
  produitId,
  produit,
  secret,
  origin,
  dureeSecondes,
  { sessionId = "" } = {}
) {
  const suffixes = {
    flashcards: "les flashcards",
    qcm: "le QCM",
    anki: "le deck Anki",
    cartesmentales: "la carte mentale",
    plan: "le plan du cours",
    "seance-1": "le replay séance 1",
    "seance-2": "le replay séance 2",
    "seance-3": "le replay séance 3",
  };
  // Une vidéo se regarde en place (lecteur intégré), pas en téléchargement ponctuel :
  // le lien doit rester valide le temps de tout un visionnage, jamais seulement 15 minutes,
  // faute de quoi le lecteur perd l'accès en pleine lecture dès qu'il cherche à avancer/reculer.
  const DUREE_MIN_VIDEO_SECONDES = 6 * 60 * 60;
  return produit.blobs.map((blobUrl, i) => {
    const estVideo = /\.mp4$/i.test(blobUrl);
    const dureeEffective = estVideo ? Math.max(dureeSecondes, DUREE_MIN_VIDEO_SECONDES) : dureeSecondes;
    const expiry = Math.floor(Date.now() / 1000) + dureeEffective;
    const sig = genererToken(produitId, i, expiry, secret, sessionId);
    const sessionParam = sessionId ? `&sid=${encodeURIComponent(sessionId)}` : "";
    const url = `${origin}/api/telecharger?id=${encodeURIComponent(produitId)}&b=${i}&exp=${expiry}&sig=${sig}${sessionParam}`;
    const brut = blobUrl.split("/").pop().replace(/\.(pdf|apkg|mp4)$/i, "");
    const segments = brut.split("-");
    const deuxDerniersMots = segments.slice(-2).join("-");
    const dernierMot = segments[segments.length - 1];
    const nom = suffixes[deuxDerniersMots] || suffixes[dernierMot] || libelleFichierPrincipal(produit.nom);
    return { nom, url, type: estVideo ? "video" : "pdf" };
  });
}

module.exports = {
  genererToken,
  genererJetonPersonnalisation,
  libelleFichierPrincipal,
  construireLiensTelechargement,
};
