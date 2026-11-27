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

test("tout PDF distribué par un produit actif peut être présélectionné, y compris une annexe", () => {
  const produits = require("../api/_produits");
  const pdf = new Set(Object.values(produits)
    .filter(p => !p.venteSuspendue)
    .flatMap(p => p.blobs ?? [])
    .map(url => /^r2:\/\/tjd\/([a-z0-9-]+)\.pdf$/.exec(url)?.[1])
    .filter(Boolean));
  assert.deepEqual(new Set(Object.keys(SUPPORTS)), pdf);
  assert.match(SUPPORTS["flashcards-qcm-contrats-l2-s1-qcm"], /^QCM /);
  assert.match(SUPPORTS["fiche-arret-administratif-plan-l2s2"], /^Plan détaillé L2 S2/);
  assert.equal(SUPPORTS["fiche-arret-penal-plan-l1s2"], "Plan détaillé · Droit pénal général L2");
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

test("le questionnaire détaillé conserve la clarté et la partie utilisée", () => {
  const reponse = { ...corps, version: 2, partie_utilisee: "regles", clarte: "relecture", hesitation: "format" };
  assert.deepEqual(lireReponse(reponse), {
    ...lireReponse(corps),
    version_questionnaire: 2,
    partie_utilisee: "regles",
    clarte: "relecture",
    frein: null,
    hesitation: "format",
  });
  assert.equal(lireReponse({ ...reponse, clarte: "" }), null);
  assert.equal(lireReponse({ ...reponse, partie_utilisee: "" }), null);
  assert.equal(lireReponse({ ...reponse, hesitation: "inconnue" }), null);
  assert.equal(lireReponse({ ...reponse, version: 3 }), null);
});

test("le parcours avant la première utilisation demande un motif et ignore les réponses de lecture", () => {
  const reponse = {
    id: corps.id, support: corps.support, version: 2, usage: "pas_encore", frein: "acces",
    aide: "oui", utile: "Réponse masquée", partie_utilisee: "plan", clarte: "relecture",
  };
  assert.deepEqual(lireReponse(reponse), {
    id: corps.id,
    support: corps.support,
    usage: "pas_encore",
    aide: null,
    priorite: "pas_assez",
    utile: null,
    remarque: null,
    version_questionnaire: 2,
    partie_utilisee: null,
    clarte: null,
    frein: "acces",
    hesitation: null,
  });
  assert.equal(lireReponse({ ...reponse, frein: "" }), null);
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
