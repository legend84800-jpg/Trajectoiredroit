// Fidélisation du 14/10/2026 : suggestions calées sur les rachats réels et code
// de 15 % donné à chaque acheteur.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { suggererComplements, suggererMajeuresPostAchat, attributsMajeuresPostAchat } = require("../api/_suggestions-post-achat");
const remise = require("../api/_remise-post-achat");
const sessionInfo = require("../api/session-info");

const RACINE = path.join(__dirname, "..");

test("une majeure propose d'abord le recueil de la même matière, puis d'autres majeures", () => {
  const s = suggererComplements(["maj-da-l2-s1"], 4);
  const ids = s.map((x) => x.id);
  assert.equal(s[0].id, "cas-pratique-da-l2-s1");
  assert.equal(s[0].raison, "meme-matiere");
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

test("le J+5 propose deux majeures de l'année du dernier achat", () => {
  const ids = (dernier, historique) => suggererMajeuresPostAchat(dernier, historique).map((p) => p.id);
  assert.deepEqual(ids(["fiche-constit-l1-s1"], []), ["maj-intro-droit-l1", "maj-personnes-l1"]);
  assert.deepEqual(ids(["maj-contrats-l2-s1"], ["pack-majeures-l1"]), ["maj-da-l2-s1", "maj-penal-l2-s1"]);
  assert.deepEqual(ids(["maj-societes-l3-s1"], []), ["maj-commercial-l3-s1", "maj-travail-l3-s1"]);
  assert.deepEqual(ids(["fiche-constit-l1-s1", "maj-societes-l3-s1"], []), []);
  assert.deepEqual(ids(["maj-intro-droit-l1"], ["maj-personnes-l1"]), ["maj-famille-l1-s2"]);
  assert.deepEqual(ids(["fiche-constit-l1-s1"], ["pack-majeures-l1"]), []);
  assert.ok(!ids(["fiche-constit-l1-s1"], ["pack-ultra-l1-s1"]).includes("maj-intro-droit-l1"));
});

test("les recommandations Brevo relisent aussi les commandes des pages suivantes", async () => {
  const requetes = [];
  const attributs = await attributsMajeuresPostAchat("etudiant@example.test", ["fiche-constit-l1-s1"], async (table, query) => {
    assert.equal(table, "achats");
    requetes.push(query);
    if (query.endsWith("offset=0")) return Array.from({ length: 100 }, () => ({ produit_ids: ["fiche-constit-l1-s1"] }));
    return [{ produit_ids: ["pack-majeures-l1"] }];
  });
  assert.equal(requetes.length, 2);
  assert.deepEqual(Object.values(attributs), ["", "", "", ""]);
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

test("un code déjà créé par le webhook est relu au lieu d'être recréé", async () => {
  let crees = 0;
  const existant = { code: remise.codeRemisePourSession("cs_live_deja"), expires_at: Math.floor(Date.now() / 1000) + 3600, active: true };
  const stripe = { promotionCodes: {
    list: async () => ({ data: [existant] }),
    create: async () => { crees += 1; throw new Error("ne doit pas être appelé"); },
  } };
  const r = await remise.creerRemisePostAchat("cs_live_deja", stripe);
  assert.equal(r.code, existant.code);
  assert.equal(crees, 0);
});

test("une clé d'idempotence déjà employée retombe sur le code existant", async () => {
  let lectures = 0;
  const code = remise.codeRemisePourSession("cs_live_course");
  const stripe = { promotionCodes: {
    list: async () => { lectures += 1; return { data: lectures === 1 ? [] : [{ code, expires_at: Math.floor(Date.now() / 1000) + 3600 }] }; },
    create: async () => { const e = new Error("Keys for idempotent requests can only be used with the same parameters"); e.type = "StripeIdempotencyError"; throw e; },
  } };
  const r = await remise.creerRemisePostAchat("cs_live_course", stripe);
  assert.equal(r.code, code);
});
