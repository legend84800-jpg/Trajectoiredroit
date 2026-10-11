const test = require("node:test");
const assert = require("node:assert/strict");
const { diagnostiquerRelance } = require("../api/_relance-diagnostic");
const { gererPanierAbandonne } = require("../api/stripe-webhook")._test;
const session = { id: "cs_test_diagnostic", mode: "payment", status: "expired", payment_status: "unpaid", livemode: true,
  created: 1900000000, metadata: { produitIds: "fiche-da-l2-s1", source: "site", reminderPlan: "h1-h24-v1", internalTest: "0" },
  customer_email: "fixture@example.com", consent: { promotions: "opt_in" },
  after_expiration: { recovery: { url: "https://buy.stripe.com/r/fixture" } } };

test("un email prérempli reste utilisable, sans assimiler les cookies marketing à un accord email", () => {
  assert.equal(diagnostiquerRelance(session).eligible, true);
  const diagnostic = diagnostiquerRelance({ ...session, consent: null, metadata: { ...session.metadata, consentMarketing: "1" } });
  assert.equal(diagnostic.eligible, false);
  assert.ok(diagnostic.raisons.includes("accord-email-absent"));
});

test("la session payée et la session Philo sont refusées", () => {
  assert.ok(diagnostiquerRelance({ ...session, status: "complete", payment_status: "paid" }).raisons.includes("paiement-termine"));
  assert.ok(diagnostiquerRelance({ ...session, metadata: { ...session.metadata, brand: "trajectoire_philo" } }).raisons.includes("autre-marque"));
});

test("le motif d'exclusion est durable et ne contient aucune adresse", async () => {
  const updates = [];
  const expired = { ...session, consent: null, customer_email: "" };
  const result = await gererPanierAbandonne(expired, "fixture", {}, "https://trajectoiredroit.com", {
    recuperer: async () => expired, mettreAJour: async (_id, params) => { updates.push(params); },
    envoyer: async () => { throw new Error("unexpected-mail"); },
  });
  assert.equal(result.ignore, "non-eligible");
  assert.match(updates[0].metadata.rappelDiagnostic, /email-absent/);
  assert.match(updates[0].metadata.rappelDiagnostic, /accord-email-absent/);
  assert.doesNotMatch(JSON.stringify(updates), /@/);
});

test("une panne Brevo laisse une trace et remonte pour permettre la reprise Stripe", async () => {
  const updates = [];
  await assert.rejects(gererPanierAbandonne(session, "fixture", {}, "https://trajectoiredroit.com", {
    recuperer: async () => session, mettreAJour: async (_id, params) => { updates.push(params); },
    envoyer: async () => { throw new Error("BrevoUnavailable"); },
  }), /BrevoUnavailable/);
  assert.equal(updates[0].metadata.rappelH1Error, "send-or-record-failed");
});

test("une reprise ne renvoie aucun email déjà accepté ou programmé", async () => {
  let sends = 0;
  const existing = { ...session, metadata: { ...session.metadata, rappelH1Status: "sent", rappelH24Status: "scheduled" } };
  await gererPanierAbandonne(existing, "fixture", {}, "https://trajectoiredroit.com", {
    recuperer: async () => existing, mettreAJour: async () => {}, envoyer: async () => { sends++; },
  });
  assert.equal(sends, 0);
});
