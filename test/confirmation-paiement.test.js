const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const fichierApi = join(__dirname, "../api/session-info.js");
const api = readFileSync(fichierApi, "utf8");
const page = readFileSync(join(__dirname, "../merci-achat.html"), "utf8");
const baliseDebut = "<script defer>";
const debut = page.lastIndexOf(baliseDebut) + baliseDebut.length;
const script = page.slice(debut, page.indexOf("</script>", debut));
const sessionId = "cs_test_Confirmation1";
const paiementId = "pi_factice";
const packUltra = "pack-ultra-l2-s1";
const fiche = "fiche-da-l2-s1";
const media = "audio-video-da-l2-s1";

function apiFactice(session, paiement) {
  const lectures = [];
  const intentionsLues = [];
  const requireApi = createRequire(fichierApi);
  const contexte = {
    process: { env: { STRIPE_SECRET_KEY: "sk_test_factice", DOWNLOAD_SECRET: "signature_factice" } },
    console: { error() {} },
    module: { exports: {} },
    require(nom) {
      if (nom === "./_stripe") {
        return { creerClientStripe: () => ({
          checkout: { sessions: {
            async retrieve(...args) {
              lectures.push(args);
              if (session instanceof Error) throw session;
              return session;
            },
          } },
          paymentIntents: {
            async retrieve(id) {
              intentionsLues.push(id);
              if (paiement instanceof Error) throw paiement;
              return paiement;
            },
          },
        }) };
      }
      return requireApi(nom);
    },
  };
  vm.runInNewContext(api, contexte);
  return {
    lectures,
    intentionsLues,
    async appeler(method = "GET", id = sessionId) {
      const sortie = {
        statusCode: 0,
        headers: {},
        setHeader(nom, valeur) { this.headers[nom] = valeur; },
        status(code) { this.statusCode = code; return this; },
        json(donnees) { this.donnees = JSON.parse(JSON.stringify(donnees)); },
      };
      await contexte.module.exports({
        method, query: { session_id: id }, body: { session_id: id, action: "emails" },
      }, sortie);
      return sortie;
    },
  };
}

function donneesStripe(modifications = {}) {
  return {
    id: sessionId, mode: "payment", status: "complete", payment_status: "unpaid",
    amount_total: 19900, livemode: false, currency: "eur",
    metadata: { produitIds: packUltra },
    customer_details: { email: "etudiant@example.test" },
    ...modifications,
  };
}

test("l’API consultée avant paiement ne transmet que l’état et ne met rien en cache", async () => {
  for (const [champs, etat, paiement] of [
    [{ payment_intent: paiementId }, "en_attente", { status: "processing" }],
    [{ payment_intent: { status: "canceled" } }, "annule"],
    [{ status: "expired", payment_intent: paiementId }, "expire", new Error("Accès à l’intention indisponible")],
    [{ payment_intent: { status: "requires_payment_method", last_payment_error: { message: "Information privée" } } }, "echec"],
    [{ status: "open", payment_intent: { status: "requires_payment_method" } }, "a_terminer"],
    [{ payment_intent: { status: "requires_payment_method" } }, "indisponible"],
    [{ payment_intent: null }, "indisponible"],
  ]) {
    const stripe = apiFactice(donneesStripe(champs), paiement);
    const rep = await stripe.appeler();
    assert.equal(rep.statusCode, 200);
    assert.deepEqual(rep.donnees, { etat });
    assert.equal(rep.headers["Cache-Control"], "private, no-store");
    assert.deepEqual(stripe.lectures, [[sessionId]]);
    assert.deepEqual(stripe.intentionsLues, champs.payment_intent === paiementId && etat !== "expire" ? [paiementId] : []);
  }
});

test("l’API distingue une session absente d’un service momentanément indisponible", async () => {
  const absente = new Error("Absente");
  absente.code = "resource_missing";
  assert.equal((await apiFactice(absente).appeler()).statusCode, 404);
  assert.equal((await apiFactice(new Error("Indisponible")).appeler()).statusCode, 500);
  const intentionIndisponible = apiFactice(donneesStripe({ payment_intent: paiementId }), absente);
  assert.deepEqual((await intentionIndisponible.appeler()).donnees, { etat: "indisponible" });
});

test("un paiement en attente ne permet pas l’inscription aux emails", async () => {
  const stripe = apiFactice(donneesStripe({ payment_intent: paiementId }), { status: "processing" });
  const rep = await stripe.appeler("POST");
  assert.equal(rep.statusCode, 404);
  assert.deepEqual(stripe.intentionsLues, []);
});

test("la réponse confirmée donne les liens des PDF mais réserve le Pack Ultra à Mon compte", async () => {
  const stripe = apiFactice(donneesStripe({
    payment_status: "paid", payment_intent: paiementId, metadata: { produitIds: [packUltra, fiche].join(",") },
  }), new Error("Accès à l’intention indisponible"));
  const { donnees } = await stripe.appeler();
  assert.deepEqual(donnees.produitIds, [packUltra, fiche]);
  assert.ok(donnees.liens.length > 0);
  assert.ok(donnees.liens.every(({ url }) => new URL(url).searchParams.get("id") === fiche));
  assert.equal(donnees.customer_details, undefined);
  assert.deepEqual(stripe.lectures, [[sessionId]]);
  assert.deepEqual(stripe.intentionsLues, []);
});

test("le cadeau et l’accès gratuit gardent les conditions de confirmation prévues", async () => {
  const cadeau = donneesStripe({ payment_status: "paid", metadata: {
    produitIds: packUltra, cadeauEmail: "etudiant@example.test",
  } });
  const { donnees } = await apiFactice(cadeau).appeler();
  assert.equal(donnees.cadeau, true);
  assert.deepEqual(donnees.liens, []);
  assert.equal(JSON.stringify(donnees).includes("etudiant@example.test"), false);

  const gratuite = donneesStripe({ payment_status: "no_payment_required", amount_total: 0, metadata: { produitIds: fiche } });
  const stripe = apiFactice({ ...gratuite, payment_intent: paiementId }, new Error("Accès à l’intention indisponible"));
  const confirmee = await stripe.appeler();
  assert.equal(confirmee.donnees.montant, 0);
  assert.ok(confirmee.donnees.liens.length > 0);
  assert.deepEqual(stripe.intentionsLues, []);
  const ouverte = await apiFactice({ ...gratuite, status: "open" }).appeler();
  assert.deepEqual(ouverte.donnees, { etat: "a_terminer" });
});

function navigateur(responses, { id = sessionId, stockageAutorise = true } = {}) {
  const elems = new Map();
  const element = (cle) => {
    if (!elems.has(cle)) elems.set(cle, {
      hidden: true, style: {}, evenements: {}, children: [],
      addEventListener(type, action) { this.evenements[type] = action; },
      appendChild(enfant) { this.children.push(enfant); },
    });
    return elems.get(cle);
  };
  const requetes = [];
  const rappels = [];
  const mesures = [];
  const stockage = new Map([["tjd_panier", "panier"], ["tjd_code_promo", "code"]]);
  const gtag = (...args) => mesures.push(["ga4", args]);
  const fbq = (...args) => mesures.push(["meta", args]);
  const context = {
    URLSearchParams,
    window: {
      location: { search: id ? "?session_id=" + id : "" },
      setTimeout: (rappel) => rappels.push(rappel),
      _paq: { push: (...args) => mesures.push(["matomo", args]) },
      gtag, fbq,
    },
    document: {
      getElementById: element, querySelector: element, createElement: element,
    },
    sessionStorage: {
      getItem() { if (!stockageAutorise) throw new Error("Stockage bloqué"); },
      setItem() { if (!stockageAutorise) throw new Error("Stockage bloqué"); },
    },
    localStorage: {
      setItem: (cle, valeur) => stockage.set(cle, valeur),
      removeItem: (cle) => stockage.delete(cle),
    },
    gtag, fbq,
    setInterval() {},
    clearInterval() {},
    async fetch(url, options) {
      requetes.push({ url, options });
      const [status, data] = responses.shift();
      return { status, ok: status < 400, json: () => data };
    },
  };
  vm.runInNewContext(script, context);
  return { element, requetes, rappels, mesures, stockage };
}

function laisserRepondre() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("Vérifier mon paiement relit la même session et attend la confirmation pour vider le panier", async () => {
  const nav = navigateur([
    [200, { etat: "en_attente" }],
    [200, { etat: "en_attente" }],
    [200, { montant: 19.99, produitIds: [fiche], liens: [], emailsAcceptes: true }],
  ]);
  await laisserRepondre();
  const bouton = nav.element("purchaseStatusRetry");
  assert.equal(nav.element("purchaseStatusTitle").textContent, "Paiement en cours de vérification");
  assert.equal(bouton.hidden, false);
  assert.equal(nav.element("purchaseStatusLink").hidden, true);
  assert.equal(nav.element("purchaseConfirmedContent").hidden, true);
  assert.equal(nav.element("purchaseDownloads").hidden, true);
  assert.equal(nav.element("purchasePackUltra").hidden, true);
  assert.equal(nav.stockage.get("tjd_panier"), "panier");
  assert.equal(nav.stockage.get("tjd_code_promo"), "code");
  assert.equal(nav.mesures.length, 0);

  bouton.evenements.click();
  bouton.evenements.click();
  await laisserRepondre();
  assert.equal(nav.requetes.length, 2);
  assert.equal(nav.mesures.length, 0);

  bouton.evenements.click();
  await laisserRepondre();
  assert.equal(nav.requetes.length, 3);
  for (const { url, options } of nav.requetes) {
    assert.equal(url, "/api/session-info?session_id=" + sessionId);
    assert.equal(options.method, undefined);
    assert.equal(options.cache, "no-store");
  }
  assert.equal(nav.element("purchaseConfirmedContent").hidden, false);
  assert.equal(nav.element("purchaseStatusActions").hidden, true);
  assert.equal(nav.stockage.has("tjd_panier"), false);
  assert.equal(nav.stockage.has("tjd_code_promo"), false);
  assert.equal(nav.mesures.length, 3);
});

test("les états non confirmés donnent une action adaptée et gardent le panier", async () => {
  const variantes = [
    [[200, { etat: "a_terminer" }], "Paiement à terminer", true],
    [[200, { etat: "expire" }], "Session de paiement expirée", false],
    [[200, { etat: "annule" }], "Paiement annulé", false],
    [[200, { etat: "echec" }], "Échec du paiement", false],
    [[404, {}], "Session de paiement introuvable", false],
    [[200, { etat: "indisponible" }], "Vérification indisponible", true],
    [[200, null], "Vérification indisponible", true],
  ];
  for (const [reponse, titre, revoir] of variantes) {
    const nav = navigateur([reponse]);
    await laisserRepondre();
    assert.equal(nav.element("purchaseStatusTitle").textContent, titre);
    assert.equal(nav.element("purchaseStatusRetry").hidden, !revoir);
    assert.equal(nav.element("purchaseStatusLink").hidden, revoir);
    assert.equal(nav.element("purchaseConfirmedContent").hidden, true);
    assert.equal(nav.stockage.get("tjd_panier"), "panier");
    assert.equal(nav.mesures.length, 0);
  }
  const absente = navigateur([], { id: "" });
  assert.equal(absente.requetes.length, 0);
  assert.equal(absente.element("purchaseStatusTitle").textContent, "Session de paiement introuvable");
});

test("une panne temporaire propose de revérifier après une seule relance automatique", async () => {
  const nav = navigateur([[500, {}], [500, {}]]);
  await laisserRepondre();
  assert.equal(nav.rappels.length, 1);
  nav.rappels[0]();
  await laisserRepondre();
  assert.equal(nav.requetes.length, 2);
  assert.equal(nav.element("purchaseStatusTitle").textContent, "Vérification indisponible");
  assert.equal(nav.element("purchaseStatusRetry").disabled, false);
  assert.equal(nav.mesures.length, 0);
});

test("la confirmation affiche les accès du Pack Ultra, des fichiers et des médias selon l’achat", async () => {
  const lien = { url: "https://example.test/fiche.pdf", nom: "la fiche" };
  for (const [donnees, ultraVisible, fichiersVisibles, mediaVisible, titre] of [
    [{ produitIds: [packUltra], liens: [] }, true, false, false, "Le Pack Ultra est dans Mon compte"],
    [{ produitIds: [packUltra, fiche], liens: [lien] }, true, true, false, "Le Pack Ultra est dans Mon compte"],
    [{ produitIds: [packUltra], liens: [], cadeau: true }, false, false, false, "Votre cadeau est parti"],
    [{ produitIds: [media], liens: [] }, false, false, true, "Tes podcasts et tes vidéos sont prêts"],
    [{ produitIds: [media, fiche], liens: [lien] }, false, true, true, "Tes fichiers sont prêts"],
  ]) {
    const nav = navigateur([[200, { montant: 199, emailsAcceptes: true, ...donnees }]]);
    await laisserRepondre();
    assert.equal(nav.element("purchaseStatusTitle").textContent, titre);
    assert.equal(nav.element("purchasePackUltra").hidden, !ultraVisible);
    assert.equal(nav.element("purchaseDownloads").hidden, !fichiersVisibles);
    assert.equal(nav.element("purchaseMedia").hidden, !mediaVisible);
    if (ultraVisible) assert.match(nav.element("purchaseStatusMessage").textContent, /adresse email saisie au moment du paiement/);
  }
  assert.match(page, /href="mon-compte\.html">Accéder à mon Pack Ultra<\/a>/);
});

test("le stockage bloqué laisse le navigateur vérifier une commande gratuite", async () => {
  const nav = navigateur([[200, { montant: 0, produitIds: [fiche], emailsAcceptes: true }]], { stockageAutorise: false });
  await laisserRepondre();
  assert.equal(nav.requetes.length, 1);
  assert.equal(nav.element("purchaseConfirmedContent").hidden, false);
  assert.equal(nav.mesures.length, 0);
});
