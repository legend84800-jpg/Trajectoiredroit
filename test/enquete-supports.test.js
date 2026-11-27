const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const handler = require("../api/enquete-supports");
const { SUPPORTS, lireReponse, enregistrerReponse } = handler._test;
const { creerRemiseEnquete, lirePromotionEnquete } = require("../api/_remise-enquete");
const { appliquerCodePromo } = require("../api/create-checkout")._test;

const corps = {
  id: randomUUID(),
  support: "maj-contrats-l2-s1",
  usage: "td",
  aide: "oui",
  priorite: "exemple",
  remarque: "  Ajouter un exemple à la page 24.  ",
};

test("le catalogue du questionnaire réunit les fiches complètes et les majeures en vente", () => {
  assert.ok(SUPPORTS["fiche-contrats-l2-s1"]);
  assert.ok(SUPPORTS["cours-fiche-finances-publiques-l2-s1"]);
  assert.ok(SUPPORTS["maj-obligations-l2-s2"]);
  assert.equal(SUPPORTS["fiche-penal-l2-s1"], undefined);
  assert.equal(SUPPORTS["pack-majeures-l2"], undefined);
});

test("une suite de réponses incomplète ne permet pas d'obtenir un code", () => {
  assert.equal(lireReponse({ ...corps, priorite: "" }), null);
  assert.equal(lireReponse({ ...corps, aide: "" }), null);
  assert.equal(lireReponse({ ...corps, support: "constructor" }), null);
  assert.equal(lireReponse({ ...corps, remarque: "a".repeat(601) }), null);
  assert.equal(lireReponse(corps).remarque, "Ajouter un exemple à la page 24.");
  const premierUsage = lireReponse({ ...corps, usage: "pas_encore", aide: "", utile: "texte" });
  assert.equal(premierUsage.aide, null);
  assert.equal(premierUsage.utile, null);
});

test("une nouvelle tentative reprend la réponse déjà enregistrée et le même code", async () => {
  let reponse;
  const db = {
    async insererSiAbsent(table, entree, conflit) {
      assert.equal(table, "enquete_supports");
      assert.equal(conflit, "id");
      if (reponse) return [];
      reponse = entree;
      return [entree];
    },
    async selectionner() { return [reponse]; },
  };
  const initial = await enregistrerReponse(lireReponse(corps), db);
  const nouvelEssai = await enregistrerReponse(lireReponse(corps), db);
  assert.match(initial.code, /^ENQUETE-[0-9A-F]{18}$/);
  assert.equal(nouvelEssai.code, initial.code);
  assert.equal(await enregistrerReponse(lireReponse({ ...corps, support: "fiche-contrats-l2-s1" }), db), null);
});

test("un questionnaire terminé donne un code de 10 % à usage unique, utilisable sur un panier mixte", async () => {
  const couponId = "tjd-enquete-supports-10";
  let coupon;
  let promotion;
  let issuances = 0;
  const stripe = {
    coupons: {
      async retrieve(id) {
        assert.equal(id, couponId);
        if (!coupon) throw Object.assign(new Error("inexistant"), { code: "resource_missing" });
        return coupon;
      },
      async create(params) {
        assert.equal(params.percent_off, 10);
        assert.equal(params.duration, "once");
        assert.equal(params.applies_to, undefined);
        coupon = { ...params, valid: true };
        return coupon;
      },
    },
    promotionCodes: {
      async list() { return { data: promotion ? [promotion] : [] }; },
      async create(params) {
        assert.equal(params.max_redemptions, 1);
        assert.equal(params.promotion.coupon, couponId);
        issuances += 1;
        promotion = { ...params, id: "promo_enquete", times_redeemed: 0, active: true };
        return promotion;
      },
    },
  };
  const reponse = { id: corps.id, code: "ENQUETE-ABCDEFABCDEFABCDEF" };
  assert.deepEqual(await creerRemiseEnquete(stripe, reponse), { code: reponse.code, dejaUtilise: false });
  assert.deepEqual(await creerRemiseEnquete(stripe, reponse), { code: reponse.code, dejaUtilise: false });
  assert.equal(issuances, 1);

  const params = appliquerCodePromo(
    { line_items: [{ id: "fiche" }, { id: "corrige" }] },
    { promo: await lirePromotionEnquete(stripe, reponse.code), codeDemande: reponse.code }
  );
  assert.deepEqual(params.discounts, [{ promotion_code: "promo_enquete" }]);
  assert.equal(params.line_items.length, 2);
  assert.equal((await lirePromotionEnquete(stripe, reponse.code)).id, "promo_enquete");
  promotion.times_redeemed = 1;
  assert.equal(await lirePromotionEnquete(stripe, reponse.code), null);
  assert.deepEqual(await creerRemiseEnquete(stripe, reponse), { code: reponse.code, dejaUtilise: true });
});
