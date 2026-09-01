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
  const expiry = Math.floor(Date.now() / 1000) + dureeSecondes;
  const suffixes = {
    flashcards: "les flashcards",
    qcm: "le QCM",
    anki: "le deck Anki",
    cartesmentales: "la carte mentale",
    plan: "le plan du cours",
  };
  return produit.blobs.map((blobUrl, i) => {
    const sig = genererToken(produitId, i, expiry, secret, sessionId);
    const sessionParam = sessionId ? `&sid=${encodeURIComponent(sessionId)}` : "";
    const url = `${origin}/api/telecharger?id=${encodeURIComponent(produitId)}&b=${i}&exp=${expiry}&sig=${sig}${sessionParam}`;
    const brut = blobUrl.split("/").pop().replace(/\.(pdf|apkg)$/i, "");
    const dernierMot = brut.split("-").pop();
    const nom = suffixes[dernierMot] || libelleFichierPrincipal(produit.nom);
    return { nom, url };
  });
}

module.exports = {
  genererToken,
  genererJetonPersonnalisation,
  libelleFichierPrincipal,
  construireLiensTelechargement,
};
