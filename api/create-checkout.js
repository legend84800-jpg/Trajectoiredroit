// Crée une session Stripe Checkout pour un produit TJD, avec order bump optionnel.
// Reçoit { produitId, bumpId? } en POST. Retourne { url } pour rediriger le client.

const PRODUITS = require("./_produits");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://trajectoiredroit.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erreur: "Méthode non autorisée" }); return; }

  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  corps = corps || {};

  const produitId = typeof corps.produitId === "string" ? corps.produitId.trim() : "";
  const bumpId = typeof corps.bumpId === "string" ? corps.bumpId.trim() : "";
  const fbp = typeof corps.fbp === "string" ? corps.fbp.trim() : "";
  const fbc = typeof corps.fbc === "string" ? corps.fbc.trim() : "";
  const consentMarketing = corps.consentMarketing === true;

  const produit = PRODUITS[produitId];
  if (!produit) {
    res.status(400).json({ erreur: "Produit inconnu" });
    return;
  }

  const bump = bumpId && bumpId !== produitId ? PRODUITS[bumpId] : null;
  const idsAchetes = bump ? [produitId, bumpId] : [produitId];

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ erreur: "Configuration Stripe manquante" }); return; }

  const origin = "https://trajectoiredroit.com";

  const params = new URLSearchParams({
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(produit.prix),
    "line_items[0][price_data][product_data][name]": produit.nom,
    "line_items[0][quantity]": "1",
    mode: "payment",
    allow_promotion_codes: "true",
    success_url: `${origin}/merci-achat.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/formations.html`,
    "metadata[produitIds]": idsAchetes.join(","),
    "payment_intent_data[metadata][produitIds]": idsAchetes.join(","),
    "branding_settings[display_name]": "Trajectoire Droit",
    "branding_settings[icon][type]": "url",
    "branding_settings[icon][url]": `${origin}/assets/logo-tjd-mark.png`,
    "branding_settings[background_color]": "#ffffff",
    "branding_settings[button_color]": "#1A2851",
    "branding_settings[border_style]": "rounded",
    "branding_settings[font_family]": "pt_serif",
  });

  if (consentMarketing) {
    params.set("metadata[consentMarketing]", "1");
    if (fbp) params.set("metadata[fbp]", fbp);
    if (fbc) params.set("metadata[fbc]", fbc);
  }

  if (bump) {
    params.set("line_items[1][price_data][currency]", "eur");
    params.set("line_items[1][price_data][unit_amount]", String(bump.prix));
    params.set("line_items[1][price_data][product_data][name]", bump.nom);
    params.set("line_items[1][quantity]", "1");
  }

  const body = params.toString();

  try {
    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("Stripe erreur:", data);
      res.status(502).json({ erreur: "Erreur Stripe", detail: data.error?.message });
      return;
    }
    res.status(200).json({ url: data.url });
  } catch (e) {
    console.error("create-checkout fetch erreur:", e);
    res.status(500).json({ erreur: "Erreur interne" });
  }
};
