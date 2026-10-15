// Relance de panier abandonné (décision de Julien du 15/10/2026) : adresse et
// accord demandés sur le site avant Stripe, essai réel réservé à Julien.
const test = require("node:test");
const assert = require("node:assert/strict");
const { diagnostiquerRelance } = require("../api/_relance-diagnostic");
const checkout = require("../api/create-checkout")._test;
const webhook = require("../api/stripe-webhook")._test;

const base = { mode: "payment", status: "expired", payment_status: "unpaid", livemode: true, created: 1900000000,
  customer_email: "etudiant@example.com", consent: null, custom_fields: [],
  after_expiration: { recovery: { url: "https://buy.stripe.com/r/fixture" } },
  metadata: { produitIds: "fiche-da-l2-s1", source: "site", reminderPlan: "h1-h24-v1", internalTest: "0" } };

test("l'adresse saisie sur le site est validée et mise en minuscules", () => {
  assert.equal(checkout.lireEmailAchat("  Etudiant@Example.COM "), "etudiant@example.com");
  assert.equal(checkout.lireEmailAchat("pas-une-adresse"), "");
  assert.equal(checkout.lireEmailAchat(42), "");
});

test("l'adresse préremplit Stripe et l'accord n'existe qu'avec une adresse et la case cochée", () => {
  const params = { metadata: { source: "site" }, expires_at: 1 };
  const avec = checkout.reglerRelance(params, { emailAchat: "a@b.fr", accordRelance: true, internalTest: false, contientStage: false });
  assert.equal(avec.customer_email, "a@b.fr");
  assert.equal(avec.metadata.accordRelance, "1");
  assert.equal(avec.expires_at, 1);
  const sansCase = checkout.reglerRelance(params, { emailAchat: "a@b.fr", accordRelance: false, internalTest: false, contientStage: false });
  assert.equal(sansCase.metadata.accordRelance, undefined);
  const sansAdresse = checkout.reglerRelance(params, { emailAchat: "", accordRelance: true, internalTest: false, contientStage: false });
  assert.equal(sansAdresse.metadata.accordRelance, undefined);
  assert.equal(sansAdresse.customer_email, undefined);
  assert.equal(params.metadata.accordRelance, undefined, "les paramètres d'origine restent intacts");
});

test("l'essai réel n'existe qu'en test interne, vers l'adresse de Julien, avec expiration à 31 minutes", () => {
  const params = { metadata: { source: "test_interne", reminderPlan: "none" }, expires_at: 1 };
  const essai = checkout.reglerRelance(params, { emailAchat: checkout.EMAIL_ESSAI_RELANCE, accordRelance: true, internalTest: true, contientStage: false });
  assert.equal(essai.metadata.relanceTest, "1");
  assert.equal(essai.metadata.reminderPlan, "h1-h24-v1");
  const ecart = essai.expires_at - Math.floor(Date.now() / 1000);
  assert.ok(ecart >= 30 * 60 && ecart <= 32 * 60);
  assert.equal(essai.after_expiration.recovery.enabled, true);
  const autre = checkout.reglerRelance(params, { emailAchat: "x@y.fr", accordRelance: true, internalTest: true, contientStage: false });
  assert.equal(autre.metadata.relanceTest, undefined);
  const stage = checkout.reglerRelance(params, { emailAchat: checkout.EMAIL_ESSAI_RELANCE, accordRelance: true, internalTest: true, contientStage: true });
  assert.equal(stage.metadata.relanceTest, undefined);
});

test("l'accord donné sur le site rend la relance possible, son absence la bloque", () => {
  assert.equal(diagnostiquerRelance({ ...base, metadata: { ...base.metadata, accordRelance: "1" } }).eligible, true);
  const sans = diagnostiquerRelance(base);
  assert.equal(sans.eligible, false);
  assert.ok(sans.raisons.includes("accord-email-absent"));
});

test("un test interne reste exclu, sauf l'essai vers l'adresse de Julien", () => {
  const interne = { ...base, metadata: { ...base.metadata, source: "test_interne", internalTest: "1", accordRelance: "1" } };
  assert.ok(diagnostiquerRelance(interne).raisons.includes("test-interne"));
  const essai = { ...interne, customer_email: "julien.prof1@gmail.com", metadata: { ...interne.metadata, relanceTest: "1" } };
  assert.equal(diagnostiquerRelance(essai).eligible, true);
  const essaiAutre = { ...interne, metadata: { ...interne.metadata, relanceTest: "1" } };
  assert.ok(diagnostiquerRelance(essaiAutre).raisons.includes("test-interne"));
});

test("un paiement annule le rappel du lendemain des paniers expirés de la même adresse", async () => {
  const sessions = [
    { id: "cs_a", status: "expired", customer_email: "Etudiant@Example.com", metadata: { rappelH24Status: "scheduled" } },
    { id: "cs_b", status: "expired", customer_details: { email: "autre@example.com" }, metadata: { rappelH24Status: "scheduled" } },
    { id: "cs_c", status: "expired", customer_email: "etudiant@example.com", metadata: {} },
    { id: "cs_paye", status: "complete", customer_email: "etudiant@example.com", metadata: { rappelH24Status: "scheduled" } },
  ];
  const stripe = { checkout: { sessions: { list: async () => ({ data: sessions }) } } };
  const fetchOriginal = global.fetch;
  const suppressions = [];
  global.fetch = async (url, options) => { suppressions.push({ url, methode: options.method }); return { ok: true, status: 204 }; };
  try {
    const n = await webhook.annulerRelancesParEmail("etudiant@example.com", "cs_paye", stripe, "cle");
    assert.equal(n, 1);
    assert.equal(suppressions.length, 1);
    assert.equal(suppressions[0].methode, "DELETE");
    assert.ok(suppressions[0].url.includes(encodeURIComponent(webhook.uuidRelance("cs_a", "h24-batch"))));
  } finally {
    global.fetch = fetchOriginal;
  }
});
