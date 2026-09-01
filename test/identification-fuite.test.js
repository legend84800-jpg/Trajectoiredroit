const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  identifier,
  codesCommande,
  chargeSignature,
  signatureValide,
} = require("../api/identifier-fuite")._test;

const PRODUIT = "maj-penal-l2-s1";
const DOWNLOAD_SECRET = "secret-telechargement-test";
const ADMIN_SECRET = "secret-administration-test";
const SESSION_ID = "cs_test_identification_fuite";

function achat() {
  return {
    email: "julien.test@example.com",
    produit_ids: [PRODUIT],
    session_id: SESSION_ID,
    montant: 14.99,
    cree_le: "2026-08-31T12:00:00Z",
  };
}

function session(statut = "paid") {
  return {
    id: SESSION_ID,
    mode: "payment",
    payment_status: statut,
    metadata: { produitIds: PRODUIT },
    customer_details: {
      email: "julien.test@example.com",
      name: "Nom carte",
    },
    custom_fields: [{
      key: "nomlicence",
      text: { value: "Julien Dupont" },
    }],
  };
}

function contexte(statut = "paid") {
  return {
    selectionner: async () => [achat()],
    downloadSecret: DOWNLOAD_SECRET,
    stripe: {
      checkout: {
        sessions: {
          retrieve: async () => session(statut),
        },
      },
    },
  };
}

test("la signature d'administration expire et couvre tous les marqueurs", () => {
  const maintenant = 2_000_000_000_000;
  const horodatage = String(Math.floor(maintenant / 1000));
  const nonce = "a".repeat(32);
  const codes = codesCommande(SESSION_ID, DOWNLOAD_SECRET);
  const fingerprints = [codes.fingerprint];
  const licences = [codes.licence];
  const signature = crypto
    .createHmac("sha256", ADMIN_SECRET)
    .update(chargeSignature(horodatage, nonce, fingerprints, licences))
    .digest("hex");
  const req = {
    headers: {
      "x-tjd-timestamp": horodatage,
      "x-tjd-nonce": nonce,
      "x-tjd-signature": signature,
    },
  };

  assert.equal(
    signatureValide(req, fingerprints, licences, ADMIN_SECRET, maintenant),
    true
  );
  assert.equal(
    signatureValide(req, fingerprints, licences, ADMIN_SECRET, maintenant + 301_000),
    false
  );
  assert.equal(
    signatureValide(req, ["0000000000"], licences, ADMIN_SECRET, maintenant),
    false
  );
});

test("un fingerprint retrouve une commande payée et son titulaire", async () => {
  const codes = codesCommande(SESSION_ID, DOWNLOAD_SECRET);
  const resultat = await identifier(
    { fingerprints: [codes.fingerprint], licences: [] },
    contexte()
  );

  assert.equal(resultat.statut, 200);
  assert.equal(resultat.corps.licence, codes.licence);
  assert.equal(resultat.corps.fingerprint, codes.fingerprint);
  assert.equal(resultat.corps.commande.session_stripe, SESSION_ID);
  assert.equal(resultat.corps.commande.paiement, "paid");
  assert.equal(resultat.corps.titulaire.nom, "Julien Dupont");
  assert.equal(resultat.corps.titulaire.email, "julien.test@example.com");
});

test("un motif inconnu ne retourne aucune identité", async () => {
  const resultat = await identifier(
    { fingerprints: ["0000000000"], licences: [] },
    contexte()
  );
  assert.equal(resultat.statut, 404);
  assert.deepEqual(resultat.corps, { erreur: "Aucune commande correspondante" });
});

test("une session non payée bloque toute attribution", async () => {
  const codes = codesCommande(SESSION_ID, DOWNLOAD_SECRET);
  await assert.rejects(
    () => identifier(
      { fingerprints: [codes.fingerprint], licences: [] },
      contexte("unpaid")
    ),
    /ne confirme pas l'achat/
  );
});
