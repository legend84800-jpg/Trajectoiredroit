// Paiement en plusieurs fois sans frais des Packs Ultra (ajouté le 25/09/2026).
// Klarna ne s'affiche pas en euros sur un compte Stripe américain, et Alma comme
// le 4 fois PayPal exigent un vendeur européen. Les échéances passent donc par
// un abonnement mensuel créé par Checkout, que le webhook borne ensuite avec un
// subscription schedule (end_behavior "cancel") : aucun prélèvement après le dernier.

const NOMBRES_ECHEANCES = [2, 3];

// Chaque échéance est arrondie au centime inférieur : le client ne paie jamais
// plus que le prix affiché (au pire 2 centimes de moins), ce qui garde le
// « sans frais » exact.
function montantEcheance(prixCentimes, nombre) {
  return Math.floor(prixCentimes / nombre);
}

function nombreEcheancesValide(produitId, produit, valeur) {
  const nombre = Number(valeur);
  if (!NOMBRES_ECHEANCES.includes(nombre)) return null;
  if (typeof produitId !== "string" || !produitId.startsWith("pack-ultra-")) return null;
  if (!produit || produit.venteSuspendue || !Number.isInteger(produit.prix)) return null;
  return nombre;
}

function euros(centimes) {
  return (centimes / 100).toFixed(2).replace(".", ",") + " €";
}

// Transforme les paramètres Checkout d'un achat unique en abonnement à durée
// fixe. Les champs propres au paiement unique (relance de panier, métadonnées
// de PaymentIntent, codes promo) sont retirés : un code promo ne réduirait que
// la première échéance.
function versCheckoutEcheances(params, produit, nombre) {
  const montant = montantEcheance(produit.prix, nombre);
  const total = montant * nombre;
  const produitIds = params.metadata.produitIds;
  const suite = { ...params };
  delete suite.payment_intent_data;
  delete suite.after_expiration;
  suite.mode = "subscription";
  suite.allow_promotion_codes = false;
  suite.line_items = [{
    price_data: {
      currency: "eur",
      unit_amount: montant,
      recurring: { interval: "month" },
      product_data: { name: `${produit.nom}, paiement en ${nombre} fois` },
    },
    quantity: 1,
  }];
  suite.metadata = {
    ...params.metadata,
    reminderPlan: "none",
    echeances: String(nombre),
    montantEcheance: String(montant),
    montantTotal: String(total),
  };
  suite.subscription_data = {
    description: `${produit.nom}, ${nombre} prélèvements mensuels de ${euros(montant)}`,
    metadata: { produitIds, echeances: String(nombre) },
  };
  const suiteEcheances = nombre === 2
    ? ` et ${euros(montant)} dans un mois`
    : `, puis ${euros(montant)} chacun des deux mois suivants`;
  const dernier = nombre === 2 ? "deuxième" : "troisième";
  suite.custom_text = {
    submit: {
      message: `Tu paies ${euros(montant)} aujourd'hui${suiteEcheances}, soit ${euros(total)} au total. `
        + `Les prélèvements s'arrêtent automatiquement après le ${dernier}, et tu reçois tout le pack par email dès aujourd'hui.`,
    },
  };
  return suite;
}

// Borne l'abonnement créé par Checkout à N mensualités. Idempotent : si un
// schedule existe déjà (webhook rejoué), il n'est pas recréé.
async function bornerAbonnement(stripe, subscriptionId, nombre) {
  const abonnement = await stripe.subscriptions.retrieve(subscriptionId);
  if (abonnement.schedule) return { dejaBorne: true };
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
  const phase = schedule.phases[0];
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "cancel",
    proration_behavior: "none",
    phases: [{
      items: phase.items.map((item) => ({
        price: typeof item.price === "string" ? item.price : item.price.id,
        quantity: item.quantity,
      })),
      start_date: phase.start_date,
      duration: { interval: "month", interval_count: nombre },
      metadata: { echeances: String(nombre) },
    }],
  });
  return { borne: true };
}

module.exports = {
  NOMBRES_ECHEANCES,
  montantEcheance,
  nombreEcheancesValide,
  versCheckoutEcheances,
  bornerAbonnement,
};
