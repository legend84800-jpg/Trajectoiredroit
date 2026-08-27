const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..");

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

function sessionPayee(id = "cs_test_tjd_1") {
  return {
    id,
    mode: "payment",
    payment_status: "paid",
    amount_total: 1499,
    metadata: { produitIds: "fiche-da-l2-s1", source: "site" },
    customer_details: { email: "client@example.com" },
    consent: { promotions: "opt_out" },
    discounts: [],
  };
}

function operationsFactices(surcharges = {}) {
  return {
    insererSiAbsent: async () => [{ id: 1 }],
    supprimer: async () => [],
    envoyerEmail: async () => {},
    envoyerConfirmationStage: async () => {},
    notifierJulienStage: async () => {},
    envoyerAchatMeta: async () => {},
    creerRemisePostAchat: async () => null,
    creerContactBrevoAchat: async () => ({ estNouveau: true }),
    reinscrireAcheteurBrevo: async () => {},
    recupererCodePromo: async () => null,
    annulerRelancePlanifiee: async () => {},
    ...surcharges,
  };
}

test("la création Checkout conserve le garde-fou Stripe et l'idempotence", async () => {
  const stripeModule = require("../api/_stripe");
  const creerOriginal = stripeModule.creerClientStripe;
  const appels = [];
  stripeModule.creerClientStripe = () => ({
    checkout: {
      sessions: {
        create: async (params, options) => {
          appels.push({ params, options });
          return { id: "cs_test_ok", url: "https://checkout.stripe.com/c/pay/test" };
        },
      },
    },
  });

  const cheminModule = require.resolve("../api/create-checkout");
  delete require.cache[cheminModule];
  const handler = require("../api/create-checkout");
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const req = {
    method: "POST",
    body: {
      produitId: "fiche-da-l2-s1",
      attemptId: "12345678-1234-1234-1234-123456789012",
      attemptCreatedAt: Math.floor(Date.now() / 1000),
      landingPage: "reussir-sa-l2.html",
      pageActuelle: "droit-administratif-l2.html#fiches",
      deviceType: "mobile",
      viewport: "390x844",
    },
  };
  const res = reponseFactice();

  try {
    await handler(req, res);
    await handler(req, reponseFactice());
  } finally {
    stripeModule.creerClientStripe = creerOriginal;
    delete require.cache[cheminModule];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.sessionId, "cs_test_ok");
  assert.equal(appels.length, 2);
  assert.deepEqual(appels[0], appels[1]);
  const appel = appels[0];
  assert.deepEqual(appel.params.consent_collection, { promotions: "auto" });
  assert.equal(appel.params.payment_method_types, undefined);
  assert.equal(appel.params.metadata.source, "site");
  assert.equal(appel.params.expires_at, req.body.attemptCreatedAt + 3600);
  assert.equal(appel.params.metadata.landingPage, "reussir-sa-l2.html");
  assert.equal(appel.params.metadata.currentPage, "droit-administratif-l2.html#fiches");
  assert.equal(appel.params.metadata.deviceType, "mobile");
  assert.equal(appel.params.metadata.viewport, "390x844");
  assert.equal(appel.params.metadata.internalTest, "0");
  assert.equal(appel.params.metadata.reminderPlan, "h1-h24-v1");
  assert.deepEqual(appel.params.after_expiration, {
    recovery: { enabled: true, allow_promotion_codes: true },
  });
  assert.match(appel.params.integration_identifier, /_[a-z]{8}$/);
  assert.equal(appel.options.idempotencyKey, "checkout-12345678-1234-1234-1234-123456789012");
});

test("le panier abandonné prépare une seule relance H+1 et une seule relance H+24", async () => {
  const { gererPanierAbandonne } = require("../api/stripe-webhook")._test;
  const misesAJour = [];
  const envois = [];
  const session = {
    id: "cs_test_abandon",
    mode: "payment",
    created: 1_900_000_000,
    metadata: {
      produitIds: "fiche-da-l2-s1",
      reminderPlan: "h1-h24-v1",
      source: "site",
      internalTest: "0",
      currentPage: "droit-administratif-l2.html#fiches",
    },
    customer_details: { email: "eleve@example.com" },
    consent: { promotions: "opt_in" },
    after_expiration: {
      recovery: { url: "https://buy.stripe.com/r/test_recuperation" },
    },
  };
  const resultat = await gererPanierAbandonne(session, "brevo_test", {}, "https://trajectoiredroit.com", {
    recuperer: async () => session,
    mettreAJour: async (_id, params) => { misesAJour.push(params); },
    envoyer: async (_email, _produits, _url, options) => { envois.push(options); },
  });
  assert.equal(resultat.traite, true);
  assert.deepEqual(envois.map(envoi => envoi.etape), ["h1", "h24"]);
  assert.match(envois[1].scheduledAt, /T/);
  assert.equal(misesAJour[0].metadata.rappelH1Status, "sent");
  assert.equal(misesAJour[1].metadata.rappelH24Status, "scheduled");
});

test("une session interne ne déclenche aucune relance", async () => {
  const { gererPanierAbandonne } = require("../api/stripe-webhook")._test;
  let envois = 0;
  const session = {
    id: "cs_test_interne_expire",
    mode: "payment",
    metadata: { produitIds: "fiche-da-l2-s1", reminderPlan: "none", source: "test_interne", internalTest: "1" },
    customer_details: { email: "interne@example.com" },
    consent: { promotions: "opt_in" },
  };
  const resultat = await gererPanierAbandonne(session, "brevo_test", {}, "https://trajectoiredroit.com", {
    recuperer: async () => session,
    envoyer: async () => { envois += 1; },
  });
  assert.equal(resultat.ignore, "non-eligible");
  assert.equal(envois, 0);
});

test("une session interne reste identifiable et ne peut pas déclencher de relance", async () => {
  const stripeModule = require("../api/_stripe");
  const creerOriginal = stripeModule.creerClientStripe;
  let paramsCrees;
  stripeModule.creerClientStripe = () => ({
    checkout: { sessions: { create: async (params) => {
      paramsCrees = params;
      return { id: "cs_test_interne", url: "https://checkout.stripe.com/c/pay/test" };
    } } },
  });
  const cheminModule = require.resolve("../api/create-checkout");
  delete require.cache[cheminModule];
  const handler = require("../api/create-checkout");
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  try {
    await handler({ method: "POST", body: {
      produitId: "fiche-da-l2-s1",
      attemptId: "interne-1234567890123456",
      internalTest: true,
    } }, reponseFactice());
  } finally {
    stripeModule.creerClientStripe = creerOriginal;
    delete require.cache[cheminModule];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
  assert.equal(paramsCrees.metadata.source, "test_interne");
  assert.equal(paramsCrees.metadata.internalTest, "1");
  assert.equal(paramsCrees.metadata.reminderPlan, "none");
  assert.equal(paramsCrees.after_expiration, undefined);
});

test("le flux Stripe garde le consentement, les moyens dynamiques et la récupération native", () => {
  const checkout = fs.readFileSync(path.join(RACINE, "api/create-checkout.js"), "utf8");
  const webhook = fs.readFileSync(path.join(RACINE, "api/stripe-webhook.js"), "utf8");
  assert.match(checkout, /consent_collection:\s*\{\s*promotions:\s*"auto"\s*\}/);
  assert.match(checkout, /after_expiration\s*=\s*\{/);
  assert.doesNotMatch(checkout, /payment_method_types\s*:/);
  assert.doesNotMatch(webhook, /payment_method_types\s*:/);
  assert.doesNotMatch(webhook, /checkout\.sessions\.create/);
});

test("un stage daté ne reçoit pas de lien de récupération de 30 jours", async () => {
  const stripeModule = require("../api/_stripe");
  const supabaseModule = require("../api/_supabase");
  const creerOriginal = stripeModule.creerClientStripe;
  const selectionnerOriginal = supabaseModule.selectionner;
  let paramsCrees;
  stripeModule.creerClientStripe = () => ({
    checkout: { sessions: { create: async (params) => {
      paramsCrees = params;
      return { id: "cs_test_stage", url: "https://checkout.stripe.com/c/pay/stage" };
    } } },
  });
  supabaseModule.selectionner = async () => [];
  const cheminModule = require.resolve("../api/create-checkout");
  delete require.cache[cheminModule];
  const handler = require("../api/create-checkout");
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  try {
    await handler({ method: "POST", body: {
      produitId: "stage-methode",
      attemptId: "stage-1234567890123456",
      email: "eleve@example.com",
      niveau: "L2",
    } }, reponseFactice());
  } finally {
    stripeModule.creerClientStripe = creerOriginal;
    supabaseModule.selectionner = selectionnerOriginal;
    delete require.cache[cheminModule];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
  assert.equal(paramsCrees.metadata.reminderPlan, "none");
  assert.equal(paramsCrees.after_expiration, undefined);
  assert.equal(paramsCrees.allow_promotion_codes, false);
});

test("un paiement récupéré annule le rappel H+24 et reste attribué à la relance", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  let sessionAnnulee = null;
  let achatEnregistre = null;
  const session = sessionPayee("cs_test_recuperee");
  session.recovered_from = "cs_test_abandon_origine";
  const operations = operationsFactices({
    insererSiAbsent: async (_table, donnees) => {
      achatEnregistre = donnees;
      return [{ id: 1 }];
    },
    annulerRelancePlanifiee: async (id) => { sessionAnnulee = id; },
  });
  await traiterAchatPaye(session, {
    operations,
    stripe: {},
    brevoKey: "brevo_test",
    downloadSecret: "secret_test",
    origin: "https://trajectoiredroit.com",
  });
  assert.equal(sessionAnnulee, "cs_test_abandon_origine");
  assert.equal(achatEnregistre.relance, true);
});

test("un webhook rejoué ne renvoie pas le PDF", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  let reserve = false;
  let emails = 0;
  const operations = operationsFactices({
    insererSiAbsent: async () => {
      if (reserve) return [];
      reserve = true;
      return [{ id: 1 }];
    },
    envoyerEmail: async () => { emails += 1; },
  });
  const contexte = {
    operations,
    stripe: {},
    brevoKey: "brevo_test",
    downloadSecret: "secret_test",
    origin: "https://trajectoiredroit.com",
  };

  const premier = await traiterAchatPaye(sessionPayee(), contexte);
  const second = await traiterAchatPaye(sessionPayee(), contexte);

  assert.equal(premier.traite, true);
  assert.equal(second.dejaTraite, true);
  assert.equal(emails, 1);
});

test("un échec de livraison libère le verrou pour le rejeu Stripe", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  let reserve = false;
  let suppressions = 0;
  let tentativesEmail = 0;
  const operations = operationsFactices({
    insererSiAbsent: async () => {
      if (reserve) return [];
      reserve = true;
      return [{ id: 1 }];
    },
    supprimer: async () => {
      reserve = false;
      suppressions += 1;
      return [];
    },
    envoyerEmail: async () => {
      tentativesEmail += 1;
      if (tentativesEmail === 1) throw new Error("Brevo temporairement indisponible");
    },
  });
  const contexte = {
    operations,
    stripe: {},
    brevoKey: "brevo_test",
    downloadSecret: "secret_test",
    origin: "https://trajectoiredroit.com",
  };

  await assert.rejects(traiterAchatPaye(sessionPayee("cs_test_retry"), contexte), /Brevo/);
  const rejeu = await traiterAchatPaye(sessionPayee("cs_test_retry"), contexte);

  assert.equal(suppressions, 1);
  assert.equal(tentativesEmail, 2);
  assert.equal(rejeu.traite, true);
});

test("le webhook attend un paiement asynchrone réussi", () => {
  const source = fs.readFileSync(path.join(RACINE, "api/stripe-webhook.js"), "utf8");
  assert.match(source, /checkout\.session\.async_payment_succeeded/);
  assert.match(source, /checkout\.session\.async_payment_failed/);
  assert.match(source, /session\.payment_status !== "paid"/);
  const webhook = require("../api/stripe-webhook");
  assert.equal(webhook.config.api.bodyParser, false);
});
