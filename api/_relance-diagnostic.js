const PRODUITS = require("./_produits");

function diagnostiquerRelance(session) {
  const metadata = session.metadata || {};
  const ids = String(metadata.produitIds || "").split(",").map(id => id.trim()).filter(Boolean);
  const email = session.customer_details?.email || session.customer_email || "";
  // Accord donné sur Stripe, ou sur le site juste avant la redirection (case
  // « rappel » non cochée par défaut, ajoutée le 15/10/2026).
  const accord = session.consent?.promotions === "opt_in" ||
    (session.custom_fields || []).some(champ => champ.key === "emails" && champ.dropdown?.value === "oui") ||
    metadata.accordRelance === "1";
  // Essai réel en mode test interne, réservé à l'adresse de Julien.
  const essai = metadata.relanceTest === "1" && metadata.accordRelance === "1"
    && email.toLowerCase() === "julien.prof1@gmail.com";
  const url = session.after_expiration?.recovery?.url;
  const raisons = [];
  if (session.mode === "subscription") raisons.push("abonnement");
  if (session.payment_status === "paid" || session.status === "complete") raisons.push("paiement-termine");
  if (session.status !== "expired") raisons.push("session-non-expiree");
  if (metadata.brand === "trajectoire_philo") raisons.push("autre-marque");
  if (!essai && (metadata.internalTest === "1" || session.livemode === false)) raisons.push("test-interne");
  if (!essai && metadata.source !== "site") raisons.push("source-exclue");
  if (metadata.reminderPlan !== "h1-h24-v1") raisons.push("plan-absent");
  if (!ids.length || ids.some(id => !PRODUITS[id])) raisons.push("produit-inconnu");
  if (ids.some(id => PRODUITS[id]?.venteSuspendue)) raisons.push("vente-suspendue");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) raisons.push("email-absent");
  if (!accord) raisons.push("accord-email-absent");
  if (!url || !/^https:\/\//.test(url)) raisons.push("lien-recuperation-absent");
  return { eligible: raisons.length === 0, raisons, email, url, produits: ids.map(id => PRODUITS[id]).filter(Boolean) };
}

module.exports = { diagnostiquerRelance };
