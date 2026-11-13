const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assurerCodeParrainage, crediterVenteParrainee, lireParrainage,
  annulerBonParrainage, COUPON_PARRAIN, COUPON_BON,
} = require("../api/_parrainage");

process.env.DOWNLOAD_SECRET = "secret-de-test-parrainage";

function environnement() {
  const tables = { parrains: [], bons_parrainage: [] };
  const promotions = new Map();
  let rembourse = false;
  const lignes = (table, requete) => tables[table].filter(row =>
    [...new URLSearchParams(requete)].every(([cle, filtre]) => {
      if (filtre.startsWith("eq.")) return row[cle] === filtre.slice(3);
      if (filtre === "is.false") return !row[cle];
      if (filtre === "not.is.null") return row[cle] != null;
      return true;
    }));
  const db = {
    selectionner: async (table, requete) => lignes(table, requete),
    insererSiAbsent: async (table, donnees, conflit) => {
      if (tables[table].some(row => row[conflit] === donnees[conflit])) return [];
      const row = { ...donnees };
      tables[table].push(row);
      return [row];
    },
    mettreAJour: async (table, requete, donnees) => lignes(table, requete).map(row => Object.assign(row, donnees)),
  };
  const stripe = {
    paymentIntents: { retrieve: async () => ({ latest_charge: { refunded: rembourse } }) },
    promotionCodes: {
      list: async ({ code }) => ({ data: [...promotions.values()].filter(p => p.code === code) }),
      create: async (donnees) => {
        const id = "promo_" + (promotions.size + 1);
        const p = { ...donnees, id, active: true, times_redeemed: 0 };
        promotions.set(id, p);
        return p;
      },
      retrieve: async id => promotions.get(id),
      update: async (id, valeurs) => Object.assign(promotions.get(id), valeurs),
    },
  };
  return { stripe, db, tables, promotions, rembourser: () => { rembourse = true; } };
}

const session = {
  id: "cs_live_filleul",
  livemode: true, mode: "payment", payment_status: "paid", amount_total: 1274,
  payment_intent: "pi_filleul", customer_details: { email: "filleul@example.org" },
  metadata: { produitIds: "maj-contrats-l2-s1", source: "site", codePromoLien: "PARRAINJULIEN84" },
};

test("le code personnel réutilise la première inscription et le prénom est adapté", async () => {
  const { stripe, db, tables, promotions } = environnement();
  assert.equal(await assurerCodeParrainage(stripe, " JULIEN.PROF1@GMAIL.COM ", "Julien", db), "PARRAINJULIEN84");
  const leila = await assurerCodeParrainage(stripe, "leila@example.org", "Léïla Test", db);
  assert.match(leila, /^PARRAINLEILA\d{2}$/);
  assert.equal(await assurerCodeParrainage(stripe, "leila@example.org", "Autre Nom", db), leila);
  assert.equal(promotions.size, 2);
  assert.ok(tables.parrains.every(row => /^[a-f0-9]{64}$/.test(row.titulaire) && !("email" in row)));
  assert.ok([...promotions.values()].every(p => p.promotion.coupon === COUPON_PARRAIN));
});

test("une vente payée donne un seul bon de 10 €, réservé au parrain dans Mon Compte", async () => {
  const { stripe, db, tables, promotions } = environnement();
  await assurerCodeParrainage(stripe, "julien.prof1@gmail.com", "Julien", db);
  const payee = { ...session, discounts: [{ promotion_code: tables.parrains[0].promotion_id }] };
  const bon = await crediterVenteParrainee(payee, stripe, db);
  await crediterVenteParrainee({ ...payee, id: "cs_live_meme_paiement" }, stripe, db);
  assert.equal(tables.bons_parrainage.length, 1);
  assert.equal(promotions.size, 2);
  assert.equal(promotions.get(bon.promotion_id).promotion.coupon, COUPON_BON);
  assert.equal(promotions.get(bon.promotion_id).max_redemptions, 1);
  assert.deepEqual((await lireParrainage("julien.prof1@gmail.com", stripe, db)).bons, [bon.code_bon]);
  assert.equal(await lireParrainage("filleul@example.org", stripe, db), null);
  await annulerBonParrainage("pi_filleul", stripe, db);
  assert.equal(promotions.get(bon.promotion_id).active, false);
  assert.deepEqual((await lireParrainage("julien.prof1@gmail.com", stripe, db)).bons, []);
});

test("seule une vente payée avec le code réellement appliqué génère un bon", async () => {
  const { stripe, db, tables, promotions, rembourser } = environnement();
  await assurerCodeParrainage(stripe, "julien.prof1@gmail.com", "Julien", db);
  const payee = { ...session, discounts: [{ promotion_code: tables.parrains[0].promotion_id }] };
  assert.equal(await crediterVenteParrainee(session, stripe, db), null);
  assert.equal(await crediterVenteParrainee({ ...payee, metadata: { ...session.metadata, internalTest: "1" } }, stripe, db), null);
  assert.equal(await crediterVenteParrainee({ ...payee, customer_details: { email: "JULIEN.PROF1@GMAIL.COM" } }, stripe, db), null);
  rembourser();
  assert.equal(await crediterVenteParrainee(payee, stripe, db), null);
  assert.equal(promotions.size, 1);
});
