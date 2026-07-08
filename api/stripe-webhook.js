// Webhook Stripe : reçoit checkout.session.completed,
// génère des tokens de téléchargement HMAC et envoie l'email Brevo.
// Trace aussi les codes ambassadeurs utilisés dans les logs Vercel.
// Remonte aussi l'achat à l'API Conversions Meta (server-side, ne dépend pas
// des bloqueurs de pub), uniquement si le visiteur a accepté les cookies.
// Gère aussi les events d'abonnement Portalis (customer.subscription.*) et
// alimente l'historique d'achats consultable depuis mon-compte.html.

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { upsert, inserer } = require("./_supabase");

// Traduit le statut Stripe en statut simplifié stocké côté Supabase.
function statutAbonnement(statutStripe) {
  if (statutStripe === "active" || statutStripe === "trialing") return "actif";
  if (statutStripe === "past_due" || statutStripe === "unpaid") return "impaye";
  return "annule";
}

async function synchroniserAbonnement(subscription) {
  const userId = subscription.metadata && subscription.metadata.supabase_user_id;
  if (!userId) return; // Abonnement créé hors de ce flux (ex: test manuel Stripe) : on ignore.
  const periodeFin = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  await upsert("abonnements", {
    user_id: userId,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    statut: statutAbonnement(subscription.status),
    periode_fin: periodeFin,
  }, "user_id");
}

const META_PIXEL_ID = "1736839687358457";

async function envoyerAchatMeta({ email, montantEuros, produitIds, sessionId, fbp, fbc }) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return;

  const emHash = crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const userData = { em: [emHash] };
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const payload = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: sessionId, // identique au eventID envoyé par le pixel côté client, pour la déduplication Meta
      action_source: "website",
      event_source_url: "https://trajectoiredroit.com/merci-achat.html",
      user_data: userData,
      custom_data: {
        currency: "EUR",
        value: Number(montantEuros),
        content_ids: produitIds,
        content_type: "product",
      },
    }],
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error("Meta CAPI erreur:", await resp.text());
    }
  } catch (e) {
    console.error("Meta CAPI fetch erreur:", e.message);
  }
}

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

// Recrée une session Checkout identique (mêmes produits, même montant) pour la
// relance de panier abandonné, puisque l'URL d'une session expirée n'est plus
// utilisable et que Stripe ne permet pas de "réouvrir" une session existante.
async function recreerLienCheckout(produitIds, origin, stripeKey) {
  const params = new URLSearchParams({
    "payment_method_types[0]": "card",
    mode: "payment",
    allow_promotion_codes: "true",
    success_url: `${origin}/merci-achat.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/formations.html`,
    "metadata[produitIds]": produitIds.join(","),
    "payment_intent_data[metadata][produitIds]": produitIds.join(","),
    "branding_settings[display_name]": "Trajectoire Droit",
    "branding_settings[icon][type]": "url",
    "branding_settings[icon][url]": `${origin}/assets/logo-tjd-mark.png`,
    "branding_settings[background_color]": "#ffffff",
    "branding_settings[button_color]": "#1A2851",
    "branding_settings[border_style]": "rounded",
    "branding_settings[font_family]": "pt_serif",
  });
  produitIds.forEach((id, i) => {
    const p = PRODUITS[id];
    params.set(`line_items[${i}][price_data][currency]`, "eur");
    params.set(`line_items[${i}][price_data][unit_amount]`, String(p.prix));
    params.set(`line_items[${i}][price_data][product_data][name]`, p.nom);
    params.set(`line_items[${i}][quantity]`, "1");
  });

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Stripe erreur (relance panier): ${JSON.stringify(data.error)}`);
  return data.url;
}

async function envoyerRelancePanier(email, produits, checkoutUrl, brevoKey) {
  const noms = produits.map(p => p.nom).join(" + ");

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
          <p style="font-size:18px;font-weight:700;color:#1a237e;margin:0 0 16px;">Il te manque juste le paiement</p>
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Tu as commencé un achat sur TrajectoireDroit (<strong>${noms}</strong>) sans aller jusqu'au bout. Le lien ci-dessous te ramène directement à l'étape de paiement, rien à ressaisir.
          </p>
          <a href="${checkoutUrl}" style="display:inline-block;margin:8px 0;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">
            Finaliser mon achat
          </a>
          <p style="font-size:13px;color:#777;margin:24px 0 0;">
            Une question avant d'acheter ? Réponds directement à cet email.
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

  const texte = `Tu as commencé un achat sur TrajectoireDroit (${noms}) sans aller jusqu'au bout.\n\nFinalise ton achat ici :\n${checkoutUrl}`;

  const payload = {
    sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
    to: [{ email }],
    subject: `Il te manque juste le paiement (${noms})`,
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

// Panier abandonné : la session a expiré (2h, voir create-checkout.js) sans paiement.
// On ne peut relancer que si Stripe a capté l'email avant l'abandon (le client a
// eu le temps de le taper dans le formulaire Checkout), sinon rien n'est faisable.
async function gererPanierAbandonne(session, brevoKey, stripeKey, origin) {
  if (session.mode === "subscription") return; // Portalis, pas concerné par cette relance.

  const produitIdsRaw = session.metadata && session.metadata.produitIds;
  const email = session.customer_details && session.customer_details.email;

  if (!produitIdsRaw || !email) {
    console.log(`[PANIER ABANDONNÉ] non relançable (email ou produit manquant), session=${session.id}`);
    return;
  }

  const produitIds = produitIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const produitsAbandonnes = produitIds.map(id => PRODUITS[id]).filter(Boolean);
  if (!produitsAbandonnes.length) return;

  const checkoutUrl = await recreerLienCheckout(produitIds, origin, stripeKey);
  await envoyerRelancePanier(email, produitsAbandonnes, checkoutUrl, brevoKey);
  console.log(`[PANIER ABANDONNÉ] relance envoyée à ${email} pour ${produitIds.join("+")}, session expirée=${session.id}`);
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

async function envoyerEmail(email, produits, liens, brevoKey, codeAmbassadeur) {
  const nomsAchetes = produits.map(p => p.nom).join(" + ");

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
            Merci pour ton achat : <strong>${nomsAchetes}</strong>.
          </p>
          ${ligneCodePromo}
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Clique sur les boutons ci-dessous pour télécharger tes PDF. Les liens sont valables 48 heures.
          </p>
          ${boutons}
          <p style="font-size:13px;color:#777;margin:24px 0 0;">
            Si un lien expire, réponds à cet email et je te l'envoie de nouveau.
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

  const texte = `Ton achat est confirmé : ${nomsAchetes}.\n\nTélécharge tes PDF ici :\n${liens.map(l => l.url).join("\n")}\n\nLiens valables 48 heures.`;

  const payload = {
    sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
    to: [{ email }],
    subject: `Ton achat : ${nomsAchetes}`,
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

  if (evt.type === "customer.subscription.created" || evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
    try {
      await synchroniserAbonnement(evt.data.object);
    } catch (e) {
      console.error("Erreur synchronisation abonnement Supabase:", e.message);
    }
    res.status(200).json({ recu: true });
    return;
  }

  if (evt.type === "checkout.session.expired") {
    try {
      await gererPanierAbandonne(evt.data.object, brevoKey, stripeKey, origin);
    } catch (e) {
      console.error("Erreur relance panier abandonné:", e.message);
    }
    res.status(200).json({ recu: true });
    return;
  }

  if (evt.type !== "checkout.session.completed") {
    res.status(200).json({ recu: true });
    return;
  }

  const session = evt.data.object;

  // L'abonnement Portalis est traité par customer.subscription.created ci-dessus,
  // qui contient déjà toutes les informations nécessaires (customer, statut, période).
  if (session.mode === "subscription") {
    res.status(200).json({ recu: true });
    return;
  }

  const produitIdsRaw = session.metadata && session.metadata.produitIds;
  const email = session.customer_details && session.customer_details.email;

  if (!produitIdsRaw || !email) {
    console.error("produitIds ou email manquant dans la session:", JSON.stringify(session));
    res.status(200).json({ recu: true });
    return;
  }

  const produitIds = produitIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const produitsAchetes = produitIds
    .map(id => ({ id, produit: PRODUITS[id] }))
    .filter(p => p.produit);

  if (!produitsAchetes.length) {
    console.error("Aucun produitId connu dans la session:", produitIdsRaw);
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

  const libelleProduits = produitIds.join("+");
  if (codeAmbassadeur) {
    console.log(`[AMBASSADEUR] code=${codeAmbassadeur} produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  } else {
    console.log(`[VENTE] produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  }

  let liens = [];
  produitsAchetes.forEach(({ id, produit }) => {
    liens = liens.concat(construireLiensEmail(id, produit, downloadSecret, origin));
  });

  if (session.metadata && session.metadata.consentMarketing === "1" && montantEuros !== "?") {
    envoyerAchatMeta({
      email,
      montantEuros,
      produitIds,
      sessionId: session.id,
      fbp: session.metadata.fbp,
      fbc: session.metadata.fbc,
    }).catch(e => console.error("envoyerAchatMeta erreur:", e.message));
  }

  try {
    await envoyerEmail(email, produitsAchetes.map(p => p.produit), liens, brevoKey, codeAmbassadeur);
    console.log(`Email envoyé à ${email} pour ${libelleProduits}${codeAmbassadeur ? " (code " + codeAmbassadeur + ")" : ""}`);
  } catch (e) {
    console.error("Erreur envoi email:", e.message);
  }

  try {
    await inserer("achats", {
      email,
      produit_ids: produitIds,
      session_id: session.id,
      montant: montantEuros !== "?" ? Number(montantEuros) : null,
    });
  } catch (e) {
    console.error("Erreur écriture achat Supabase:", e.message);
  }

  res.status(200).json({ recu: true });
};
