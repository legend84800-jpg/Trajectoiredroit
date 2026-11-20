const test = require("node:test");
const assert = require("node:assert/strict");
const PRODUITS = require("../api/_produits");
const {
  montantEcheance,
  nombreEcheancesValide,
  bornerAbonnement,
} = require("../api/_echeances");

function reponseFactice() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(nom, valeur) { this.headers[nom] = valeur; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function creerCheckout(body) {
  const stripeModule = require("../api/_stripe");
  const creerOriginal = stripeModule.creerClientStripe;
  const appels = [];
  stripeModule.creerClientStripe = () => ({
    checkout: {
      sessions: {
        create: async (params, options) => {
          appels.push({ params, options });
          return { id: "cs_test_echeances", url: "https://checkout.stripe.com/c/pay/test" };
        },
      },
    },
  });
  const cheminModule = require.resolve("../api/create-checkout");
  delete require.cache[cheminModule];
  const handler = require("../api/create-checkout");
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const res = reponseFactice();
  try {
    await handler({
      method: "POST",
      body: {
        attemptId: "12345678-1234-1234-1234-123456789012",
        attemptCreatedAt: Math.floor(Date.now() / 1000),
        ...body,
      },
    }, res);
  } finally {
    stripeModule.creerClientStripe = creerOriginal;
    delete require.cache[cheminModule];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
  return { res, appels };
}

test("une échéance ne dépasse jamais le prix affiché", () => {
  for (const [id, produit] of Object.entries(PRODUITS)) {
    if (!id.startsWith("pack-ultra-") || produit.venteSuspendue) continue;
    for (const nombre of [2, 3]) {
      const montant = montantEcheance(produit.prix, nombre);
      assert.ok(montant * nombre <= produit.prix, id);
      assert.ok(produit.prix - montant * nombre < nombre, id);
    }
  }
});

test("seuls les Packs Ultra en vente acceptent 2 ou 3 échéances", () => {
  assert.equal(nombreEcheancesValide("pack-ultra-l1-s1-revision", PRODUITS["pack-ultra-l1-s1-revision"], 3), 3);
  assert.equal(nombreEcheancesValide("pack-ultra-l1-s1-revision", PRODUITS["pack-ultra-l1-s1-revision"], "2"), 2);
  assert.equal(nombreEcheancesValide("pack-ultra-l1-s1-revision", PRODUITS["pack-ultra-l1-s1-revision"], 4), null);
  assert.equal(nombreEcheancesValide("fiche-da-l2-s1", PRODUITS["fiche-da-l2-s1"], 3), null);
  assert.equal(nombreEcheancesValide("pack-ultra-l3-s2-revision", { prix: 19900, venteSuspendue: true }, 3), null);
});

test("le paiement en 3 fois ouvre un abonnement mensuel sans relance ni code promo", async () => {
  const { res, appels } = await creerCheckout({ produitId: "pack-ultra-l1-s1-revision", echeances: 3 });
  assert.equal(res.statusCode, 200);
  const { params, options } = appels[0];
  assert.equal(params.mode, "subscription");
  assert.equal(params.line_items.length, 1);
  assert.equal(params.line_items[0].price_data.currency, "eur");
  assert.equal(params.line_items[0].price_data.unit_amount, 6633);
  assert.deepEqual(params.line_items[0].price_data.recurring, { interval: "month" });
  assert.equal(params.payment_intent_data, undefined);
  assert.equal(params.after_expiration, undefined);
  assert.equal(params.allow_promotion_codes, false);
  assert.equal(params.metadata.echeances, "3");
  assert.equal(params.metadata.montantTotal, "19899");
  assert.equal(params.metadata.reminderPlan, "none");
  assert.equal(params.metadata.produitIds, "pack-ultra-l1-s1-revision");
  assert.equal(params.subscription_data.metadata.echeances, "3");
  assert.equal(params.line_items[0].price_data.product_data.description, "Le Pack Ultra est disponible dans Mon compte dès le premier paiement.");
  assert.equal(params.custom_text.submit.message,
    "Tu paies 66,33 € aujourd'hui, puis 66,33 € chacun des deux mois suivants, soit 198,99 € au total. "
    + "Les prélèvements s'arrêtent automatiquement après le troisième. Le Pack Ultra est disponible dans Mon compte dès le premier paiement.");
  assert.equal(options.idempotencyKey, "checkout-12345678-1234-1234-1234-123456789012-x3");
});

test("un Pack Ultra payé comptant garde les libellés et les paramètres du paiement unique", async () => {
  const produitId = "pack-ultra-l1-s1-revision";
  const { res, appels } = await creerCheckout({ produitId });
  assert.equal(res.statusCode, 200);
  assert.equal(appels.length, 1);
  const { params, options } = appels[0];
  assert.equal(params.mode, "payment");
  assert.equal(params.metadata.echeances, undefined);
  assert.equal(params.subscription_data, undefined);
  assert.deepEqual(params.payment_intent_data, { metadata: { produitIds: produitId } });
  assert.deepEqual(params.line_items[0], {
    price_data: {
      currency: "eur",
      unit_amount: 19900,
      product_data: {
        name: PRODUITS[produitId].nom,
        description: "Tu retrouves toutes les ressources du pack dans ton espace Mon compte dès que le paiement est validé, et tu y gardes l'accès à vie.",
        images: ["https://trajectoiredroit.com/assets/covers/pack-ultra-l1-s1.webp"],
      },
    },
    quantity: 1,
  });
  assert.equal(params.custom_text.submit.message, "Vérifie ton adresse email, car c'est avec elle que tu te connectes ensuite à ton espace Mon compte.");
  assert.equal(options.idempotencyKey, "checkout-12345678-1234-1234-1234-123456789012");
});

test("une demande d'échéances sur une fiche reste un paiement unique", async () => {
  const { appels } = await creerCheckout({ produitId: "fiche-da-l2-s1", echeances: 3 });
  assert.equal(appels[0].params.mode, "payment");
  assert.equal(appels[0].params.metadata.echeances, undefined);
});

test("le webhook plafonne l'abonnement avant de livrer le pack", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  const ordre = [];
  const session = {
    id: "cs_test_echeances",
    mode: "subscription",
    subscription: "sub_test_1",
    payment_status: "paid",
    amount_total: 7966,
    metadata: { produitIds: "pack-ultra-l1-s1", echeances: "3", source: "site" },
    customer_details: { email: "client@example.com" },
    consent: { promotions: "opt_out" },
    discounts: [],
  };
  const operations = {
    bornerAbonnement: async (_stripe, subscriptionId, nombre) => { ordre.push(`borne:${subscriptionId}:${nombre}`); },
    insererSiAbsent: async () => { ordre.push("reserve"); return [{ id: 1 }]; },
    supprimer: async () => [],
    envoyerEmail: async () => { ordre.push("email"); },
    envoyerConfirmationStage: async () => {},
    notifierJulienStage: async () => {},
    envoyerAchatMeta: async () => {},
    creerRemisePostAchat: async () => null,
    creerContactBrevoAchat: async () => ({ estNouveau: true }),
    reinscrireAcheteurBrevo: async () => {},
    recupererCodePromo: async () => null,
    annulerRelancePlanifiee: async () => {},
  };
  const resultat = await traiterAchatPaye(session, {
    operations, stripe: {}, brevoKey: "b", downloadSecret: "s", origin: "https://trajectoiredroit.com",
  });
  assert.equal(resultat.traite, true);
  assert.deepEqual(ordre, ["borne:sub_test_1:3", "reserve", "email"]);

  const portalis = await traiterAchatPaye({ ...session, metadata: { produitIds: "x" } }, { operations });
  assert.deepEqual(portalis, { ignore: "abonnement" });
});

test("le plafond crée un schedule qui s'arrête après N mois, une seule fois", async () => {
  const appels = [];
  let schedule = null;
  const stripe = {
    subscriptions: { retrieve: async () => ({ id: "sub_1", schedule }) },
    subscriptionSchedules: {
      create: async (params) => {
        appels.push(["create", params]);
        return { id: "sub_sched_1", phases: [{ start_date: 1790000000, items: [{ price: { id: "price_1" }, quantity: 1 }] }] };
      },
      retrieve: async () => ({ id: schedule, ...appels[1][2] }),
      update: async (id, params) => { appels.push(["update", id, params]); schedule = id; return {}; },
    },
  };
  assert.deepEqual(await bornerAbonnement(stripe, "sub_1", 3), { borne: true });
  assert.deepEqual(await bornerAbonnement(stripe, "sub_1", 3), { dejaBorne: true });
  assert.equal(appels.length, 2);
  assert.deepEqual(appels[0], ["create", { from_subscription: "sub_1" }]);
  const [, id, params] = appels[1];
  assert.equal(id, "sub_sched_1");
  assert.equal(params.end_behavior, "cancel");
  assert.deepEqual(params.phases[0].items, [{ price: "price_1", quantity: 1 }]);
  assert.equal(params.phases[0].start_date, 1790000000);
  assert.deepEqual(params.phases[0].duration, { interval: "month", interval_count: 3 });
});
