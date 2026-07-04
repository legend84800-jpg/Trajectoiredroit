// Renvoie le montant et la devise d'une session Stripe Checkout terminée,
// pour permettre à merci-achat.html d'envoyer l'évènement Purchase au pixel Meta
// avec la vraie valeur de la commande (le succès_url ne porte que le session_id).
// GET /api/session-info?session_id=cs_xxx

module.exports = async (req, res) => {
  const { session_id } = req.query || {};

  if (!session_id || !session_id.startsWith("cs_")) {
    res.status(400).json({ erreur: "session_id invalide" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ erreur: "Configuration Stripe manquante" }); return; }

  try {
    const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const data = await resp.json();
    if (!resp.ok || data.payment_status !== "paid") {
      res.status(404).json({ erreur: "Session introuvable ou non payée" });
      return;
    }
    res.status(200).json({
      montant: data.amount_total != null ? data.amount_total / 100 : null,
      devise: (data.currency || "eur").toUpperCase(),
    });
  } catch (e) {
    console.error("session-info fetch erreur:", e);
    res.status(500).json({ erreur: "Erreur interne" });
  }
};
