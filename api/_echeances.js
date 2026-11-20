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
  if (typeof produitId !== "string") return null;
  if (!produit || produit.venteSuspendue || !Number.isInteger(produit.prix)) return null;
  const modes = produitId.startsWith("pack-ultra-") ? NOMBRES_ECHEANCES : produit.echeancesAutorisees;
  return modes?.includes(nombre) ? nombre : null;
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
  const enDeuxFois = nombre === 2;
  const libellePaiement = enDeuxFois ? "2 paiements sur 2 mois" : `paiement en ${nombre} fois`;
  const descriptionPaiement = enDeuxFois
    ? `${libellePaiement}. Le prix total est de ${euros(total)}.`
    : "";
  const produitIds = params.metadata.produitIds;
  const accesPackUltra = produitIds.startsWith("pack-ultra-")
    ? "Le Pack Ultra est disponible dans Mon compte dès le premier paiement."
    : null;
  const descriptionLivraison = accesPackUltra ?? (Array.isArray(produit.blobs) && produit.blobs.length > 0
    ? `Tu reçois les ${produit.blobs.length} fichiers par email dès le premier paiement, et tu les gardes à vie avec leurs mises à jour.`
    : "");
  const description = [descriptionPaiement, descriptionLivraison].filter(Boolean).join(" ");
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
      product_data: {
        name: `${produit.nom}, ${libellePaiement}`,
        ...(description ? { description } : {}),
      },
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
  suite.custom_text = {
    submit: {
      message: enDeuxFois
        ? `2 paiements sur **2 mois**. Tu paies ${euros(montant)} aujourd’hui puis ${euros(montant)} dans un mois, soit ${euros(total)} au total. `
          + "Les paiements s’arrêtent donc automatiquement après le deuxième. "
          + (accesPackUltra ?? "Tu reçois tout le pack par email dès le premier paiement.")
        : `Tu paies ${euros(montant)} aujourd'hui, puis ${euros(montant)} chacun des deux mois suivants, soit ${euros(total)} au total. `
          + "Les prélèvements s'arrêtent automatiquement après le troisième"
          + (accesPackUltra ? `. ${accesPackUltra}` : ", et tu reçois tout le pack par email dès aujourd'hui."),
    },
  };
  return suite;
}

// Borne l'abonnement créé par Checkout à N mensualités. Idempotent : si un
// schedule existe déjà (webhook rejoué), il n'est pas recréé.
async function bornerAbonnement(stripe, subscriptionId, nombre) {
  const abonnement = await stripe.subscriptions.retrieve(subscriptionId);
  const schedule = abonnement.schedule
    ? await stripe.subscriptionSchedules.retrieve(abonnement.schedule)
    : await stripe.subscriptionSchedules.create(
      { from_subscription: subscriptionId },
      { idempotencyKey: `echeances-${subscriptionId}` }
    );
  const phase = schedule.phases[0];
  if (schedule.end_behavior === "cancel" && schedule.phases.length === 1
    && phase?.metadata?.echeances === String(nombre)) return { dejaBorne: true };
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
  euros,
  nombreEcheancesValide,
  versCheckoutEcheances,
  bornerAbonnement,
};
