const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { relancerAvis, refuseEmails, fenetreAchatsTemoignage, envoyerDemandeTemoignage } = require("../api/avis.js")._test;

const session = (id, extra = {}) => ({
  id, mode: "payment", payment_status: "paid", amount_total: 1499, livemode: true,
  metadata: { produitIds: "fiche-da-l2-s1", internalTest: "0" },
  customer_details: { email: `${id}@exemple.fr` },
  custom_fields: [{ key: "emails", dropdown: { value: "oui" } }],
  ...extra,
});

test("le témoignage ignore les refus, les tests, le stage, les avis déjà donnés et les doubles achats du jour", async () => {
  const envoyes = [];
  const sessions = [
    session("cs_live_ok"),
    session("cs_live_memejour", { customer_details: { email: "CS_LIVE_OK@exemple.fr" } }),
    session("cs_live_optout", { consent: { promotions: "opt_out" } }),
    session("cs_live_refus", { custom_fields: [{ key: "emails", dropdown: { value: "non" } }] }),
    session("cs_live_test", { metadata: { produitIds: "fiche-da-l2-s1", internalTest: "1" } }),
    session("cs_live_stage", { metadata: { produitIds: "stage-methode" } }),
    session("cs_live_deja"),
    session("cs_live_impaye", { payment_status: "unpaid" }),
  ];
  const bilan = await relancerAvis({
    listerSessionsTemoignage: async () => sessions,
    selectionner: async (_t, q) => (q.includes("cs_live_deja") ? [{ id: 1 }] : []),
    envoyerDemandeTemoignage: async (email, s) => { envoyes.push([email, s.id]); },
  });
  assert.deepEqual(envoyes, [["cs_live_ok@exemple.fr", "cs_live_ok"]]);
  assert.deepEqual(bilan, { examinees: 8, envoyees: 1, ignorees: 7, erreurs: 0 });
  assert.equal(refuseEmails(sessions[3]), true);
  assert.equal(refuseEmails(sessions[2]), true);
  assert.equal(refuseEmails(sessions[0]), false);
});

test("la fenêtre J+30 écarte les commandes de l'ancienne campagne et reste stable au cours du passage", () => {
  const ts = (date) => Date.parse(date) / 1000;
  const fenetre = (date) => fenetreAchatsTemoignage(Date.parse(date));
  assert.equal(fenetre("2026-12-14T16:00:00Z"), null);
  const premierJour = { gte: ts("2026-11-14T17:00:00Z"), lt: ts("2026-11-15T16:00:00Z") };
  assert.deepEqual(fenetre("2026-12-15T16:00:00Z"), premierJour);
  assert.deepEqual(fenetre("2026-12-15T16:09:00Z"), premierJour);
  assert.deepEqual(fenetre("2026-12-16T16:01:00Z"), { gte: premierJour.lt, lt: ts("2026-11-16T16:00:00Z") });
});

test("le modèle 31 reçoit le prénom, le produit et le PDF de la campagne", async () => {
  const commande = session("cs_live_exemple", {
    customer_details: { email: "camille@example.com", individual_name: "ÉLODIE-MARIE MARTIN", name: "NOM FACTURATION" },
  });
  const traces = [];
  const envoyer = (_url, options) => {
    traces.push(JSON.parse(options.body));
    return Promise.resolve({ ok: true });
  };
  await envoyerDemandeTemoignage("camille@example.com", commande, "cle-test", envoyer);
  await envoyerDemandeTemoignage("camille@example.com", commande, "cle-test", envoyer);
  const [message, nouvelleTentative] = traces;
  assert.equal(message.templateId, 31);
  assert.deepEqual(message.tags, ["temoignage-video-j30"]);
  assert.deepEqual(message.params, { PRENOM: "Élodie-Marie", PRODUIT: "Fiche complète Droit administratif L2 S1" });
  assert.equal(message.sender.name, "Julien");
  assert.equal(message.replyTo.name, "Julien");
  assert.equal(message.attachment[0].name, "questions-temoignage.pdf");
  assert.deepEqual(Buffer.from(message.attachment[0].content, "base64"),
    readFileSync(join(__dirname, "../api/_ressources/questions-temoignage.pdf")));
  assert.match(message.headers.idempotencyKey, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.equal(message.headers.idempotencyKey, nouvelleTentative.headers.idempotencyKey);
});
