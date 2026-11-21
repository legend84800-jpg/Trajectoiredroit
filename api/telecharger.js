// Vérifie le lien d'achat et transmet le fichier choisi à la route de stockage privé.
// GET /api/telecharger?id=<produit_id>&b=<blob_index>&exp=<timestamp_unix>&sig=<hmac_hex>

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const {
  genererToken,
  genererJetonPersonnalisation,
} = require("./_liens-telechargement");

const PAGE_LIEN_EXPIRE = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lien de téléchargement expiré | Trajectoire Droit</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: clamp(1rem, 5vw, 3rem); background: #f2f5fb; color: #1a2851; font: 1rem/1.6 system-ui, sans-serif; }
    main { max-width: 36rem; margin: clamp(1rem, 7vh, 4rem) auto; padding: clamp(1.25rem, 5vw, 2.5rem); background: #fff; border: 1px solid #c9d3ea; border-radius: 18px; }
    .marque { margin: 0 0 1rem; font-weight: 700; }
    h1 { margin: 0; font: 700 clamp(1.7rem, 5vw, 2.25rem)/1.2 Georgia, serif; }
    a { color: #1a2851; text-underline-offset: .16em; }
    a:focus-visible { outline: 3px solid #315ca6; outline-offset: 3px; }
    .bouton { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: .65rem 1rem; border-radius: .6rem; background: #1a2851; color: #fff; font-weight: 700; }
    .aide { margin-bottom: 0; }
  </style>
</head>
<body>
  <main>
    <p class="marque">Trajectoire Droit</p>
    <h1>Ce lien de téléchargement a expiré</h1>
    <p>Pour retrouver un fichier acheté, il faut se connecter à Mon compte avec l’adresse email utilisée lors de l’achat.</p>
    <a class="bouton" href="/mon-compte.html" rel="noreferrer">Retrouver mes documents</a>
    <p class="aide"><a href="/faq.html#pdf-manquant" rel="noreferrer">Aide pour un problème de téléchargement</a></p>
  </main>
</body>
</html>`;

function nomFichierDepuisUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "document.pdf")
      .replace(/penal-general-l1(?=[.-])/, "penal-general-l2")
      .replace(/^fiche-arret-penal-plan-l1s2\.pdf$/, "fiche-arret-penal-plan-general-l2.pdf");
  } catch {
    return "document.pdf";
  }
}

module.exports = async (req, res) => {
  const { id, b, exp, sig, sid = "" } = req.query || {};
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (!id || b === undefined || !exp || !sig) {
    res.status(400).send("Lien invalide ou incomplet.");
    return;
  }

  const expiry = parseInt(exp, 10);
  if (isNaN(expiry) || Math.floor(Date.now() / 1000) > expiry) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(410).send(PAGE_LIEN_EXPIRE);
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
  res.redirect(302, `/api/personnaliser-pdf?${parametres.toString()}`);
};

module.exports._test = { nomFichierDepuisUrl };
