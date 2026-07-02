// Crée une session Stripe Checkout pour un produit TJD.
// Reçoit { produitId } en POST. Retourne { url } pour rediriger le client.

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
  const produit = PRODUITS[produitId];
  if (!produit) {
    res.status(400).json({ erreur: "Produit inconnu" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ erreur: "Configuration Stripe manquante" }); return; }

  const origin = "https://trajectoiredroit.com";

  const body = new URLSearchParams({
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(produit.prix),
    "line_items[0][price_data][product_data][name]": produit.nom,
    "line_items[0][quantity]": "1",
    mode: "payment",
    allow_promotion_codes: "true",
    success_url: `${origin}/merci-achat.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/formations.html`,
    "metadata[produitId]": produitId,
    "payment_intent_data[metadata][produitId]": produitId,
  }).toString();

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
