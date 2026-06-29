// Vérifie le token HMAC et redirige vers l'URL Vercel Blob.
// GET /api/telecharger?id=<produit_id>&b=<blob_index>&exp=<timestamp_unix>&sig=<hmac_hex>

const crypto = require("crypto");
const PRODUITS = require("./_produits");

module.exports = async (req, res) => {
  const { id, b, exp, sig } = req.query || {};

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
  const message = `${id}|${blobIndex}|${expiry}`;
  const attendu = crypto.createHmac("sha256", secret).update(message).digest("hex");

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

  res.redirect(302, produit.blobs[blobIndex]);
};
