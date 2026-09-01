// Vérifie le token HMAC et redirige vers l'URL Vercel Blob.
// GET /api/telecharger?id=<produit_id>&b=<blob_index>&exp=<timestamp_unix>&sig=<hmac_hex>

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { genererToken } = require("./_liens-telechargement");

const PRODUIT_PERSONNALISE = "maj-penal-l2-s1";

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

  if (id === PRODUIT_PERSONNALISE && blobIndex === 0) {
    if (!sessionId) {
      res.status(410).send("Ce lien a été créé avant la personnalisation. Connecte-toi à ton espace Mon compte pour générer une copie individuelle.");
      return;
    }
    const parametres = new URLSearchParams({
      id,
      b: String(blobIndex),
      exp: String(expiry),
      sig,
      sid: sessionId,
    });
    res.redirect(302, `/api/personnaliser-pdf?${parametres.toString()}`);
    return;
  }

  res.redirect(302, produit.blobs[blobIndex]);
};
