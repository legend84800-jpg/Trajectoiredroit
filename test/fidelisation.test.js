// Fidélisation du 14/10/2026 : suggestions calées sur les rachats réels et code
// de 15 % donné à chaque acheteur.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { suggererComplements } = require("../api/_suggestions-post-achat");
const remise = require("../api/_remise-post-achat");
const sessionInfo = require("../api/session-info");

const RACINE = path.join(__dirname, "..");

test("une majeure propose la même matière, la même année dans une autre matière et le semestre suivant", () => {
  const s = suggererComplements(["maj-da-l2-s1"], 4);
  const ids = s.map((x) => x.id);
  assert.ok(ids.includes("fiche-da-l2-s1"));
  assert.ok(s.some((x) => x.raison === "autre-matiere" && x.id.startsWith("maj-") && x.id.endsWith("-l2-s1")));
  assert.ok(ids.includes("maj-da-l2-s2"));
  assert.ok(!ids.includes("maj-da-l2-s1"));
});

test("un pack qui contient un document déjà acheté n'est jamais proposé", () => {
  const ids = suggererComplements(["fiche-da-l2-s1"], 6).map((x) => x.id);
  assert.ok(!ids.includes("pack-matiere-da-l2"));
  // La majeure n'est pas dans le pack matière : le pack reste proposable.
  assert.ok(suggererComplements(["maj-da-l2-s1"], 4).some((x) => x.id === "pack-matiere-da-l2"));
});

test("un pack annuel acheté fait proposer ce qu'il ne contient pas, dans la bonne année", () => {
  const s = suggererComplements(["pack-l2"], 4);
  assert.ok(s.length > 0);
  for (const x of s) {
    assert.ok(!x.id.startsWith("fiche-") || !/-l2-/.test(x.id) || x.id.includes("finances") || x.id.includes("philo"));
    assert.ok(!/-l1\b|-l1-/.test(x.id), `suggestion L1 inattendue : ${x.id}`);
  }
});

test("le stage, un produit inconnu et une liste vide ne donnent aucune suggestion", () => {
  assert.deepEqual(suggererComplements(["stage-methode"], 4), []);
  assert.deepEqual(suggererComplements(["produit-inexistant"], 4), []);
  assert.deepEqual(suggererComplements([], 4), []);
});

test("le code de remise est le même pour une session donnée, quel que soit qui le crée", () => {
  assert.equal(remise.codeRemisePourSession("cs_live_abc"), remise.codeRemisePourSession("cs_live_abc"));
  assert.match(remise.codeRemisePourSession("cs_live_abc"), /^POSTA-[A-F0-9]{8}$/);
});

test("le code de 15 % concerne chaque achat payant, hors stage, cadeau et test interne", () => {
  const { remiseApplicable } = sessionInfo._test;
  const base = { livemode: true, amount_total: 1499, metadata: { produitIds: "fiche-da-l2-s1" } };
  assert.equal(remiseApplicable(base, ["fiche-da-l2-s1"]), true);
  assert.equal(remiseApplicable({ ...base, livemode: false }, ["fiche-da-l2-s1"]), false);
  assert.equal(remiseApplicable({ ...base, metadata: { internalTest: "1" } }, ["fiche-da-l2-s1"]), false);
  assert.equal(remiseApplicable({ ...base, metadata: { cadeauEmail: "x@example.invalid" } }, ["pack-ultra-l2-s1"]), false);
  assert.equal(remiseApplicable(base, ["stage-methode"]), false);
  assert.equal(remiseApplicable({ ...base, amount_total: 0 }, ["fiche-da-l2-s1"]), false);
});

test("lireRemiseParCode refuse un code qui n'est pas un code post-achat", async () => {
  let appele = false;
  const stripe = { promotionCodes: { list: async () => { appele = true; return { data: [] }; } } };
  assert.equal(await remise.lireRemiseParCode("DROIT670", stripe), null);
  assert.equal(appele, false);
});

test("lireRemiseParCode écarte un code expiré ou déjà utilisé", async () => {
  const code = "POSTA-ABCDEF12";
  const futur = Math.floor(Date.now() / 1000) + 3600;
  const avec = (promo) => ({ promotionCodes: { list: async () => ({ data: [promo] }) } });
  assert.equal(await remise.lireRemiseParCode(code, avec({ code, active: true, expires_at: Math.floor(Date.now() / 1000) - 10 })), null);
  assert.equal(await remise.lireRemiseParCode(code, avec({ code, active: true, expires_at: futur, max_redemptions: 1, times_redeemed: 1 })), null);
  const ok = await remise.lireRemiseParCode(code, avec({ code, active: true, expires_at: futur, max_redemptions: 1, times_redeemed: 0 }));
  assert.equal(ok.code, code);
  assert.equal(ok.pourcentage, 15);
});

test("le webhook crée le code pour tout acheteur payant, sans exiger l'accord pour les emails", () => {
  const webhook = fs.readFileSync(path.join(RACINE, "api", "stripe-webhook.js"), "utf8");
  assert.match(webhook, /if \(!estStage && !estTestInterne && Number\(montantEuros\) > 0\)/);
  assert.match(webhook, /PRODUITS_ACHETES/);
});

test("les pages de remerciement, de compléments et Mon compte mémorisent le code et chargent achat.js", () => {
  for (const page of ["merci-achat.html", "complements.html", "mon-compte.html"]) {
    const html = fs.readFileSync(path.join(RACINE, page), "utf8");
    assert.match(html, /achat\.js/, page);
  }
  const merci = fs.readFileSync(path.join(RACINE, "merci-achat.html"), "utf8");
  assert.match(merci, /memoriserRemise\(d && d\.remise\)/);
  assert.match(merci, /action: 'emails'/);
  const compte = fs.readFileSync(path.join(RACINE, "assets", "js", "compte.js"), "utf8");
  assert.match(compte, /tjd_code_promo/);
});
