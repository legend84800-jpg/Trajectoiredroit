const attributionAtelier = require("./_atelier-attribution");
// Crée une session Stripe Checkout pour un produit TJD, avec order bump optionnel.
// Reçoit { produitId, bumpId?, attemptId? } en POST. Retourne { url } pour rediriger le client.
// Garde le portail Stripe des anciens abonnements (type: "portal"), afin de rester
// sous la limite de 12 fonctions serverless du plan Vercel Hobby.

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { avecImagesProduits } = require("./_images-produits");
const { selectionner } = require("./_supabase");
const { creerClientStripe, INTEGRATION_IDS } = require("./_stripe");
const { nombreEcheancesValide, versCheckoutEcheances, montantEcheance } = require("./_echeances");
const { lireCadeauFormulaire, appliquerCadeauCheckout } = require("./_cadeau");

// Textes affichés par Stripe sur la page de paiement des produits livrés par email.
// Sur mobile, Stripe replie le récapitulatif : le message sous le bouton Payer
// reste alors la seule information visible sur la livraison. Le texte suit le
// nombre réel de fichiers envoyés (fiche, plan, cartes mentales, Anki, pack).
const nombreFichiers = (p) => (Array.isArray(p.blobs) ? p.blobs.length : 0);
// Les Packs Ultra et les podcasts et vidéos se retrouvent dans Mon compte, jamais
// en pièces jointes de l'email : le texte de Stripe le dit tel quel.
const estPackUltra = (p) => Array.isArray(p.inclus) && Array.isArray(p.blobsMeta);
const livreDansCompte = (p) => !!p.mediaEnLigne || estPackUltra(p);
const descriptionLivraison = (p) => (p.mediaEnLigne
  ? "Tu retrouves chaque leçon en podcast et en vidéo dans ton espace Mon compte dès que le paiement est validé, et tu y gardes l'accès à vie."
  : estPackUltra(p)
    ? "Tu retrouves toutes les ressources du pack dans ton espace Mon compte dès que le paiement est validé, et tu y gardes l'accès à vie."
    : nombreFichiers(p) > 1
  ? `Tu reçois ${nombreFichiers(p)} fichiers par email dès que le paiement est validé, et tu les gardes à vie avec leurs mises à jour.`
  : "Le PDF arrive par email dès que le paiement est validé, et tu le gardes à vie avec ses mises à jour.");
const messagePaiement = (produits) => (produits.length && produits.every(livreDansCompte)
  ? "Vérifie ton adresse email, car c'est avec elle que tu te connectes ensuite à ton espace Mon compte."
  : produits.reduce((n, p) => n + nombreFichiers(p), 0) > 1
  ? "Vérifie ton adresse email, car tes fichiers y sont envoyés juste après le paiement."
  : "Vérifie ton adresse email, car ton PDF y est envoyé juste après le paiement.");
// Stripe ne propose sa case d'accord promotionnel qu'aux entreprises et aux clients
// américains : elle ne s'affiche jamais pour un étudiant français. Pour écrire aux
// acheteurs sur des produits analogues (article L34-5 du Code des postes et des
// communications électroniques), la page de paiement les informe et leur laisse
// refuser dès l'achat, grâce à ce choix prérempli sur « oui ».
const CHAMP_EMAILS = {
  key: "emails",
  type: "dropdown",
  optional: true,
  label: { type: "custom", custom: "Conseils de révision et offres par email" },
  dropdown: {
    default_value: "oui",
    options: [
      { label: "Oui", value: "oui" },
      { label: "Non merci", value: "non" },
    ],
  },
};
const donneesProduit = (p, estStage) => (estStage || nombreFichiers(p) === 0
  ? { name: p.nom }
  : { name: p.nom, description: descriptionLivraison(p) });

// Garantie réussite (décision de Julien du 10/10/2026, conditions détaillées sur
// garantie-reussite.html). Affichée sous le bouton Payer de Stripe, en plus du
// message sur l'adresse email. Le stage en est exclu et garde son propre texte.
// Stripe limite chaque texte personnalisé à 1 200 caractères.
const URL_GARANTIE = "https://trajectoiredroit.com/garantie-reussite.html";
const TEXTE_GARANTIE = "Si tu n'as pas la moyenne à l'examen, je te rembourse, à condition "
  + "d'avoir acheté au moins 14 jours avant l'examen. "
  + `[Lire les conditions de la garantie](${URL_GARANTIE})`;
const avecGarantie = (customText) => ({ ...(customText || {}), after_submit: { message: TEXTE_GARANTIE } });

// Codes promo (chantier conversion du 10/10/2026). Le champ « Ajouter un code
// promotionnel » de Stripe poussait les étudiants à chercher un code sur Google.
// Il reste donc masqué, sauf dans deux cas :
//   - le lien du site porte ?code=XXX (email J+8 avec le code POSTA-xxxx, code
//     ambassadeur) : le code actif est appliqué d'office, et s'il est introuvable
//     le champ revient pour que l'étudiant le saisisse lui-même ;
//   - le visiteur a déjà acheté (clé posée par merci-achat.html), parce qu'il peut
//     avoir reçu son code personnel par email.
// Le lien de récupération d'un panier abandonné garde le champ, comme avant.
const CODE_PROMO_VALIDE = /^[A-Za-z0-9_-]{3,40}$/;
function lireCodePromo(valeur) {
  if (typeof valeur !== "string") return "";
  const code = valeur.trim();
  return CODE_PROMO_VALIDE.test(code) ? code : "";
}

async function chercherCodePromo(stripe, code) {
  if (!code) return null;
  try {
    const liste = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    const promo = liste && Array.isArray(liste.data) ? liste.data[0] : null;
    return promo && promo.id ? promo : null;
  } catch (e) {
    console.error("create-checkout recherche du code promo impossible", {
      stripeCode: e && e.code ? e.code : "inconnu",
    });
    return null;
  }
}

// Renvoie les paramètres Checkout avec soit la remise appliquée (discounts), soit
// le champ code promo affiché ou masqué. Stripe refuse discounts et
// allow_promotion_codes dans la même session.
function appliquerCodePromo(params, { promo, codeDemande, dejaAcheteur }) {
  const suite = { ...params };
  if (promo) {
    delete suite.allow_promotion_codes;
    suite.discounts = [{ promotion_code: promo.id }];
    suite.metadata = { ...suite.metadata, codePromoLien: String(promo.code || codeDemande).slice(0, 40) };
    // Stripe refuse aussi discounts avec le champ code promo du lien de récupération.
    if (suite.after_expiration && suite.after_expiration.recovery) {
      const recovery = { ...suite.after_expiration.recovery };
      delete recovery.allow_promotion_codes;
      suite.after_expiration = { ...suite.after_expiration, recovery };
    }
    return suite;
  }
  delete suite.discounts;
  suite.allow_promotion_codes = Boolean(codeDemande) || dejaAcheteur;
  return suite;
}

// Crée la session. Si Stripe refuse la remise (code expiré ou épuisé entre la
// recherche et la création), la session repart sans remise, avec le champ affiché.
async function creerSessionAvecRepli(stripe, params, cle) {
  if (!params.discounts) {
    return stripe.checkout.sessions.create(avecImagesProduits(params), { idempotencyKey: cle });
  }
  try {
    return await stripe.checkout.sessions.create(avecImagesProduits(params), { idempotencyKey: `${cle}-remise` });
  } catch (e) {
    if (!e || e.type !== "StripeInvalidRequestError") throw e;
    console.error("create-checkout remise refusée, repli sur le champ code promo", {
      stripeCode: e.code ? e.code : "inconnu",
      stripeMessage: typeof e.message === "string" ? e.message.slice(0, 200) : "",
    });
    const repli = { ...params, allow_promotion_codes: true };
    delete repli.discounts;
    if (repli.metadata) {
      repli.metadata = { ...repli.metadata };
      delete repli.metadata.codePromoLien;
    }
    if (repli.after_expiration && repli.after_expiration.recovery) {
      repli.after_expiration = {
        ...repli.after_expiration,
        recovery: { ...repli.after_expiration.recovery, allow_promotion_codes: true },
      };
    }
    return stripe.checkout.sessions.create(avecImagesProduits(repli), { idempotencyKey: `${cle}-repli` });
  }
}


function normaliserAttemptId(valeur) {
  if (typeof valeur === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(valeur.trim())) {
    return valeur.trim();
  }
  return crypto.randomUUID();
}

function normaliserAttemptTimestamp(valeur) {
  const maintenant = Math.floor(Date.now() / 1000);
  const timestamp = Number(valeur);
  if (Number.isInteger(timestamp) && timestamp >= maintenant - 600 && timestamp <= maintenant + 60) {
    return timestamp;
  }
  return maintenant;
}

// Relance de panier (décision de Julien du 15/10/2026). Les 13 derniers abandons
// réels n'avaient aucune adresse : l'étudiant quittait Stripe avant de la taper.
// Le site demande donc l'adresse juste avant la redirection, avec une case non
// cochée pour accepter le rappel. L'adresse préremplit Stripe ; l'accord est
// gardé en metadata et lu par api/_relance-diagnostic.js.
// Un essai réel reste possible en mode test interne, uniquement vers l'adresse
// de Julien : la session expire alors à 31 minutes, le minimum de Stripe.
const EMAIL_ESSAI_RELANCE = "julien.prof1@gmail.com";
const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lireEmailAchat(valeur) {
  if (typeof valeur !== "string") return "";
  const email = valeur.trim().toLowerCase().slice(0, 200);
  return EMAIL_VALIDE.test(email) ? email : "";
}

function reglerRelance(params, { emailAchat, accordRelance, internalTest, contientStage }) {
  const suite = { ...params, metadata: { ...params.metadata } };
  if (emailAchat && !suite.customer_email) suite.customer_email = emailAchat;
  const accord = !!(accordRelance && emailAchat);
  if (accord) suite.metadata.accordRelance = "1";
  const essai = internalTest && accord && emailAchat === EMAIL_ESSAI_RELANCE && !contientStage;
  if (essai) {
    suite.metadata.relanceTest = "1";
    suite.metadata.reminderPlan = "h1-h24-v1";
    suite.expires_at = Math.floor(Date.now() / 1000) + 31 * 60;
    suite.after_expiration = { recovery: { enabled: true, allow_promotion_codes: true } };
  }
  return suite;
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://trajectoiredroit.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erreur: "Méthode non autorisée", code: "methode_non_autorisee" }); return; }

  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  corps = corps || {};
  if (typeof corps.code === 'string' && corps.code.trim().toUpperCase() === 'CORRIGE10') {
    const ids = Array.isArray(corps.produitIds) ? corps.produitIds : [corps.produitId, corps.bumpId].filter(Boolean);
    if (!ids.length || ids.some(id => typeof id !== 'string' || !/^(cas-pratique-|commentaire-arret-|dissertation-)/.test(id) || !PRODUITS[id])) {
      return res.status(400).json({ erreur: 'Le code CORRIGE10 s’applique aux recueils de corrigés.', code: 'remise_corriges' });
    }
  }


  if (corps.mode === "subscription" || corps.type === "portalis_recharge" || corps.type === "portal") {
    res.setHeader("Cache-Control", "no-store");
    await require("./_portalis-checkout").checkout(req, res, corps);
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ erreur: "Configuration Stripe manquante", code: "configuration" }); return; }
  const stripe = creerClientStripe(stripeKey);
  const attemptId = normaliserAttemptId(corps.attemptId);
  const attemptTimestamp = normaliserAttemptTimestamp(corps.attemptCreatedAt);

  const origin = "https://trajectoiredroit.com";

  // Panier multi-produits (chantier 5.12, ajouté le 21/09/2026). Reçoit { produitIds: [...] }
  // au lieu de { produitId, bumpId? }. Reste une branche séparée, retournée avant la validation
  // du produit unique ci-dessous, pour ne rien changer au flux existant à 1 (ou 2 avec bump)
  // produit qui gère l'essentiel des ventes aujourd'hui.
  if (Array.isArray(corps.produitIds)) {
    const idsBrut = corps.produitIds
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => v.trim());
    const idsUniques = [...new Set(idsBrut)];
    if (idsUniques.some((id) => PRODUITS[id]?.venteSuspendue)) {
      res.status(400).json({ erreur: "Produit indisponible", code: "produit_indisponible" });
      return;
    }
    // Le stage de méthode reste hors panier : places limitées et datées, formulaire
    // d'inscription dédié (nom, WhatsApp, niveau) qui n'a pas sa place dans un achat groupé.
    const produitsPanier = idsUniques
      .map((id) => ({ id, produit: PRODUITS[id] }))
      .filter((p) => p.produit && p.id !== "stage-methode");

    if (!produitsPanier.length) {
      res.status(400).json({ erreur: "Panier vide ou produits inconnus", code: "panier_invalide" });
      return;
    }

    const fbpPanier = typeof corps.fbp === "string" ? corps.fbp.trim() : "";
    const fbcPanier = typeof corps.fbc === "string" ? corps.fbc.trim() : "";
    const consentMarketingPanier = corps.consentMarketing === true;
    const tronquerPanier = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const landingPagePanier = tronquerPanier(corps.landingPage, 200);
    const referrerPanier = tronquerPanier(corps.referrer, 200);
    const pageActuelleBrutePanier = tronquerPanier(corps.pageActuelle, 200);
    const pageActuellePanier = /^[a-z0-9/_-]+\.html(#[a-z0-9_-]+)?$/i.test(pageActuelleBrutePanier)
      ? pageActuelleBrutePanier
      : "";
    const utmSourcePanier = tronquerPanier(corps.utm_source, 100);
    const utmMediumPanier = tronquerPanier(corps.utm_medium, 100);
    const utmCampaignPanier = tronquerPanier(corps.utm_campaign, 100);
    const utmContentPanier = tronquerPanier(corps.utm_content, 100);
    const deviceTypePanier = ["mobile", "tablette", "ordinateur"].includes(corps.deviceType)
      ? corps.deviceType
      : "inconnu";
    const viewportPanier = /^\d{2,5}x\d{2,5}$/.test(tronquerPanier(corps.viewport, 20))
      ? tronquerPanier(corps.viewport, 20)
      : "inconnu";
    const internalTestPanier = corps.internalTest === true;
    const idsAchetesPanier = produitsPanier.map((p) => p.id);

    const paramsPanier = {
      line_items: produitsPanier.map(({ produit }) => ({
        price_data: {
          currency: "eur",
          unit_amount: produit.prix,
          product_data: donneesProduit(produit, false),
        },
        quantity: 1,
      })),
      custom_text: avecGarantie({ submit: { message: messagePaiement(produitsPanier.map(({ produit }) => produit)) } }),
      custom_fields: [CHAMP_EMAILS],
      mode: "payment",
      locale: "fr",
      wallet_options: { link: { display: "never" } },
      allow_promotion_codes: false,
      consent_collection: { promotions: "auto" },
      success_url: `${origin}/merci-achat.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: pageActuellePanier ? `${origin}/${pageActuellePanier}` : `${origin}/formations.html`,
      expires_at: attemptTimestamp + 3600,
      metadata: {
        ...attributionAtelier(corps),
        produitIds: idsAchetesPanier.join(","),
        attemptId,
        source: internalTestPanier ? "test_interne" : "site",
        currentPage: pageActuellePanier || "formations.html",
        deviceType: deviceTypePanier,
        viewport: viewportPanier,
        internalTest: internalTestPanier ? "1" : "0",
        reminderPlan: internalTestPanier ? "none" : "h1-h24-v1",
        panier: "1",
      },
      payment_intent_data: { metadata: { produitIds: idsAchetesPanier.join(",") } },
      branding_settings: {
        display_name: "Trajectoire Droit",
        icon: { type: "url", url: `${origin}/assets/logo-tjd-mark.png` },
        background_color: "#ffffff",
        button_color: "#1A2851",
        border_style: "rounded",
        font_family: "pt_serif",
      },
      integration_identifier: INTEGRATION_IDS.checkout,
    };
    if (!internalTestPanier) {
      paramsPanier.after_expiration = { recovery: { enabled: true, allow_promotion_codes: true } };
    }
    if (consentMarketingPanier) {
      paramsPanier.metadata.consentMarketing = "1";
      if (fbpPanier) paramsPanier.metadata.fbp = fbpPanier;
      if (fbcPanier) paramsPanier.metadata.fbc = fbcPanier;
    }
    if (landingPagePanier) paramsPanier.metadata.landingPage = landingPagePanier;
    if (referrerPanier) paramsPanier.metadata.referrer = referrerPanier;
    if (utmSourcePanier) paramsPanier.metadata.utmSource = utmSourcePanier;
    if (utmMediumPanier) paramsPanier.metadata.utmMedium = utmMediumPanier;
    if (utmCampaignPanier) paramsPanier.metadata.utmCampaign = utmCampaignPanier;
    if (utmContentPanier) paramsPanier.metadata.utmContent = utmContentPanier;

    const paramsPanierRelance = reglerRelance(paramsPanier, {
      emailAchat: lireEmailAchat(corps.emailAchat),
      accordRelance: corps.accordRelance === true,
      internalTest: internalTestPanier,
      contientStage: false,
    });
    const codeDemandePanier = lireCodePromo(corps.code);
    const paramsPanierFinaux = appliquerCodePromo(paramsPanierRelance, {
      promo: await chercherCodePromo(stripe, codeDemandePanier),
      codeDemande: codeDemandePanier,
      dejaAcheteur: corps.dejaAcheteur === true,
    });

    try {
      const sessionPanier = await creerSessionAvecRepli(stripe, paramsPanierFinaux, `checkout-panier-${attemptId}`);
      res.status(200).json({
        url: sessionPanier.url,
        sessionId: sessionPanier.id,
        attemptId,
        attemptCreatedAt: attemptTimestamp,
      });
    } catch (e) {
      console.error("create-checkout (panier) erreur Stripe", {
        attemptId,
        produits: idsAchetesPanier.join(","),
        stripeCode: e && e.code ? e.code : "inconnu",
        stripeType: e && e.type ? e.type : "inconnu",
      });
      res.status(502).json({ erreur: "Erreur Stripe", code: "stripe" });
    }
    return;
  }

  const produitId = typeof corps.produitId === "string" ? corps.produitId.trim() : "";
  const bumpId = typeof corps.bumpId === "string" ? corps.bumpId.trim() : "";
  const fbp = typeof corps.fbp === "string" ? corps.fbp.trim() : "";
  const fbc = typeof corps.fbc === "string" ? corps.fbc.trim() : "";
  const consentMarketing = corps.consentMarketing === true;

  // Attribution (page d'origine, referrer, UTM) : simple texte affiché nulle part,
  // uniquement écrit en metadata Stripe puis dans Supabase par le webhook, tronqué
  // par sécurité même si aucun de ces champs n'est jamais interprété comme du code.
  const tronquer = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const landingPage = tronquer(corps.landingPage, 200);
  const referrer = tronquer(corps.referrer, 200);
  // Chemin relatif uniquement (lettres/chiffres/tirets/slash/point/ancre) : jamais une URL
  // absolue, pour ne pas transformer cancel_url en redirection ouverte vers un autre domaine.
  const pageActuelleBrute = tronquer(corps.pageActuelle, 200);
  const pageAccueilPack = /^#pack-ultra(?:-l[123]-s[12]|-detail-l[123]-s[12])?$/.test(pageActuelleBrute);
  const pageActuelle = pageAccueilPack || /^[a-z0-9/_-]+\.html(#[a-z0-9_-]+)?$/i.test(pageActuelleBrute)
    ? pageActuelleBrute : "";
  const utmSource = tronquer(corps.utm_source, 100);
  const utmMedium = tronquer(corps.utm_medium, 100);
  const utmCampaign = tronquer(corps.utm_campaign, 100);
  const utmContent = tronquer(corps.utm_content, 100);
  const deviceType = ["mobile", "tablette", "ordinateur"].includes(corps.deviceType)
    ? corps.deviceType
    : "inconnu";
  const viewport = /^\d{2,5}x\d{2,5}$/.test(tronquer(corps.viewport, 20))
    ? tronquer(corps.viewport, 20)
    : "inconnu";
  const internalTest = corps.internalTest === true;

  const produit = PRODUITS[produitId];
  if (!produit) {
    res.status(400).json({ erreur: "Produit inconnu", code: "produit_inconnu" });
    return;
  }
  if (produit.venteSuspendue) {
    res.status(400).json({ erreur: "Produit indisponible", code: "produit_indisponible" });
    return;
  }

  // Le stage de méthode est une session datée à 18 places, pas un PDF en stock illimité :
  // on compte les achats déjà enregistrés pour ne jamais vendre une place qui n'existe pas.
  const LIMITE_PLACES_STAGE = 18;
  if (produitId === "stage-methode") {
    try {
      const dejaInscrits = await selectionner("achats", `produit_ids=cs.${encodeURIComponent("{stage-methode}")}&select=id`);
      if (dejaInscrits.length >= LIMITE_PLACES_STAGE) {
        res.status(409).json({ erreur: "Stage complet", code: "stage_complet", complet: true });
        return;
      }
    } catch (e) {
      console.error("create-checkout (stage) erreur vérification places:", e.message);
      // Non bloquant : une panne de lecture Supabase ne doit pas empêcher une vente légitime.
    }
  }

  const bump = bumpId && bumpId !== produitId ? PRODUITS[bumpId] : null;
  if (bump?.venteSuspendue) {
    res.status(400).json({ erreur: "Produit indisponible", code: "produit_indisponible" });
    return;
  }

  // Pack Ultra offert par un parent (parents.html) : l'étudiant reçoit le pack,
  // le parent la confirmation. Réservé aux Packs Ultra achetés seuls.
  const cadeau = lireCadeauFormulaire(corps);
  if (cadeau && cadeau.erreur) {
    res.status(400).json({ erreur: "Adresse email de l'étudiant invalide", code: cadeau.erreur });
    return;
  }
  if (cadeau && (!produitId.startsWith("pack-ultra-") || bump)) {
    res.status(400).json({ erreur: "Cadeau réservé aux Packs Ultra", code: "cadeau_indisponible" });
    return;
  }
  const idsAchetes = bump ? [produitId, bumpId] : [produitId];
  const contientStage = idsAchetes.includes("stage-methode");
  const autoriserRelance = !internalTest && !contientStage;
  const pageSucces = produitId === "stage-methode" ? "merci-stage.html" : "merci-achat.html";

  const params = {
    // Pas de payment_method_types forcé : Stripe active les moyens de paiement
    // dynamiques du dashboard (carte, Link, Apple Pay, Google Pay, PayPal si activé),
    // essentiels pour des étudiants qui n'ont pas toujours de CB à leur nom.
    line_items: [{
      price_data: {
        currency: "eur",
        unit_amount: produit.prix,
        product_data: donneesProduit(produit, produitId === "stage-methode"),
      },
      quantity: 1,
    }],
    mode: "payment",
    locale: "fr",
    wallet_options: { link: { display: "never" } },
    // Champ code promo masqué par défaut, ouvert plus bas selon le lien et l'historique
    // d'achat. Le stage reste exclu, car il correspond à une place limitée dans une
    // session datée.
    allow_promotion_codes: false,
    // Stripe affiche une case facultative pour les communications promotionnelles
    // quand le contexte juridique du client l'exige. Le webhook ajoute ensuite à
    // la liste marketing Brevo uniquement les personnes qui ont donné cet accord.
    consent_collection: { promotions: "auto" },
    success_url: `${origin}/${pageSucces}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: pageActuelle ? `${origin}/${pageActuelle}` : `${origin}/formations.html`,
    // L'expiration à H+1 déclenche le webhook de panier abandonné. Stripe fournit
    // alors son lien de récupération natif et le webhook programme les deux rappels.
    expires_at: attemptTimestamp + 3600,
    ...(contientStage ? {} : {
      custom_text: { submit: { message: messagePaiement(bump ? [produit, bump] : [produit]) } },
      custom_fields: [CHAMP_EMAILS],
    }),
    metadata: {
      ...attributionAtelier(corps),
      produitIds: idsAchetes.join(","),
      attemptId,
      source: internalTest ? "test_interne" : "site",
      currentPage: pageActuelle || "formations.html",
      deviceType,
      viewport,
      internalTest: internalTest ? "1" : "0",
      reminderPlan: autoriserRelance ? "h1-h24-v1" : "none",
    },
    payment_intent_data: { metadata: { produitIds: idsAchetes.join(",") } },
    branding_settings: {
      display_name: "Trajectoire Droit",
      icon: { type: "url", url: `${origin}/assets/logo-tjd-mark.png` },
      background_color: "#ffffff",
      button_color: "#1A2851",
      border_style: "rounded",
      font_family: "pt_serif",
    },
    integration_identifier: INTEGRATION_IDS.checkout,
  };

  // Stripe génère à l'expiration un lien de récupération sécurisé, valable
  // 30 jours. Les stages datés et les tests internes restent exclus. Le lien de
  // récupération garde le champ code promo, comme avant le 10/10/2026.
  if (autoriserRelance) {
    params.after_expiration = {
      recovery: {
        enabled: true,
        allow_promotion_codes: true,
      },
    };
  }

  if (consentMarketing) {
    params.metadata.consentMarketing = "1";
    if (fbp) params.metadata.fbp = fbp;
    if (fbc) params.metadata.fbc = fbc;
  }

  if (landingPage) params.metadata.landingPage = landingPage;
  if (referrer) params.metadata.referrer = referrer;
  if (utmSource) params.metadata.utmSource = utmSource;
  if (utmMedium) params.metadata.utmMedium = utmMedium;
  if (utmCampaign) params.metadata.utmCampaign = utmCampaign;
  if (utmContent) params.metadata.utmContent = utmContent;

  // Champs du formulaire d'inscription au stage (remplace l'ancien flux /api/contact,
  // qui envoyait ces infos par email sans jamais déclencher de paiement) : transmis en
  // metadata Stripe pour que stripe-webhook.js confirme l'inscription et prévienne Julien.
  if (produitId === "stage-methode") {
    const nomInscrit = tronquer(corps.nom, 120);
    const emailInscrit = tronquer(corps.email, 200);
    const whatsapp = tronquer(corps.whatsapp, 40);
    const niveau = tronquer(corps.niveau, 40);
    const messageInscrit = tronquer(corps.message, 500);
    if (nomInscrit) params.metadata.nom = nomInscrit;
    if (whatsapp) params.metadata.whatsapp = whatsapp;
    if (niveau) params.metadata.niveau = niveau;
    if (messageInscrit) params.metadata.message = messageInscrit;
    // Pré-remplit l'email sur la page Stripe Checkout, déjà saisi dans le formulaire :
    // évite de le faire retaper, sans jamais faire confiance à une entrée non validée.
    if (emailInscrit && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInscrit)) {
      params.customer_email = emailInscrit;
    }
  }

  if (bump) {
    params.line_items.push({
      price_data: {
        currency: "eur",
        unit_amount: bump.prix,
        product_data: donneesProduit(bump, bumpId === "stage-methode"),
      },
      quantity: 1,
    });
  }

  // Paiement en 2 ou 3 fois sans frais, réservé aux Packs Ultra achetés seuls.
  const nombreEcheances = bump ? null : nombreEcheancesValide(produitId, produit, corps.echeances);
  const paramsEcheances = nombreEcheances ? versCheckoutEcheances(params, produit, nombreEcheances) : params;
  const paramsFinaux = cadeau
    ? appliquerCadeauCheckout(
      paramsEcheances,
      produit,
      cadeau,
      nombreEcheances,
      nombreEcheances ? montantEcheance(produit.prix, nombreEcheances) : 0
    )
    : paramsEcheances;
  const cleBase = nombreEcheances ? `checkout-${attemptId}-x${nombreEcheances}` : `checkout-${attemptId}`;
  const cleIdempotence = cadeau ? `${cleBase}-cadeau` : cleBase;

  // Le paiement en plusieurs fois garde son champ fermé (un code ne réduirait que la
  // première échéance) et le stage n'accepte aucun code. Le cadeau d'un parent
  // garde son propre message, sans la garantie rédigée pour l'étudiant.
  let paramsSession = paramsFinaux;
  if (!contientStage && !cadeau) {
    paramsSession = reglerRelance(paramsSession, {
      emailAchat: lireEmailAchat(corps.emailAchat),
      accordRelance: corps.accordRelance === true,
      internalTest,
      contientStage: contientStage || !!nombreEcheances,
    });
  }
  if (!contientStage && !nombreEcheances) {
    const codeDemande = lireCodePromo(corps.code);
    paramsSession = appliquerCodePromo(paramsSession, {
      promo: await chercherCodePromo(stripe, codeDemande),
      codeDemande,
      dejaAcheteur: corps.dejaAcheteur === true,
    });
  }
  if (!contientStage && !cadeau) {
    paramsSession = { ...paramsSession, custom_text: avecGarantie(paramsSession.custom_text) };
  }

  try {
    const sessionCheckout = await creerSessionAvecRepli(stripe, paramsSession, cleIdempotence);
    res.status(200).json({
      url: sessionCheckout.url,
      sessionId: sessionCheckout.id,
      attemptId,
      attemptCreatedAt: attemptTimestamp,
    });
  } catch (e) {
    console.error("create-checkout erreur Stripe", {
      attemptId,
      produitId,
      stripeCode: e && e.code ? e.code : "inconnu",
      stripeType: e && e.type ? e.type : "inconnu",
    });
    res.status(502).json({ erreur: "Erreur Stripe", code: "stripe" });
  }
}

module.exports = handler;
module.exports._test = {
  normaliserAttemptId,
  normaliserAttemptTimestamp,
  lireCodePromo,
  appliquerCodePromo,
  TEXTE_GARANTIE,
  CHAMP_EMAILS,
  lireEmailAchat,
  reglerRelance,
  EMAIL_ESSAI_RELANCE,
};
