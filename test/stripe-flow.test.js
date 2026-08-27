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
  assert.equal(appel.params.expires_at, req.body.attemptCreatedAt + 2 * 3600);
  assert.match(appel.params.integration_identifier, /_[a-z]{8}$/);
  assert.equal(appel.options.idempotencyKey, "checkout-12345678-1234-1234-1234-123456789012");
});

test("les deux flux Stripe gardent le consentement et les moyens dynamiques", () => {
  const checkout = fs.readFileSync(path.join(RACINE, "api/create-checkout.js"), "utf8");
  const webhook = fs.readFileSync(path.join(RACINE, "api/stripe-webhook.js"), "utf8");
  assert.match(checkout, /consent_collection:\s*\{\s*promotions:\s*"auto"\s*\}/);
  assert.match(webhook, /consent_collection:\s*\{\s*promotions:\s*"auto"\s*\}/);
  assert.doesNotMatch(checkout, /payment_method_types\s*:/);
  assert.doesNotMatch(webhook, /payment_method_types\s*:/);
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
