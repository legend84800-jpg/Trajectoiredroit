// Pack Ultra offert depuis parents.html (27/09/2026) : création de la session
// Stripe avec les champs cadeau, livraison à l'étudiant et confirmation au parent.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const {
  lireCadeauFormulaire,
  cadeauDepuisMetadata,
  formaterNomOffrant,
  construireEmailEtudiant,
  construireEmailParent,
} = require("../api/_cadeau");

const RACINE = path.join(__dirname, "..");

function reponseFactice() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(nom, valeur) { this.headers[nom] = valeur; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function creerCheckout(body) {
  const stripeModule = require("../api/_stripe");
  const creerOriginal = stripeModule.creerClientStripe;
  const appels = [];
  stripeModule.creerClientStripe = () => ({
    checkout: {
      sessions: {
        create: async (params, options) => {
          appels.push({ params, options });
          return { id: "cs_test_cadeau", url: "https://checkout.stripe.com/c/pay/test" };
        },
      },
    },
  });
  const cheminModule = require.resolve("../api/create-checkout");
  delete require.cache[cheminModule];
  const handler = require("../api/create-checkout");
  const ancienneCle = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_factice";
  const res = reponseFactice();
  try {
    await handler({
      method: "POST",
      body: {
        attemptId: "12345678-1234-1234-1234-123456789012",
        attemptCreatedAt: Math.floor(Date.now() / 1000),
        pageActuelle: "parents.html#offrir",
        ...body,
      },
    }, res);
  } finally {
    stripeModule.creerClientStripe = creerOriginal;
    delete require.cache[cheminModule];
    if (ancienneCle === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ancienneCle;
  }
  return { res, appels };
}

function sessionCadeau(surcharges = {}) {
  return {
    id: "cs_test_cadeau_1",
    mode: "payment",
    payment_status: "paid",
    amount_total: 23900,
    metadata: {
      produitIds: "pack-ultra-l1-s1",
      source: "site",
      cadeauEmail: "lea.martin@example.com",
      cadeauPrenom: "Léa",
      cadeauMessage: "Bon courage pour les partiels !\nMaman",
    },
    customer_details: { email: "parent@example.com", name: "MARIE MARTIN" },
    custom_fields: [{ key: "emails", dropdown: { value: "oui" } }],
    discounts: [],
    ...surcharges,
  };
}

function operationsEspionnes(journal, surcharges = {}) {
  return {
    insererSiAbsent: async (_table, donnees) => { journal.achat = donnees; return [{ id: 1 }]; },
    supprimer: async () => { journal.suppressions = (journal.suppressions || 0) + 1; return []; },
    envoyerEmail: async (email) => { journal.emailClassique = email; },
    envoyerEmailCadeau: async (cadeau, nomOffrant, produits, liens) => {
      journal.emailEtudiant = { cadeau, nomOffrant, produits, liens };
    },
    envoyerConfirmationCadeau: async (emailParent, cadeau) => {
      journal.confirmationParent = { emailParent, cadeau };
    },
    envoyerConfirmationStage: async () => {},
    notifierJulienStage: async () => {},
    envoyerAchatMeta: async (donnees) => { journal.meta = donnees.email; },
    creerRemisePostAchat: async () => ({ code: "POSTA-TEST", dateFin: "12 octobre 2026" }),
    creerContactBrevoAchat: async (email, _p, _m, _k, accord) => {
      journal.brevo = { email, accord };
      return { estNouveau: false };
    },
    reinscrireAcheteurBrevo: async (email) => { journal.reinscription = email; },
    recupererCodePromo: async () => null,
    annulerRelancePlanifiee: async () => {},
    bornerAbonnement: async (_stripe, id, nombre) => { journal.borne = `${id}:${nombre}`; },
    ...surcharges,
  };
}

function contexte(operations) {
  return {
    operations,
    stripe: {},
    brevoKey: "brevo_test",
    downloadSecret: "secret_test",
    origin: "https://trajectoiredroit.com",
  };
}

test("le formulaire cadeau valide l'email et limite le prénom et le message", () => {
  assert.equal(lireCadeauFormulaire({}), null);
  assert.equal(lireCadeauFormulaire({ cadeauEmail: "   " }), null);
  assert.deepEqual(lireCadeauFormulaire({ cadeauEmail: "pas-un-email" }), { erreur: "cadeau_email_invalide" });
  const cadeau = lireCadeauFormulaire({
    cadeauEmail: "  Lea.Martin@Example.com ",
    cadeauPrenom: `Léa\u0000${"x".repeat(80)}`,
    cadeauMessage: `Ligne 1\r\n\r\n\r\n\r\nLigne 2\u0007${"y".repeat(600)}`,
  });
  assert.equal(cadeau.email, "lea.martin@example.com");
  assert.equal(cadeau.prenom.length, 40);
  assert.ok(!/\u0000/.test(cadeau.prenom));
  assert.ok(cadeau.message.length <= 300);
  assert.ok(cadeau.message.startsWith("Ligne 1\n\nLigne 2"));
  assert.ok(!/\u0007/.test(cadeau.message));
});

test("la session Stripe d'un cadeau porte l'étudiant en metadata et parle au parent", async () => {
  const { res, appels } = await creerCheckout({
    produitId: "pack-ultra-l1-s1",
    cadeauEmail: "Lea.Martin@example.com",
    cadeauPrenom: "Léa",
    cadeauMessage: "Bon courage pour les partiels !",
  });
  assert.equal(res.statusCode, 200);
  assert.equal(appels.length, 1);
  const { params, options } = appels[0];
  assert.equal(params.mode, "payment");
  assert.equal(params.metadata.cadeauEmail, "lea.martin@example.com");
  assert.equal(params.metadata.cadeauPrenom, "Léa");
  assert.equal(params.metadata.cadeauMessage, "Bon courage pour les partiels !");
  Object.values(params.metadata).forEach((valeur) => assert.ok(String(valeur).length <= 500));
  assert.equal(params.payment_intent_data.metadata.cadeau, "1");
  assert.equal(params.customer_email, undefined, "l'email de l'étudiant ne préremplit jamais celui du payeur");
  assert.equal(params.custom_fields[0].key, "emails", "le choix « emails » reste posé au parent");
  assert.match(params.custom_text.submit.message, /lea\.martin@example\.com/);
  assert.match(params.custom_text.submit.message, /Vous recevez/);
  assert.match(params.line_items[0].price_data.product_data.description, /^Cadeau pour lea\.martin@example\.com/);
  assert.equal(params.cancel_url, "https://trajectoiredroit.com/parents.html#offrir");
  assert.match(options.idempotencyKey, /-cadeau$/);
});

test("un cadeau payé en 3 fois reste un abonnement borné et garde le cadeau", async () => {
  const { appels } = await creerCheckout({
    produitId: "pack-ultra-l3-s1",
    echeances: 3,
    cadeauEmail: "etudiant@example.com",
  });
  const { params } = appels[0];
  assert.equal(params.mode, "subscription");
  assert.equal(params.metadata.echeances, "3");
  assert.equal(params.metadata.cadeauEmail, "etudiant@example.com");
  assert.equal(params.metadata.cadeauPrenom, undefined);
  assert.equal(params.subscription_data.metadata.cadeau, "1");
  assert.equal(params.subscription_data.metadata.echeances, "3");
  assert.match(params.custom_text.submit.message, /99,66 € aujourd'hui/);
  assert.match(params.custom_text.submit.message, /298,98 € au total/);
  assert.match(params.custom_text.submit.message, /etudiant@example\.com dès le premier paiement\./);
  assert.ok(!/tu reçois/i.test(params.custom_text.submit.message));
});

test("un cadeau refuse un email invalide ou un produit autre qu'un Pack Ultra", async () => {
  const invalide = await creerCheckout({ produitId: "pack-ultra-l1-s1", cadeauEmail: "lea@" });
  assert.equal(invalide.res.statusCode, 400);
  assert.equal(invalide.res.payload.code, "cadeau_email_invalide");
  assert.equal(invalide.appels.length, 0);

  const fiche = await creerCheckout({ produitId: "fiche-da-l2-s1", cadeauEmail: "lea@example.com" });
  assert.equal(fiche.res.statusCode, 400);
  assert.equal(fiche.res.payload.code, "cadeau_indisponible");
  assert.equal(fiche.appels.length, 0);
});

test("sans cadeau, la session d'un Pack Ultra reste identique", async () => {
  const { appels } = await creerCheckout({ produitId: "pack-ultra-l1-s1", echeances: 2 });
  const { params, options } = appels[0];
  assert.equal(params.metadata.cadeauEmail, undefined);
  assert.equal(params.subscription_data.metadata.cadeau, undefined);
  assert.match(params.custom_text.submit.message, /^Tu paies/);
  assert.equal(options.idempotencyKey, "checkout-12345678-1234-1234-1234-123456789012-x2");
});

test("le webhook livre le pack à l'étudiant et confirme au parent", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  const journal = {};
  const resultat = await traiterAchatPaye(sessionCadeau(), contexte(operationsEspionnes(journal)));
  assert.equal(resultat.traite, true);
  assert.equal(journal.achat.email, "lea.martin@example.com", "l'accès Mon compte suit l'étudiant");
  assert.equal(journal.emailEtudiant.cadeau.email, "lea.martin@example.com");
  assert.equal(journal.emailEtudiant.cadeau.message, "Bon courage pour les partiels !\nMaman");
  assert.equal(journal.emailEtudiant.nomOffrant, "Marie Martin");
  assert.deepEqual(journal.emailEtudiant.liens, [], "le Pack Ultra se télécharge depuis Mon compte");
  assert.equal(journal.emailClassique, undefined);
  assert.equal(journal.confirmationParent.emailParent, "parent@example.com");
  // Brevo, la remise et Meta concernent le parent, jamais l'étudiant.
  assert.deepEqual(journal.brevo, { email: "parent@example.com", accord: true });
  assert.equal(journal.reinscription, "parent@example.com");
  assert.equal(journal.meta, undefined);
});

test("le webhook couvre un cadeau payé en plusieurs fois", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  const journal = {};
  const session = sessionCadeau({
    mode: "subscription",
    subscription: "sub_test_cadeau",
    amount_total: 7966,
    metadata: {
      ...sessionCadeau().metadata,
      echeances: "3",
      montantEcheance: "7966",
      montantTotal: "23898",
      consentMarketing: "1",
    },
  });
  await traiterAchatPaye(session, contexte(operationsEspionnes(journal)));
  assert.equal(journal.borne, "sub_test_cadeau:3");
  assert.equal(journal.achat.email, "lea.martin@example.com");
  assert.equal(journal.emailEtudiant.cadeau.email, "lea.martin@example.com");
  assert.equal(journal.confirmationParent.emailParent, "parent@example.com");
  assert.equal(journal.meta, "parent@example.com");
});

test("le choix « non » du parent le garde hors de la liste Brevo, l'étudiant n'y entre jamais", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  const journal = {};
  await traiterAchatPaye(
    sessionCadeau({ custom_fields: [{ key: "emails", dropdown: { value: "non" } }] }),
    contexte(operationsEspionnes(journal))
  );
  assert.deepEqual(journal.brevo, { email: "parent@example.com", accord: false });
  assert.equal(journal.reinscription, undefined);
});

test("un échec de la confirmation au parent ne rejoue jamais la livraison", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  const journal = {};
  const operations = operationsEspionnes(journal, {
    envoyerConfirmationCadeau: async () => { throw new Error("Brevo indisponible"); },
  });
  const resultat = await traiterAchatPaye(sessionCadeau(), contexte(operations));
  assert.equal(resultat.traite, true);
  assert.equal(journal.suppressions, undefined);
  assert.equal(journal.emailEtudiant.cadeau.email, "lea.martin@example.com");
});

test("sans cadeau, le webhook livre l'acheteur comme avant", async () => {
  const { traiterAchatPaye } = require("../api/stripe-webhook")._test;
  const journal = {};
  const session = sessionCadeau({ metadata: { produitIds: "pack-ultra-l1-s1", source: "site" } });
  await traiterAchatPaye(session, contexte(operationsEspionnes(journal)));
  assert.equal(journal.achat.email, "parent@example.com");
  assert.equal(journal.emailClassique, "parent@example.com");
  assert.equal(journal.emailEtudiant, undefined);
  assert.equal(journal.confirmationParent, undefined);
});

test("un email cadeau malformé dans la metadata est ignoré", () => {
  assert.equal(cadeauDepuisMetadata({ cadeauEmail: "invalide" }), null);
  assert.equal(cadeauDepuisMetadata({}), null);
  assert.equal(cadeauDepuisMetadata(null), null);
  assert.equal(formaterNomOffrant("JEAN-PIERRE DURAND"), "Jean-Pierre Durand");
  assert.equal(formaterNomOffrant("Marie de La Tour"), "Marie de La Tour");
});

test("l'email à l'étudiant tutoie, reprend le message échappé et n'expose aucun lien de fichier", () => {
  const email = construireEmailEtudiant({
    cadeau: { email: "lea@example.com", prenom: "Léa", message: "Courage <3\nPapa" },
    nomOffrant: "Marie Martin",
    produits: [PRODUITS["pack-ultra-l1-s1"]],
    liens: [],
  });
  assert.equal(email.sujet, "Marie Martin t'offre le Pack Ultra L1 semestre 1");
  assert.match(email.html, /Courage &lt;3<br>Papa/);
  assert.match(email.html, /mon-compte\.html/);
  assert.ok(!/api\/telecharger/.test(email.html));
  assert.match(email.texte, /^Bonjour Léa,/);
  assert.ok(!/\bvous\b/i.test(email.texte));
});

test("la confirmation au parent vouvoie, détaille les échéances et ne contient aucun fichier", () => {
  const email = construireEmailParent({
    cadeau: { email: "lea@example.com", prenom: "Léa", message: "" },
    produits: [PRODUITS["pack-ultra-l1-s1"]],
    metadata: { echeances: "3", montantEcheance: "7966" },
    montantCentimes: 7966,
    codePromo: null,
  });
  assert.equal(email.sujet, "Votre cadeau est bien parti chez Léa");
  assert.match(email.texte, /payer en 3 fois/);
  assert.match(email.texte, /79,66 €/);
  assert.match(email.texte, /238,98 € au total/);
  assert.ok(!/api\/telecharger/.test(email.html));
  assert.ok(!/\btu\b/i.test(email.texte));

  const unique = construireEmailParent({
    cadeau: { email: "lea@example.com", prenom: "", message: "Bravo" },
    produits: [PRODUITS["pack-ultra-l1-s1"]],
    metadata: {},
    montantCentimes: 23900,
    codePromo: "LYON3JULIE",
  });
  assert.match(unique.texte, /Votre paiement de 239,00 € a bien été reçu\./);
  assert.match(unique.texte, /accompagné de votre message/);
  assert.match(unique.texte, /LYON3JULIE/);
});

test("le formulaire de parents.html propose les cinq packs en vente au bon prix", () => {
  const html = fs.readFileSync(path.join(RACINE, "parents.html"), "utf8");
  const options = [...html.matchAll(/<option value="(pack-ultra-[a-z0-9-]+)" data-prix="(\d+)">/g)];
  const enVente = Object.entries(PRODUITS)
    .filter(([id, p]) => id.startsWith("pack-ultra-") && !p.venteSuspendue)
    .map(([id]) => id)
    .sort();
  assert.deepEqual(options.map((o) => o[1]).sort(), enVente);
  options.forEach(([, id, prix]) => assert.equal(Number(prix), PRODUITS[id].prix, id));
  assert.match(html, /id="offrirEmail"[^>]*required/);
  assert.match(html, /id="offrirMessage"[^>]*maxlength="300"/);
  assert.match(html, /cadeauEmail: adresse/);
});
