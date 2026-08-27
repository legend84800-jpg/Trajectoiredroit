// Crée une session Stripe Checkout pour un produit TJD, avec order bump optionnel.
// Reçoit { produitId, bumpId?, attemptId? } en POST. Retourne { url } pour rediriger le client.
// Gère aussi l'abonnement récurrent Portalis (mode: "subscription") et l'ouverture
// du portail client Stripe pour le gérer/résilier (type: "portal"), afin de rester
// sous la limite de 12 fonctions serverless du plan Vercel Hobby.

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { selectionner } = require("./_supabase");
const { creerClientStripe, INTEGRATION_IDS } = require("./_stripe");

const PORTALIS_PRICE_ID = "price_1TqyboIJrx5ith04BGxcyg5T";

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

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://trajectoiredroit.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erreur: "Méthode non autorisée" }); return; }

  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  corps = corps || {};

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ erreur: "Configuration Stripe manquante" }); return; }
  const stripe = creerClientStripe(stripeKey);
  const attemptId = normaliserAttemptId(corps.attemptId);
  const attemptTimestamp = normaliserAttemptTimestamp(corps.attemptCreatedAt);

  const origin = "https://trajectoiredroit.com";

  // Portail client Stripe (gérer/résilier l'abonnement Portalis).
  if (corps.type === "portal") {
    const supabaseUserId = typeof corps.supabaseUserId === "string" ? corps.supabaseUserId.trim() : "";
    if (!supabaseUserId) { res.status(400).json({ erreur: "Compte manquant" }); return; }

    let abonnement;
    try {
      const lignes = await selectionner(
        "abonnements",
        `user_id=eq.${encodeURIComponent(supabaseUserId)}&select=stripe_customer_id&limit=1`
      );
      abonnement = lignes[0];
    } catch (e) {
      console.error("create-checkout (portal) erreur Supabase:", e.message);
      res.status(500).json({ erreur: "Erreur interne" });
      return;
    }
    if (!abonnement || !abonnement.stripe_customer_id) {
      res.status(400).json({ erreur: "Aucun abonnement trouvé pour ce compte" });
      return;
    }

    try {
      const sessionPortail = await stripe.billingPortal.sessions.create({
        customer: abonnement.stripe_customer_id,
        return_url: `${origin}/mon-compte.html`,
      });
      res.status(200).json({ url: sessionPortail.url });
    } catch (e) {
      console.error("create-checkout (portal) erreur Stripe:", e.message);
      res.status(502).json({ erreur: "Erreur Stripe", detail: e.message });
    }
    return;
  }

  // Abonnement récurrent Portalis.
  if (corps.mode === "subscription") {
    const supabaseUserId = typeof corps.supabaseUserId === "string" ? corps.supabaseUserId.trim() : "";
    const supabaseEmail = typeof corps.supabaseEmail === "string" ? corps.supabaseEmail.trim() : "";
    if (!supabaseUserId || !supabaseEmail) { res.status(400).json({ erreur: "Compte manquant" }); return; }

    // Réutilise le customer Stripe existant si l'utilisateur a déjà été abonné,
    // pour éviter de créer un doublon à chaque nouvelle tentative d'abonnement.
    let customerExistant = null;
    try {
      const lignes = await selectionner(
        "abonnements",
        `user_id=eq.${encodeURIComponent(supabaseUserId)}&select=stripe_customer_id&limit=1`
      );
      if (lignes[0] && lignes[0].stripe_customer_id) customerExistant = lignes[0].stripe_customer_id;
    } catch (e) {
      console.error("create-checkout (subscription) erreur Supabase:", e.message);
      // Non bloquant : Stripe créera un nouveau customer par email si la lecture échoue.
    }

    const paramsAbo = {
      line_items: [{ price: PORTALIS_PRICE_ID, quantity: 1 }],
      mode: "subscription",
      // Portalis est un abonnement, hors périmètre de la remise post-achat.
      allow_promotion_codes: false,
      success_url: `${origin}/mon-compte.html?abonnement=ok`,
      cancel_url: `${origin}/mon-compte.html`,
      metadata: { supabase_user_id: supabaseUserId, attemptId, source: "site" },
      subscription_data: { metadata: { supabase_user_id: supabaseUserId } },
      branding_settings: {
        display_name: "Trajectoire Droit",
        icon: { type: "url", url: `${origin}/assets/logo-tjd-mark.png` },
        background_color: "#ffffff",
        button_color: "#1A2851",
        border_style: "rounded",
        font_family: "pt_serif",
      },
      integration_identifier: INTEGRATION_IDS.portalis,
    };
    if (customerExistant) {
      paramsAbo.customer = customerExistant;
    } else {
      paramsAbo.customer_email = supabaseEmail;
    }

    try {
      const sessionAbo = await stripe.checkout.sessions.create(
        paramsAbo,
        { idempotencyKey: `portalis-${attemptId}` }
      );
      res.status(200).json({ url: sessionAbo.url, sessionId: sessionAbo.id, attemptId });
    } catch (e) {
      console.error("create-checkout (subscription) erreur Stripe:", e.message);
      res.status(502).json({ erreur: "Erreur Stripe", detail: e.message });
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
  const pageActuelle = /^[a-z0-9/_-]+\.html(#[a-z0-9_-]+)?$/i.test(pageActuelleBrute) ? pageActuelleBrute : "";
  const utmSource = tronquer(corps.utm_source, 100);
  const utmMedium = tronquer(corps.utm_medium, 100);
  const utmCampaign = tronquer(corps.utm_campaign, 100);

  const produit = PRODUITS[produitId];
  if (!produit) {
    res.status(400).json({ erreur: "Produit inconnu" });
    return;
  }

  // Le stage de méthode est une session datée à 15 places, pas un PDF en stock illimité :
  // on compte les achats déjà enregistrés pour ne jamais vendre une place qui n'existe pas.
  const LIMITE_PLACES_STAGE = 15;
  if (produitId === "stage-methode") {
    try {
      const dejaInscrits = await selectionner("achats", `produit_ids=cs.${encodeURIComponent("{stage-methode}")}&select=id`);
      if (dejaInscrits.length >= LIMITE_PLACES_STAGE) {
        res.status(409).json({ erreur: "Stage complet", complet: true });
        return;
      }
    } catch (e) {
      console.error("create-checkout (stage) erreur vérification places:", e.message);
      // Non bloquant : une panne de lecture Supabase ne doit pas empêcher une vente légitime.
    }
  }

  const bump = bumpId && bumpId !== produitId ? PRODUITS[bumpId] : null;
  const idsAchetes = bump ? [produitId, bumpId] : [produitId];
  const pageSucces = produitId === "stage-methode" ? "merci-stage.html" : "merci-achat.html";

  const params = {
    // Pas de payment_method_types forcé : Stripe active les moyens de paiement
    // dynamiques du dashboard (carte, Link, Apple Pay, Google Pay, PayPal si activé),
    // essentiels pour des étudiants qui n'ont pas toujours de CB à leur nom.
    line_items: [{
      price_data: {
        currency: "eur",
        unit_amount: produit.prix,
        product_data: { name: produit.nom },
      },
      quantity: 1,
    }],
    mode: "payment",
    // La remise post-achat concerne les fiches et formations numériques. Le stage
    // reste exclu, car il correspond à une place limitée dans une session datée.
    allow_promotion_codes: produitId !== "stage-methode",
    // Stripe affiche une case facultative pour les communications promotionnelles
    // quand le contexte juridique du client l'exige. Le webhook ajoute ensuite à
    // la liste marketing Brevo uniquement les personnes qui ont donné cet accord.
    consent_collection: { promotions: "auto" },
    success_url: `${origin}/${pageSucces}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: pageActuelle ? `${origin}/${pageActuelle}` : `${origin}/formations.html`,
    // Expiration raccourcie à 2h (au lieu des 24h par défaut Stripe) pour que la
    // relance de panier abandonné (voir stripe-webhook.js, event checkout.session.expired)
    // puisse partir le jour même plutôt que le lendemain.
    expires_at: attemptTimestamp + 2 * 3600,
    metadata: {
      produitIds: idsAchetes.join(","),
      attemptId,
      source: "site",
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
        product_data: { name: bump.nom },
      },
      quantity: 1,
    });
  }

  try {
    const sessionCheckout = await stripe.checkout.sessions.create(
      params,
      { idempotencyKey: `checkout-${attemptId}` }
    );
    res.status(200).json({
      url: sessionCheckout.url,
      sessionId: sessionCheckout.id,
      attemptId,
      attemptCreatedAt: attemptTimestamp,
    });
  } catch (e) {
    console.error("create-checkout erreur Stripe:", e.message);
    res.status(502).json({ erreur: "Erreur Stripe", detail: e.message });
  }
}

module.exports = handler;
module.exports._test = { normaliserAttemptId, normaliserAttemptTimestamp };
