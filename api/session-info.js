// Renvoie le montant, la devise et les produits d'une session Stripe Checkout
// terminée, pour permettre à merci-achat.html d'envoyer l'évènement Purchase
// au pixel Meta ET à GA4/Matomo avec la vraie valeur de la commande (le
// success_url ne porte que le session_id). Renvoie aussi 2-3 suggestions de
// compléments (vague 2.6), affichées pendant que la confiance est maximale.
// GET /api/session-info?session_id=cs_xxx

const { suggererComplements } = require("./_suggestions-post-achat");
const { creerClientStripe } = require("./_stripe");

function modeDepuisCle(cle) {
  const correspondance = typeof cle === "string" && cle.match(/^[sr]k_(live|test)_/);
  return correspondance ? correspondance[1] : null;
}

function sessionCompatibleAvecCle(sessionId, cle) {
  const correspondance = typeof sessionId === "string" && sessionId.match(/^cs_(live|test)_[A-Za-z0-9]+$/);
  if (!correspondance) return false;
  const modeCle = modeDepuisCle(cle);
  return !modeCle || correspondance[1] === modeCle;
}

async function handler(req, res) {
  const { session_id } = req.query || {};

  if (!session_id || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(session_id)) {
    res.status(400).json({ erreur: "session_id invalide" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ erreur: "Configuration Stripe manquante" }); return; }
  if (!sessionCompatibleAvecCle(session_id, stripeKey)) {
    res.status(404).json({ erreur: "Session introuvable ou non payée" });
    return;
  }

  try {
    const stripe = creerClientStripe(stripeKey);
    const data = await stripe.checkout.sessions.retrieve(session_id);
    if (data.payment_status !== "paid") {
      res.status(404).json({ erreur: "Session introuvable ou non payée" });
      return;
    }
    const produitIds = (data.metadata && data.metadata.produitIds)
      ? data.metadata.produitIds.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    res.status(200).json({
      montant: data.amount_total != null ? data.amount_total / 100 : null,
      devise: (data.currency || "eur").toUpperCase(),
      produitIds,
      suggestions: suggererComplements(produitIds, 3),
    });
  } catch (e) {
    if (e && (e.code === "resource_missing" || e.statusCode === 404)) {
      res.status(404).json({ erreur: "Session introuvable ou non payée" });
      return;
    }
    console.error("session-info Stripe erreur:", e && e.message ? e.message : "erreur inconnue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

module.exports = handler;
module.exports._test = { modeDepuisCle, sessionCompatibleAvecCle };
