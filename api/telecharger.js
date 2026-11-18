// Vérifie le lien d'achat et transmet le fichier choisi à la route de stockage privé.
// GET /api/telecharger?id=<produit_id>&b=<blob_index>&exp=<timestamp_unix>&sig=<hmac_hex>

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const {
  genererToken,
  genererJetonPersonnalisation,
} = require("./_liens-telechargement");

function nomFichierDepuisUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "document.pdf");
  } catch {
    return "document.pdf";
  }
}

module.exports = async (req, res) => {
  const { id, b, exp, sig, sid = "" } = req.query || {};

  if (!id || b === undefined || !exp || !sig) {
    res.status(400).send("Lien invalide ou incomplet.");
    return;
  }

  const expiry = parseInt(exp, 10);
  if (isNaN(expiry) || Math.floor(Date.now() / 1000) > expiry) {
    res.status(410).send("Ce lien de téléchargement a expiré. Contacte contact@trajectoiredroit.com pour en obtenir un nouveau.");
    return;
  }

  const secret = process.env.DOWNLOAD_SECRET;
  if (!secret) { res.status(500).send("Erreur de configuration."); return; }

  const blobIndex = parseInt(b, 10);
  const sessionId = typeof sid === "string" ? sid.trim() : "";
  const attendu = genererToken(id, blobIndex, expiry, secret, sessionId);

  let signaturesIdentiques = false;
  try {
    signaturesIdentiques = crypto.timingSafeEqual(
      Buffer.from(attendu, "hex"),
      Buffer.from(sig, "hex")
    );
  } catch {
    signaturesIdentiques = false;
  }

  if (!signaturesIdentiques) {
    res.status(403).send("Signature invalide.");
    return;
  }

  const produit = PRODUITS[id];
  if (!produit || !produit.blobs[blobIndex]) {
    res.status(404).send("Fichier introuvable.");
    return;
  }

  const sourceUrl = produit.blobs[blobIndex];
  const estPdf = /\.pdf(?:$|\?)/i.test(sourceUrl);
  const estMediaPrive = /^r2:\/\/tjd\/.+\.(mp4|m4a|apkg)$/.test(sourceUrl);
  if (!estPdf && !estMediaPrive) {
    res.status(404).send("Fichier introuvable.");
    return;
  }

  const nomFichier = nomFichierDepuisUrl(sourceUrl);
  const personnalisationSig = genererJetonPersonnalisation({
    produitId: id,
    blobIndex,
    expiry,
    sessionId,
    sourceUrl,
    nomProduit: produit.nom,
    nomFichier,
  }, secret);
  const parametres = new URLSearchParams({
    id,
    b: String(blobIndex),
    exp: String(expiry),
    sid: sessionId,
    src: sourceUrl,
    nom: produit.nom,
    fichier: nomFichier,
    psig: personnalisationSig,
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(302, `/api/personnaliser-pdf?${parametres.toString()}`);
};

module.exports._test = { nomFichierDepuisUrl };
