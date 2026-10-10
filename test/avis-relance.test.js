const test = require("node:test");
const assert = require("node:assert/strict");
const { relancerAvis, refuseEmails } = require("../api/avis.js")._test;

const session = (id, extra = {}) => ({
  id, mode: "payment", payment_status: "paid", amount_total: 1499, livemode: true,
  metadata: { produitIds: "fiche-da-l2-s1", internalTest: "0" },
  customer_details: { email: `${id}@exemple.fr` },
  custom_fields: [{ key: "emails", dropdown: { value: "oui" } }],
  ...extra,
});

test("la demande d'avis J+7 écarte les refus, les tests, le stage et les avis déjà donnés", async () => {
  const envoyes = [];
  const sessions = [
    session("cs_live_ok"),
    session("cs_live_refus", { custom_fields: [{ key: "emails", dropdown: { value: "non" } }] }),
    session("cs_live_test", { metadata: { produitIds: "fiche-da-l2-s1", internalTest: "1" } }),
    session("cs_live_stage", { metadata: { produitIds: "stage-methode" } }),
    session("cs_live_deja"),
    session("cs_live_impaye", { payment_status: "unpaid" }),
  ];
  const bilan = await relancerAvis({
    listerSessionsJ7: async () => sessions,
    selectionner: async (_t, q) => (q.includes("cs_live_deja") ? [{ id: 1 }] : []),
    envoyerDemandeAvis: async (email, s) => { envoyes.push([email, s.id]); },
  });
  assert.deepEqual(envoyes, [["cs_live_ok@exemple.fr", "cs_live_ok"]]);
  assert.deepEqual(bilan, { examinees: 6, envoyees: 1, ignorees: 5, erreurs: 0 });
  assert.equal(refuseEmails(sessions[1]), true);
  assert.equal(refuseEmails(sessions[0]), false);
});
