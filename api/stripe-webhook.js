// Webhook Stripe : reçoit checkout.session.completed,
// génère des tokens de téléchargement HMAC et envoie l'email Brevo.
// Trace aussi les codes ambassadeurs utilisés dans les logs Vercel.

const crypto = require("crypto");
const PRODUITS = require("./_produits");

module.exports.config = { api: { bodyParser: false } };

async function lireBodyBrut(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifierSignatureStripe(body, header, secret) {
  if (!header) return false;
  const parties = {};
  header.split(",").forEach(p => {
    const [k, v] = p.split("=");
    if (k && v) parties[k] = v;
  });
  const t = parties["t"];
  const v1 = parties["v1"];
  if (!t || !v1) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(t, 10)) > 300) return false;
  const payload = `${t}.${body.toString("utf-8")}`;
  const attendu = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(attendu, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

function genererToken(produitId, blobIndex, expiry, secret) {
  const message = `${produitId}|${blobIndex}|${expiry}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function construireLiensEmail(produitId, produit, secret, origin) {
  const expiry = Math.floor(Date.now() / 1000) + 48 * 3600;
  return produit.blobs.map((blobUrl, i) => {
    const sig = genererToken(produitId, i, expiry, secret);
    const url = `${origin}/api/telecharger?id=${encodeURIComponent(produitId)}&b=${i}&exp=${expiry}&sig=${sig}`;
    const suffixes = { flashcards: "Flashcards", qcm: "QCM", anki: "Deck Anki" };
    const brut = blobUrl.split("/").pop().replace(/\.(pdf|apkg)$/i, "");
    const dernierMot = brut.split("-").pop();
    const nom = suffixes[dernierMot] || brut.replace(/-/g, " ");
    return { nom, url };
  });
}

// Récupère le code textuel d'un promotion code Stripe (ex: "LYON3JULIE")
async function recupererCodePromo(promotionCodeId, stripeKey) {
  try {
    const resp = await fetch(`https://api.stripe.com/v1/promotion_codes/${promotionCodeId}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.code || null;
  } catch {
    return null;
  }
}

async function envoyerEmail(email, produit, liens, brevoKey, codeAmbassadeur) {
  const boutons = liens.map(l =>
    `<a href="${l.url}" style="display:inline-block;margin:8px 0;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">
      Télécharger ${l.nom}
    </a><br>`
  ).join("\n");

  const ligneCodePromo = codeAmbassadeur
    ? `<p style="font-size:13px;color:#555;margin:0 0 16px;">Réduction appliquée avec le code <strong>${codeAmbassadeur}</strong>.</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a237e;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">TrajectoireDroit</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:18px;font-weight:700;color:#1a237e;margin:0 0 16px;">Ton achat est confirmé !</p>
          <p style="font-size:15px;color:#333;margin:0 0 8px;">
            Merci pour ton achat : <strong>${produit.nom}</strong>.
          </p>
          ${ligneCodePromo}
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Clique sur le bouton ci-dessous pour télécharger ton PDF. Le lien est valable 48 heures.
          </p>
          ${boutons}
          <p style="font-size:13px;color:#777;margin:24px 0 0;">
            Si le lien expire, réponds à cet email et je te l'envoie de nouveau.
          </p>
        </td></tr>
        <tr><td style="background:#f0f0f0;padding:16px 32px;">
          <p style="font-size:12px;color:#999;margin:0;">TrajectoireDroit &mdash; La référence francophone en droit</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texte = `Ton achat est confirmé : ${produit.nom}.\n\nTélécharge ton PDF ici :\n${liens.map(l => l.url).join("\n")}\n\nLien valable 48 heures.`;

  const payload = {
    sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
    to: [{ email }],
    subject: `Ton achat : ${produit.nom}`,
    htmlContent: html,
    textContent: texte,
  };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${err}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const body = await lireBodyBrut(req);
  const sig = req.headers["stripe-signature"] || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const brevoKey = process.env.BREVO_API_KEY;
  const downloadSecret = process.env.DOWNLOAD_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const origin = "https://trajectoiredroit.com";

  if (!webhookSecret || !brevoKey || !downloadSecret) {
    console.error("Variables d'environnement manquantes");
    res.status(500).end();
    return;
  }

  if (!verifierSignatureStripe(body, sig, webhookSecret)) {
    console.error("Signature Stripe invalide");
    res.status(400).json({ erreur: "Signature invalide" });
    return;
  }

  let evt;
  try { evt = JSON.parse(body.toString("utf-8")); } catch { res.status(400).end(); return; }

  if (evt.type !== "checkout.session.completed") {
    res.status(200).json({ recu: true });
    return;
  }

  const session = evt.data.object;
  const produitId = session.metadata && session.metadata.produitId;
  const email = session.customer_details && session.customer_details.email;

  if (!produitId || !email) {
    console.error("produitId ou email manquant dans la session:", JSON.stringify(session));
    res.status(200).json({ recu: true });
    return;
  }

  const produit = PRODUITS[produitId];
  if (!produit) {
    console.error("produitId inconnu:", produitId);
    res.status(200).json({ recu: true });
    return;
  }

  // Détecter un code ambassadeur utilisé
  let codeAmbassadeur = null;
  const discounts = session.discounts || [];
  if (discounts.length > 0 && stripeKey) {
    const promotionCodeId =
      typeof discounts[0].promotion_code === "string"
        ? discounts[0].promotion_code
        : discounts[0].promotion_code?.id || null;
    if (promotionCodeId) {
      codeAmbassadeur = await recupererCodePromo(promotionCodeId, stripeKey);
    }
  }

  const montantEuros = session.amount_total != null ? (session.amount_total / 100).toFixed(2) : "?";

  if (codeAmbassadeur) {
    console.log(`[AMBASSADEUR] code=${codeAmbassadeur} produit=${produitId} montant=${montantEuros}€ session=${session.id}`);
  } else {
    console.log(`[VENTE] produit=${produitId} montant=${montantEuros}€ session=${session.id}`);
  }

  const liens = construireLiensEmail(produitId, produit, downloadSecret, origin);

  try {
    await envoyerEmail(email, produit, liens, brevoKey, codeAmbassadeur);
    console.log(`Email envoyé à ${email} pour ${produitId}${codeAmbassadeur ? " (code " + codeAmbassadeur + ")" : ""}`);
  } catch (e) {
    console.error("Erreur envoi email:", e.message);
  }

  res.status(200).json({ recu: true });
};
