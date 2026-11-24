const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const { genererToken } = require("../api/_liens-telechargement");
const { codeRemisePourSession } = require("../api/_remise-post-achat");

const fichierApi = join(__dirname, "../api/session-info.js");
const api = readFileSync(fichierApi, "utf8");
const page = readFileSync(join(__dirname, "../merci-achat.html"), "utf8");
const baliseDebut = "<script defer>";
const debut = page.lastIndexOf(baliseDebut) + baliseDebut.length;
const script = page.slice(debut, page.indexOf("</script>", debut));
const sessionId = "cs_test_Confirmation1";
const sessionLive = "cs_live_Confirmation1";
const secretSignature = "signature_factice";
const paiementId = "pi_factice";
const packUltra = "pack-ultra-l2-s1";
const fiche = "fiche-da-l2-s1";
const ficheS2 = "fiche-da-l2-s2";
const packMatiere = "pack-matiere-da-l2";
const media = "audio-video-da-l2-s1";

function apiFactice(session, paiement, { cleStripe = "sk_test_factice", promotionCodes } = {}) {
  const lectures = [];
  const intentionsLues = [];
  const requireApi = createRequire(fichierApi);
  const contexte = {
    process: { env: { STRIPE_SECRET_KEY: cleStripe, DOWNLOAD_SECRET: secretSignature } },
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
          promotionCodes,
        }) };
      }
      return requireApi(nom);
    },
  };
  vm.runInNewContext(api, contexte);
  return {
    lectures,
    intentionsLues,
    async appeler(method = "GET", id = sessionId, vue) {
      const sortie = {
        statusCode: 0,
        headers: {},
        setHeader(nom, valeur) { this.headers[nom] = valeur; },
        status(code) { this.statusCode = code; return this; },
        json(donnees) { this.donnees = JSON.parse(JSON.stringify(donnees)); },
      };
      await contexte.module.exports({
        method, query: { session_id: id, vue }, body: { session_id: id, action: "emails" },
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

test("la confirmation associe les liens signés aux deux produits avec leur nom du catalogue", async () => {
  const stripe = apiFactice(donneesStripe({
    payment_status: "paid", amount_total: 3998, metadata: { produitIds: [fiche, ficheS2, media, packUltra].join(",") },
  }));
  const moderne = await stripe.appeler("GET", sessionId, "confirmation");
  const historique = await stripe.appeler();
  assert.equal(moderne.statusCode, 200);
  assert.deepEqual(moderne.donnees.nomsProduits, {
    [fiche]: "Fiche complète Droit administratif L2 S1",
    [ficheS2]: "Fiche complète Droit administratif L2 S2",
  });
  assert.equal(historique.donnees.nomsProduits, undefined);
  assert.equal(historique.donnees.liens.length, 6);
  assert.ok(historique.donnees.liens.every(lien => !Object.hasOwn(lien, "produitId")));
  assert.equal(moderne.donnees.liens.length, 6);
  assert.equal(new Set(moderne.donnees.liens.map(lien => lien.url)).size, 6);
  for (const [index, lien] of moderne.donnees.liens.entries()) {
    const params = new URL(lien.url).searchParams;
    const id = index < 3 ? fiche : ficheS2;
    const fichier = index % 3;
    const expiration = Number(params.get("exp"));
    assert.equal(lien.produitId, id);
    assert.equal(params.get("id"), id);
    assert.equal(params.get("b"), String(fichier));
    assert.equal(params.get("sid"), sessionId);
    assert.ok(Math.abs(expiration - Math.floor(Date.now() / 1000) - 7200) <= 1);
    assert.equal(params.get("sig"), genererToken(id, fichier, expiration, secretSignature, sessionId));
  }
});

test("un pack de plusieurs fichiers reste un seul produit et conserve ses liens", async () => {
  const stripe = apiFactice(donneesStripe({
    payment_status: "paid", metadata: { produitIds: [packMatiere, media].join(",") },
  }));
  const { donnees } = await stripe.appeler("GET", sessionId, "confirmation");
  assert.ok(donnees.liens.length > 3);
  assert.ok(donnees.liens.every(({ url, produitId }) =>
    !produitId && new URL(url).searchParams.get("id") === packMatiere));
  assert.equal(donnees.nomsProduits, undefined);
});

test("la confirmation indique le format Anki uniquement pour les fichiers qu’elle remet", async () => {
  const flashcards = "flashcards-qcm-da-l2-s1";
  const autre = "flashcards-qcm-da-l2-s2";
  const stripe = apiFactice(donneesStripe({
    payment_status: "paid",
    metadata: { produitIds: [flashcards, autre, packUltra, fiche].join(",") },
  }));
  const confirmation = await stripe.appeler("GET", sessionId, "confirmation");
  assert.equal(confirmation.statusCode, 200);
  const liens = confirmation.donnees.liens;
  const liensAnki = liens.filter((lien) => lien.format === "apkg");
  assert.deepEqual(liensAnki.map((lien) => lien.produitId), [flashcards, autre]);
  assert.equal(liens.length, 9);
  assert.ok(liens.every((lien) => lien.produitId !== packUltra));
  for (const lien of liens) {
    const adresse = new URL(lien.url);
    const { searchParams: params } = adresse;
    assert.equal(adresse.pathname, "/api/telecharger");
    assert.equal(params.get("sid"), sessionId);
    assert.equal(params.get("id"), lien.produitId);
    assert.equal(params.get("sig"), genererToken(lien.produitId, Number(params.get("b")), Number(params.get("exp")), secretSignature, sessionId));
  }
  const ancien = await stripe.appeler();
  assert.equal(ancien.donnees.liens.length, liens.length);
  assert.ok(ancien.donnees.liens.every((lien) => !Object.hasOwn(lien, "format")));

  const cadeau = await apiFactice(donneesStripe({
    payment_status: "paid", metadata: { produitIds: flashcards, cadeauEmail: "etudiant@example.test" },
  })).appeler("GET", sessionId, "confirmation");
  assert.deepEqual(cadeau.donnees.liens, []);
});

test("le cadeau et l’accès gratuit gardent les conditions de confirmation prévues", async () => {
  const cadeau = donneesStripe({ payment_status: "paid", metadata: {
    produitIds: [packUltra, fiche, ficheS2].join(","), cadeauEmail: "etudiant@example.test",
  } });
  const { donnees } = await apiFactice(cadeau).appeler("GET", sessionId, "confirmation");
  assert.equal(donnees.cadeau, true);
  assert.deepEqual(donnees.liens, []);
  assert.equal(donnees.nomsProduits, undefined);
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

test("les liens signés et le montant total arrivent avant une remise Stripe lente", async () => {
  const code = codeRemisePourSession(sessionLive);
  const expireLe = Math.floor(Date.now() / 1000) + 86400;
  const remiseExistante = { data: [{ code, expires_at: expireLe }] };
  const appelsRemise = [];
  const creationsRemise = [];
  let debloquerRemise;
  const attenteRemise = new Promise((resolve) => { debloquerRemise = resolve; });
  const stripe = apiFactice(donneesStripe({
    id: sessionLive, livemode: true, payment_status: "paid", amount_total: 2300,
    metadata: { produitIds: fiche, montantTotal: "6900" },
  }), undefined, {
    cleStripe: "sk_live_factice",
    promotionCodes: {
      list(params) {
        appelsRemise.push(params);
        return appelsRemise.length === 1 ? attenteRemise : remiseExistante;
      },
      create(params) { creationsRemise.push(params); },
    },
  });
  let remiseTerminee = false;
  const demandeRemise = stripe.appeler("GET", sessionLive, "remise").then((reponse) => {
    remiseTerminee = true;
    return reponse;
  });
  await laisserRepondre();
  assert.equal(appelsRemise.length, 1);
  const { donnees, statusCode, headers } = await stripe.appeler("GET", sessionLive, "confirmation");
  assert.equal(remiseTerminee, false);
  assert.deepEqual(appelsRemise.map(({ code, limit }) => [code, limit]), [[code, 1]]);
  assert.equal(statusCode, 200);
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(donnees.montant, 69);
  assert.equal(donnees.devise, "EUR");
  assert.deepEqual(donnees.produitIds, [fiche]);
  assert.equal(donnees.remise, null);
  assert.equal(donnees.remisePossible, true);
  assert.equal(donnees.emailsAcceptes, false);
  assert.equal(donnees.liens.length, 3);
  for (const [index, lien] of donnees.liens.entries()) {
    const url = new URL(lien.url);
    const params = url.searchParams;
    const expiration = Number(params.get("exp"));
    assert.equal(url.pathname, "/api/telecharger");
    assert.equal(params.get("id"), fiche);
    assert.equal(params.get("b"), String(index));
    assert.equal(params.get("sid"), sessionLive);
    assert.ok(Math.abs(expiration - Math.floor(Date.now() / 1000) - 7200) <= 1);
    assert.equal(params.get("sig"), genererToken(fiche, index, expiration, secretSignature, sessionLive));
  }

  debloquerRemise(remiseExistante);
  const remise = await demandeRemise;
  assert.equal(remise.statusCode, 200);
  assert.equal(remise.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(Object.keys(remise.donnees), ["remise"]);
  assert.equal(remise.donnees.remise.code, code);
  assert.equal(remise.donnees.remise.pourcentage, 15);
  assert.equal(remise.donnees.remise.expireLe, expireLe);
  assert.deepEqual(stripe.lectures, [[sessionLive], [sessionLive]]);

  const historique = await stripe.appeler("GET", sessionLive);
  assert.equal(historique.donnees.remisePossible, undefined);
  assert.deepEqual(historique.donnees.remise, remise.donnees.remise);
  assert.equal(historique.donnees.liens.length, donnees.liens.length);
  assert.deepEqual(creationsRemise, []);
});

test("confirmation et remise exigent la même session Stripe confirmée et compatible avec le mode", async () => {
  for (const vue of ["confirmation", "remise"]) {
    const absente = new Error("Absente");
    absente.code = "resource_missing";
    const appelsRemise = [];
    const options = { cleStripe: "sk_live_factice", promotionCodes: {
      list(params) { appelsRemise.push(params); return { data: [] }; },
    } };
    for (const [session, statut, corps] of [
      [absente, 404, { erreur: "Session introuvable" }],
      [donneesStripe({ id: sessionLive, livemode: true }), 200, { etat: "indisponible" }],
      [donneesStripe({ id: sessionLive, livemode: true, status: "expired" }), 200, { etat: "expire" }],
      [donneesStripe({ id: sessionLive, livemode: true, status: "expired", payment_status: "paid" }), 200, { etat: "expire" }],
    ]) {
      const stripe = apiFactice(session, undefined, options);
      const reponse = await stripe.appeler("GET", sessionLive, vue);
      assert.equal(reponse.statusCode, statut);
      assert.deepEqual(reponse.donnees, corps);
      assert.equal(reponse.headers["Cache-Control"], "private, no-store");
    }
    const stripe = apiFactice(donneesStripe({ payment_status: "paid" }), undefined, options);
    const reponse = await stripe.appeler("GET", sessionId, vue);
    assert.equal(reponse.statusCode, 404);
    assert.deepEqual(reponse.donnees, { erreur: "Session introuvable" });
    assert.deepEqual(stripe.lectures, []);
    assert.deepEqual(appelsRemise, []);
  }
});

const panierInitial = [{ id: fiche, nom: "Droit administratif S1", prixCentimes: 1999 }];

function navigateur(responses, { id = sessionId, stockageAutorise = true, panier = JSON.stringify(panierInitial) } = {}) {
  const elems = new Map();
  const creerElement = (tag) => ({
    tag, hidden: true, style: {}, evenements: {}, children: [], attributs: {},
    addEventListener(type, action) { this.evenements[type] = action; },
    appendChild(enfant) { this.children.push(enfant); },
    setAttribute(nom, valeur) { this.attributs[nom] = valeur; },
    classList: { toggle() {} },
  });
  const element = (cle) => {
    if (!elems.has(cle)) elems.set(cle, creerElement(cle));
    return elems.get(cle);
  };
  const requetes = [];
  const rappels = [];
  const mesures = [];
  const stockage = new Map([["tjd_panier", panier], ["tjd_code_promo", "code"]]);
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
      getElementById: element, querySelector: element, createElement: creerElement,
    },
    sessionStorage: {
      getItem() { if (!stockageAutorise) throw new Error("Stockage bloqué"); },
      setItem() { if (!stockageAutorise) throw new Error("Stockage bloqué"); },
    },
    localStorage: {
      getItem(cle) { return stockage.get(cle) ?? null; },
      setItem: (cle, valeur) => stockage.set(cle, valeur),
      removeItem: (cle) => stockage.delete(cle),
    },
    gtag, fbq,
    setInterval() {},
    clearInterval() {},
    async fetch(url, options) {
      requetes.push({ url, options });
      const [status, data] = await responses.shift();
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
  assert.equal(nav.stockage.get("tjd_panier"), JSON.stringify(panierInitial));
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
    assert.equal(url, "/api/session-info?session_id=" + sessionId + "&vue=confirmation");
    assert.equal(options.method, undefined);
    assert.equal(options.cache, "no-store");
  }
  assert.equal(nav.element("purchaseConfirmedContent").hidden, false);
  assert.equal(nav.element("purchaseStatusActions").hidden, true);
  assert.equal(nav.stockage.has("tjd_panier"), false);
  assert.equal(nav.stockage.has("tjd_code_promo"), false);
  assert.equal(nav.mesures.length, 3);
});

test("un achat direct retire du panier les produits de la commande et conserve les autres", async () => {
  const encoreDansLePanier = { id: ficheS2, nom: "Droit administratif S2", prixCentimes: 1999 };
  const panier = [panierInitial[0], encoreDansLePanier];
  for (const produitsConfirmes of [[fiche], [packMatiere], [], undefined]) {
    const commande = { montant: 19.99, produitIds: produitsConfirmes, liens: [], emailsAcceptes: true };
    const nav = navigateur([[200, commande]], { panier: JSON.stringify(panier) });
    await laisserRepondre();
    assert.equal(nav.element("purchaseConfirmedContent").hidden, false);
    const attendu = produitsConfirmes?.includes(fiche) ? [encoreDansLePanier] : panier;
    assert.deepEqual(JSON.parse(nav.stockage.get("tjd_panier")), attendu);
  }
});

test("une confirmation supporte un panier ancien illisible", async () => {
  const nav = navigateur([[200, { montant: 19.99, produitIds: [fiche], liens: [], emailsAcceptes: true }]],
    { panier: "panier-illisible" });
  await laisserRepondre();
  assert.equal(nav.element("purchaseConfirmedContent").hidden, false);
  assert.equal(nav.stockage.get("tjd_panier"), "panier-illisible");
});

test("les téléchargements prêts précèdent le rappel concernant les indésirables", () => {
  assert.match(page, /id="purchaseConfirmedContent" hidden>\s*<div class="card" id="purchaseDownloads" hidden\b/);
  assert.ok(page.indexOf('id="purchaseDownloads"') < page.indexOf('id="purchaseSpamReminder"'));
});

test("la confirmation réduit les rappels par email quand les fichiers suffisent", async () => {
  const lien = { type: "pdf", url: "https://example.test/fiche.pdf", nom: "la fiche" };
  for (const [produitIds, liens, cadeau, confirmationSimple, etapesVisibles] of [
    [[fiche], [lien], false, true, false],
    [[fiche], [], false, false, true],
    [[media, fiche], [lien], false, false, true],
    [[packUltra, fiche], [lien], false, false, true],
    [[packUltra], [], false, false, false],
    [[packUltra], [], true, false, false],
    [["stage-methode", fiche], [lien], false, false, true],
  ]) {
    const nav = navigateur([[200, { montant: 19.99, produitIds, liens, cadeau, emailsAcceptes: true }]]);
    await laisserRepondre();
    for (const id of ["purchaseStatusMessage", "purchaseSpamReminder", "purchaseEmailSupport", "purchaseSurveyEmail"]) {
      assert.equal(nav.element(id).hidden, confirmationSimple, id + " · " + produitIds.join(","));
    }
    assert.equal(nav.element("purchaseSteps").hidden, !etapesVisibles);
    assert.equal(nav.element("purchaseGiftSteps").hidden, !cadeau);
  }
  assert.match(page, /Les liens de cette page restent valables 2 heures\. Tes fichiers restent accessibles à tout moment dans <a href="mon-compte\.html">Mon compte<\/a>/);
});

test("les PDF et le consentement s’affichent avant le code de remise, y compris si la remise échoue", async () => {
  for (const remiseOk of [true, false]) {
    let repondreRemise;
    const attenteRemise = new Promise((resolve) => { repondreRemise = resolve; });
    const lien = { nom: "la fiche complète", type: "pdf", url: "/api/telecharger?lien=factice" };
    const nav = navigateur([[200, { montant: 19.99, produitIds: [fiche], liens: [lien], remisePossible: true }], attenteRemise]);
    await laisserRepondre();
    assert.deepEqual(nav.requetes.map(({ url, options }) => [url, options.cache]), [
      ["/api/session-info?session_id=" + sessionId + "&vue=confirmation", "no-store"],
      ["/api/session-info?session_id=" + sessionId + "&vue=remise", "no-store"],
    ]);
    assert.equal(nav.element("purchaseDownloads").hidden, false);
    assert.equal(nav.element("purchaseDownloadsList").children[0].href, lien.url);
    assert.equal(nav.element("emailsCard").hidden, false);
    assert.equal(nav.element("remiseCard").hidden, true);
    assert.equal(nav.stockage.has("tjd_code_promo"), false);
    repondreRemise(remiseOk ? [200, { remise: { code: "POSTA-0123ABCD", pourcentage: 15 } }] : [500, {}]);
    await laisserRepondre();
    assert.equal(nav.element("purchaseDownloads").hidden, false);
    assert.equal(nav.element("purchaseDownloadsList").children.length, 1);
    assert.equal(nav.element("emailsCard").hidden, false);
    assert.equal(nav.element("remiseCard").hidden, !remiseOk);
    assert.equal(nav.stockage.has("tjd_code_promo"), remiseOk);
    assert.equal(nav.mesures.length, 3);
  }
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
    const introuvable = reponse[0] === 404;
    assert.equal(nav.element("purchaseStatusLink").href, introuvable ? "mon-compte.html" : "formations.html");
    assert.equal(nav.element("purchaseStatusLink").textContent, introuvable ? "Retrouver mes documents" : "Revenir aux formations");
    assert.equal(nav.element("purchaseConfirmedContent").hidden, true);
    assert.equal(nav.stockage.get("tjd_panier"), JSON.stringify(panierInitial));
    assert.equal(nav.mesures.length, 0);
  }
  const absente = navigateur([], { id: "" });
  assert.equal(absente.requetes.length, 0);
  assert.equal(absente.element("purchaseStatusTitle").textContent, "Session de paiement introuvable");
});

test("une page de confirmation sans référence propose Mon compte sans interroger le paiement", () => {
  const nav = navigateur([], { id: "" });
  assert.equal(nav.element("purchaseStatusTitle").textContent, "Session de paiement introuvable");
  assert.equal(nav.element("purchaseStatusLink").hidden, false);
  assert.equal(nav.element("purchaseStatusLink").href, "mon-compte.html");
  assert.equal(nav.element("purchaseStatusLink").textContent, "Retrouver mes documents");
  assert.equal(nav.requetes.length, 0);
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

test("la page affiche un seul guide Anki si elle offre un téléchargement Anki effectif", async () => {
  const lienPdf = { nom: "Fiche PDF", url: "https://example.test/fichier-1", type: "pdf" };
  const lienAnki = { nom: "Cartes", url: "https://example.test/fichier-2", type: "pdf", format: "apkg" };
  const deuxiemeAnki = { ...lienAnki, url: "https://example.test/fichier-3" };
  const reponse = { montant: 9.99, produitIds: ["flashcards-qcm-da-l2-s1"], emailsAcceptes: true };
  assert.equal((page.match(/id="purchaseAnkiHelp" hidden/g) || []).length, 1);
  assert.match(page, /<a href="flashcards-qcm\.html#importer-anki">Importer les cartes dans Anki<\/a>/);

  for (const [details, avecAide, avecPdfSeul] of [
    [{ liens: [lienPdf] }, false, true],
    [{ liens: [{ ...lienPdf, nom: "Fichier Anki", url: "https://example.test/fichier.apkg" }] }, false, true],
    [{ liens: [lienPdf, { ...lienAnki, url: null }] }, false, true],
    [{ liens: [lienPdf, lienAnki] }, true, false],
    [{ liens: [lienAnki, deuxiemeAnki] }, true, false],
    [{ produitIds: [packUltra], liens: [] }, false, false],
    [{ liens: [] }, false, false],
    [{ cadeau: true, liens: [lienAnki] }, false, false],
    [{ etat: "en_attente", liens: [lienAnki] }, false, false],
  ]) {
    const nav = navigateur([[200, { ...reponse, ...details }]]);
    await laisserRepondre();
    const telechargements = nav.element("purchaseDownloads");
    const aide = nav.element("purchaseAnkiHelp");
    if (avecAide || avecPdfSeul) {
      assert.equal(telechargements.hidden, false);
      assert.equal(aide.hidden, !avecAide);
      assert.equal(nav.element("purchaseDownloadsPdfIntro").hidden, !avecPdfSeul);
      const boutons = nav.element("purchaseDownloadsList").children;
      assert.deepEqual(boutons.map((bouton) => bouton.href), details.liens.filter((lien) => lien.url).map((lien) => lien.url));
    } else {
      assert.equal(telechargements.hidden, true);
      assert.equal(aide.hidden, true);
    }
  }

  const nav = navigateur([
    [500, {}], [500, {}], [200, { ...reponse, liens: [lienAnki] }],
  ]);
  await laisserRepondre();
  nav.rappels[0]();
  await laisserRepondre();
  assert.equal(nav.element("purchaseAnkiHelp").hidden, true);
  nav.element("purchaseStatusRetry").evenements.click();
  await laisserRepondre();
  assert.equal(nav.element("purchaseAnkiHelp").hidden, false);
});

test("la page sépare les deux semestres et conserve les boutons simples avec une ancienne réponse", async () => {
  const stripe = apiFactice(donneesStripe({
    payment_status: "paid", amount_total: 3998, metadata: { produitIds: [fiche, ficheS2].join(",") },
  }));
  const { donnees } = await stripe.appeler("GET", sessionId, "confirmation");
  const nav = navigateur([[200, donnees]]);
  await laisserRepondre();
  const groupes = nav.element("purchaseDownloadsList").children;
  assert.equal(nav.element("purchaseDownloads").hidden, false);
  assert.equal(groupes.length, 2);
  for (const [index, id] of [fiche, ficheS2].entries()) {
    const bloc = groupes[index];
    const [titre, ...boutons] = bloc.children;
    assert.equal(bloc.tag, "section");
    assert.equal(titre.tag, "h3");
    assert.equal(titre.textContent, "Droit administratif L2 S" + (index + 1));
    assert.equal(bloc.attributs["aria-labelledby"], titre.id);
    assert.equal(boutons.length, 3);
    assert.ok(boutons.every(bouton => bouton.className === "btn btn--outline" && bouton.rel === "nofollow noreferrer"));
    assert.deepEqual(boutons.map(bouton => bouton.href), donnees.liens.filter(lien => lien.produitId === id).map(lien => lien.url));
  }

  const { donnees: anciennes } = await stripe.appeler();
  for (const reponse of [anciennes, { ...donnees, nomsProduits: { [fiche]: donnees.nomsProduits[fiche] } }]) {
    const ancienNavigateur = navigateur([[200, reponse]]);
    await laisserRepondre();
    const boutons = ancienNavigateur.element("purchaseDownloadsList").children;
    assert.ok(boutons.every(bouton => bouton.tag === "a" && bouton.className === "btn btn--primary"));
    assert.deepEqual(boutons.map(bouton => bouton.href), reponse.liens.map(lien => lien.url));
  }
});

test("les fiches d’un pack annuel sont rangées par matière avec leurs liens d’origine", async () => {
  for (const [produitId, nbMatieres, nbFichiers] of [
    ["pack-l2-revision", 8, 22],
    ["pack-l2", 9, 25],
    ["pack-l1-revision", 8, 24],
    ["pack-l3", 6, 17],
    ["pack-complet-revision", 22, 63],
  ]) {
    const { donnees } = await apiFactice(donneesStripe({
      payment_status: "paid", amount_total: 7900, metadata: { produitIds: produitId },
    })).appeler("GET", sessionId, "confirmation");
    assert.equal(donnees.liens.length, nbFichiers);
    assert.equal(donnees.nomsProduits, undefined);
    const nav = navigateur([[200, donnees]]);
    await laisserRepondre();
    const groupes = nav.element("purchaseDownloadsList").children;
    assert.equal(groupes.length, nbMatieres);
    const boutons = groupes.flatMap((bloc) => {
      const [titre, rangee] = bloc.children;
      assert.equal(bloc.attributs["aria-labelledby"], titre.id);
      assert.equal(rangee.className, "telechargements-matiere-liens");
      assert.equal(rangee.children[0].textContent, "Fiche complète");
      for (const bouton of rangee.children) {
        assert.equal(bouton.attributs["aria-label"], bouton.textContent + " · " + titre.textContent);
        assert.equal(bouton.rel, "nofollow noreferrer");
      }
      return rangee.children;
    });
    assert.deepEqual(boutons.map((bouton) => bouton.href), donnees.liens.map((lien) => lien.url));
    if (produitId === "pack-l2-revision") {
      const [titre, rangee] = groupes[0].children;
      assert.equal(titre.textContent, "Droit administratif L2 S1");
      assert.deepEqual(rangee.children.map((bouton) => bouton.textContent), ["Fiche complète", "Plan", "Carte mentale"]);
    }
  }
});

test("les fichiers d’un pack mêlant plusieurs formats gardent leurs boutons actuels", async () => {
  const { donnees } = await apiFactice(donneesStripe({
    payment_status: "paid", metadata: { produitIds: "pack-matiere-penal-l2-revision" },
  })).appeler("GET", sessionId, "confirmation");
  const nav = navigateur([[200, donnees]]);
  await laisserRepondre();
  const boutons = nav.element("purchaseDownloadsList").children;
  assert.ok(boutons.every(bouton => bouton.tag === "a" && bouton.className === "btn btn--primary"));
  assert.deepEqual(boutons.map(bouton => bouton.href), donnees.liens.map(lien => lien.url));
  assert.equal(nav.element("purchaseAnkiHelp").hidden, false);
});

test("le stockage bloqué laisse le navigateur vérifier une commande gratuite", async () => {
  const nav = navigateur([[200, { montant: 0, produitIds: [fiche], emailsAcceptes: true }]], { stockageAutorise: false });
  await laisserRepondre();
  assert.equal(nav.requetes.length, 1);
  assert.equal(nav.element("purchaseConfirmedContent").hidden, false);
  assert.equal(nav.mesures.length, 0);
});
