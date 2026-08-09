// Webhook Stripe : reçoit checkout.session.completed,
// génère des tokens de téléchargement HMAC et envoie l'email Brevo.
// Trace aussi les codes ambassadeurs utilisés dans les logs Vercel.
// Remonte aussi l'achat à l'API Conversions Meta (server-side, ne dépend pas
// des bloqueurs de pub), uniquement si le visiteur a accepté les cookies.
// Gère aussi les events d'abonnement Portalis (customer.subscription.*) et
// alimente l'historique d'achats consultable depuis mon-compte.html.

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { upsert, inserer } = require("./_supabase");
const { construireLiensTelechargement } = require("./_liens-telechargement");

// Traduit le statut Stripe en statut simplifié stocké côté Supabase.
function statutAbonnement(statutStripe) {
  if (statutStripe === "active" || statutStripe === "trialing") return "actif";
  if (statutStripe === "past_due" || statutStripe === "unpaid") return "impaye";
  return "annule";
}

async function synchroniserAbonnement(subscription) {
  const userId = subscription.metadata && subscription.metadata.supabase_user_id;
  if (!userId) return; // Abonnement créé hors de ce flux (ex: test manuel Stripe) : on ignore.
  const periodeFin = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  await upsert("abonnements", {
    user_id: userId,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    statut: statutAbonnement(subscription.status),
    periode_fin: periodeFin,
  }, "user_id");
}

const META_PIXEL_ID = "1736839687358457";

async function envoyerAchatMeta({ email, montantEuros, produitIds, sessionId, fbp, fbc }) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return;

  const emHash = crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const userData = { em: [emHash] };
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const payload = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: sessionId, // identique au eventID envoyé par le pixel côté client, pour la déduplication Meta
      action_source: "website",
      event_source_url: "https://trajectoiredroit.com/merci-achat.html",
      user_data: userData,
      custom_data: {
        currency: "EUR",
        value: Number(montantEuros),
        content_ids: produitIds,
        content_type: "product",
      },
    }],
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error("Meta CAPI erreur:", await resp.text());
    }
  } catch (e) {
    console.error("Meta CAPI fetch erreur:", e.message);
  }
}

// Liste Brevo "Clients TJD (acheteurs)", créée pour segmenter les acheteurs et
// pouvoir leur envoyer une séquence post-achat (relance J+3, demande d'avis J+7).
const BREVO_LISTE_CLIENTS = 6;

// Le nom d'un produit suit toujours "Famille Matière [Semestre]" (ex: "Fiche complète
// Droit administratif L2 S1") : on retire juste le préfixe de famille pour ne garder
// que la matière, affichée dans Brevo pour cibler une campagne par matière.
function deduireMatiere(nomProduit) {
  return nomProduit
    .replace(/^(Fiche complète|Cours complet|Majeures préparées|Fiches d'arrêt|Fiche de citations|Flashcards \+ QCM|Commentaires d'arrêt|Cas pratiques corrigés|Dissertations corrigées|Pack)\s*/i, "")
    .replace(/\s*\(.*$/, "")
    .replace(/\s*complet$/i, "")
    .trim();
}

// Crée ou met à jour le contact acheteur dans Brevo, avec ses derniers achats en
// attributs et un ajout à la liste Clients, pour ouvrir la porte à une séquence
// post-achat (relance J+3, demande d'avis J+7) sans dépendre du formulaire lead magnet.
async function creerContactBrevoAchat(email, produits, montantEuros, brevoKey) {
  const noms = produits.map((p) => p.nom).join(" + ");
  const matiere = produits.length ? deduireMatiere(produits[0].nom) : "";

  const payload = {
    email,
    updateEnabled: true,
    attributes: {
      DERNIER_ACHAT: noms,
      MATIERE_ACHETEE: matiere,
      MONTANT_DERNIER_ACHAT: montantEuros !== "?" ? Number(montantEuros) : undefined,
      DATE_DERNIER_ACHAT: new Date().toISOString().slice(0, 10),
    },
    listIds: [BREVO_LISTE_CLIENTS],
  };

  const resp = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": brevoKey, accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (resp.ok || resp.status === 204) return;
  const detail = await resp.json().catch(() => ({}));
  if (detail && detail.code === "duplicate_parameter") return;
  throw new Error(`Brevo contacts ${resp.status}: ${JSON.stringify(detail)}`);
}

module.exports.config = { api: { bodyParser: false } };

async function lireBodyBrut(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifierSignatureStripe(body, header, secret) {
  if (!header) return false;
  const parties = {};
  header.split(",").forEach(p => {
    const [k, v] = p.split("=");
    if (k && v) parties[k] = v;
  });
  const t = parties["t"];
  const v1 = parties["v1"];
  if (!t || !v1) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(t, 10)) > 300) return false;
  const payload = `${t}.${body.toString("utf-8")}`;
  const attendu = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(attendu, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

function construireLiensEmail(produitId, produit, secret, origin) {
  return construireLiensTelechargement(produitId, produit, secret, origin, 48 * 3600);
}

// Recrée une session Checkout identique (mêmes produits, même montant) pour la
// relance de panier abandonné, puisque l'URL d'une session expirée n'est plus
// utilisable et que Stripe ne permet pas de "réouvrir" une session existante.
async function recreerLienCheckout(produitIds, origin, stripeKey) {
  const params = new URLSearchParams({
    // Pas de payment_method_types forcé, même raison que create-checkout.js :
    // laisser Stripe proposer tous les moyens actifs du dashboard.
    mode: "payment",
    allow_promotion_codes: "true",
    success_url: `${origin}/merci-achat.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/formations.html`,
    "metadata[produitIds]": produitIds.join(","),
    // Marque cette vente comme issue de la relance de panier abandonné, pour
    // savoir si le mécanisme rapporte (voir le log [VENTE-RELANCE] plus bas).
    "metadata[relance]": "1",
    "payment_intent_data[metadata][produitIds]": produitIds.join(","),
    "branding_settings[display_name]": "Trajectoire Droit",
    "branding_settings[icon][type]": "url",
    "branding_settings[icon][url]": `${origin}/assets/logo-tjd-mark.png`,
    "branding_settings[background_color]": "#ffffff",
    "branding_settings[button_color]": "#1A2851",
    "branding_settings[border_style]": "rounded",
    "branding_settings[font_family]": "pt_serif",
  });
  produitIds.forEach((id, i) => {
    const p = PRODUITS[id];
    params.set(`line_items[${i}][price_data][currency]`, "eur");
    params.set(`line_items[${i}][price_data][unit_amount]`, String(p.prix));
    params.set(`line_items[${i}][price_data][product_data][name]`, p.nom);
    params.set(`line_items[${i}][quantity]`, "1");
  });

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Stripe erreur (relance panier): ${JSON.stringify(data.error)}`);
  return data.url;
}

async function envoyerRelancePanier(email, produits, checkoutUrl, brevoKey) {
  const noms = produits.map(p => p.nom).join(" + ");

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a237e;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">TrajectoireDroit</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:18px;font-weight:700;color:#1a237e;margin:0 0 16px;">Il te manque juste le paiement</p>
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Tu as commencé un achat sur TrajectoireDroit (<strong>${noms}</strong>) sans aller jusqu'au bout. Le lien ci-dessous te ramène directement à l'étape de paiement, rien à ressaisir.
          </p>
          <a href="${checkoutUrl}" style="display:inline-block;margin:8px 0;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">
            Finaliser mon achat
          </a>
          <p style="font-size:13px;color:#777;margin:24px 0 0;">
            Une question avant d'acheter ? Réponds directement à cet email.
          </p>
        </td></tr>
        <tr><td style="background:#f0f0f0;padding:16px 32px;">
          <p style="font-size:12px;color:#999;margin:0;">TrajectoireDroit, la référence francophone en droit</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texte = `Tu as commencé un achat sur TrajectoireDroit (${noms}) sans aller jusqu'au bout.\n\nFinalise ton achat ici :\n${checkoutUrl}`;

  const payload = {
    sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
    to: [{ email }],
    subject: `Il te manque juste le paiement (${noms})`,
    htmlContent: html,
    textContent: texte,
  };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${err}`);
  }
}

// Panier abandonné : la session a expiré (2h, voir create-checkout.js) sans paiement.
// On ne peut relancer que si Stripe a capté l'email avant l'abandon (le client a
// eu le temps de le taper dans le formulaire Checkout), sinon rien n'est faisable.
async function gererPanierAbandonne(session, brevoKey, stripeKey, origin) {
  if (session.mode === "subscription") return; // Portalis, pas concerné par cette relance.

  const produitIdsRaw = session.metadata && session.metadata.produitIds;
  const email = session.customer_details && session.customer_details.email;

  if (!produitIdsRaw || !email) {
    console.log(`[PANIER ABANDONNÉ] non relançable (email ou produit manquant), session=${session.id}`);
    return;
  }

  const produitIds = produitIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const produitsAbandonnes = produitIds.map(id => PRODUITS[id]).filter(Boolean);
  if (!produitsAbandonnes.length) return;

  const checkoutUrl = await recreerLienCheckout(produitIds, origin, stripeKey);
  await envoyerRelancePanier(email, produitsAbandonnes, checkoutUrl, brevoKey);
  console.log(`[PANIER ABANDONNÉ] relance envoyée à ${email} pour ${produitIds.join("+")}, session expirée=${session.id}`);
}

// Récupère le code textuel d'un promotion code Stripe (ex: "LYON3JULIE")
async function recupererCodePromo(promotionCodeId, stripeKey) {
  try {
    const resp = await fetch(`https://api.stripe.com/v1/promotion_codes/${promotionCodeId}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.code || null;
  } catch {
    return null;
  }
}

async function envoyerEmail(email, produits, liens, brevoKey, codeAmbassadeur) {
  const nomsAchetes = produits.map(p => p.nom).join(" + ");

  const boutons = liens.map(l =>
    `<a href="${l.url}" style="display:inline-block;margin:8px 0;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">
      Télécharger ${l.nom}
    </a><br>`
  ).join("\n");

  const ligneCodePromo = codeAmbassadeur
    ? `<p style="font-size:13px;color:#555;margin:0 0 16px;">Réduction appliquée avec le code <strong>${codeAmbassadeur}</strong>.</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a237e;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">TrajectoireDroit</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:18px;font-weight:700;color:#1a237e;margin:0 0 16px;">Ton achat est confirmé !</p>
          <p style="font-size:15px;color:#333;margin:0 0 8px;">
            Tu viens d'acheter <strong>${nomsAchetes}</strong>, et tes PDF sont prêts juste en dessous.
          </p>
          ${ligneCodePromo}
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            Clique sur les liens pour les télécharger. Ils restent valables 48 heures, donc mieux vaut les enregistrer sur ton ordinateur ou ton téléphone tout de suite.
          </p>
          ${boutons}
          <p style="font-size:13px;color:#777;margin:24px 0 16px;">
            Passé ce délai de 48 heures, pas besoin de m'écrire pour les récupérer : connecte-toi à <a href="https://trajectoiredroit.com/mon-compte.html" style="color:#1a237e;">ton espace Mon compte</a> avec cette même adresse email, tu retrouves tous tes achats et tu régénères un lien de téléchargement à tout moment. L'accès est à vie.
          </p>
          <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
            <p style="font-size:13px;color:#065F46;margin:0;">Satisfait ou remboursé sous 7 jours. Si le contenu ne te convient pas, réponds à cet email, je te rembourse sans poser de questions.</p>
          </div>
          <p style="font-size:13px;color:#777;margin:0 0 16px;">
            Au moindre problème n'hésite pas à me contacter par mail, à l'adresse suivante julien.prof1@gmail.com, ou par WhatsApp au numéro suivant +33 6 05 41 85 21.
          </p>
          <p style="font-size:13px;color:#777;margin:0 0 16px;">
            En outre, mon but est de créer les meilleures fiches de droit en France. Par conséquent, je m'efforce de constamment les améliorer.
          </p>
          <p style="font-size:13px;color:#777;margin:0 0 16px;">
            Ainsi, à la moindre remarque, que ce soit sur le fond (exemple : pas assez développé pour toi, ou au contraire trop, il manque des exemples etc.) ou sur la forme (pas assez pédagogue, trop développé, pas assez de couleur, etc.) n'hésite pas à me contacter.
          </p>
          <p style="font-size:13px;color:#777;margin:0 0 16px;">
            En échange, je te renvoie la nouvelle fiche améliorée par mes soins, et si tes commentaires sont réellement détaillés et pertinents, je t'offre une « fiche de citations » en cadeau, très utile pour tes commentaires et dissertations.
          </p>
          <p style="font-size:13px;color:#777;margin:0 0 16px;">
            Dernière chose, j'ai mis un temps long à rédiger ces fiches. Donc je te fais confiance, garde ces fiches pour toi et ne les divulgue pas à autrui, je t'en remercie.
          </p>
          <p style="font-size:13px;color:#777;margin:0 0 16px;">
            Si tu as un bon réseau dans ta promo et que tu recommandes déjà mes fiches autour de toi, j'ai un <a href="https://trajectoiredroit.com/ambassadeurs.html" style="color:#1a237e;">programme ambassadeurs</a>, 10 % de réduction pour chaque filleul, 20 % de commission pour toi sur chaque vente.
          </p>
          <p style="font-size:15px;color:#1a237e;font-weight:700;margin:0;">Julien</p>
        </td></tr>
        <tr><td style="background:#f0f0f0;padding:16px 32px;">
          <p style="font-size:12px;color:#999;margin:0;">TrajectoireDroit, la référence francophone en droit</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texte = `Tu viens d'acheter ${nomsAchetes}, et tes PDF sont prêts.\n\nTélécharge-les ici :\n${liens.map(l => `${l.nom} : ${l.url}`).join("\n")}\n\nLiens valables 48 heures. Passé ce délai, connecte-toi à https://trajectoiredroit.com/mon-compte.html avec cette même adresse email pour régénérer un lien à tout moment : l'accès est à vie.\n\nSatisfait ou remboursé sous 7 jours. Si le contenu ne te convient pas, réponds à cet email, je te rembourse sans poser de questions.\n\nAu moindre problème, contacte-moi par mail à julien.prof1@gmail.com ou par WhatsApp au +33 6 05 41 85 21.\n\nMon but est de créer les meilleures fiches de droit en France, donc à la moindre remarque sur le fond ou sur la forme, n'hésite pas à me contacter. Je te renvoie la fiche améliorée, et si tes commentaires sont détaillés et pertinents, je t'offre une fiche de citations en cadeau.\n\nJ'ai mis un temps long à rédiger ces fiches, garde-les pour toi et ne les divulgue pas à autrui, merci.\n\nSi tu as un bon réseau dans ta promo, j'ai un programme ambassadeurs (https://trajectoiredroit.com/ambassadeurs.html) : 10 % de réduction pour chaque filleul, 20 % de commission pour toi.\n\nJulien, TrajectoireDroit`;

  const payload = {
    sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
    to: [{ email }],
    subject: `Ton achat : ${nomsAchetes}`,
    htmlContent: html,
    textContent: texte,
  };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${err}`);
  }
}

// Confirmation envoyée au client qui vient de payer le stage de méthode : reprend le
// mail que Julien envoyait déjà lui-même aux inscrits (routine-stage/routine_stage.py,
// GABARIT_MAIL, validé au filtre redaction-julien), avec le bloc paiement retiré
// puisque le paiement est désormais fait avant l'envoi, plus après coup sur un délai.
async function envoyerConfirmationStage(email, metadata, brevoKey) {
  const nomComplet = ((metadata && metadata.nom) || "").trim();
  const prenom = nomComplet ? nomComplet.split(/\s+/)[0] : "";
  const salutation = prenom ? `Bonjour ${prenom},` : "Bonjour,";

  const paragraphes = [
    salutation,
    "Ton inscription au stage est bien enregistrée. Ton paiement de 149 € a bien été reçu.",
    "Pour rappel, voici le contenu du stage :",
    "Le stage comprend trois séances en direct, pour un total de huit heures, consacrées aux quatre principaux exercices juridiques : la fiche d'arrêt, le commentaire d'arrêt, le cas pratique et la dissertation.",
    "La première séance aura lieu le mardi 8 septembre, de 16 h à 19 h. Nous travaillerons la structure complète de la fiche d'arrêt, notamment la différence entre un arrêt de rejet et un arrêt de cassation, puis la méthode du commentaire d'arrêt : introduction, construction du plan et rédaction des sous-parties.",
    "La deuxième séance se déroulera le mercredi 9 septembre, de 16 h à 19 h. Nous corrigerons un commentaire d'arrêt de A à Z, puis nous travaillerons la méthode du cas pratique : construction précise de la majeure, application de chaque condition aux faits et rédaction de la solution.",
    "Enfin, la troisième séance aura lieu le jeudi 10 septembre, de 16 h à 18 h. Nous commencerons par la correction complète d'un cas pratique, puis nous étudierons la méthode de la dissertation juridique : recherche du plan, construction de la problématique et rédaction de l'introduction.",
    "Plusieurs supports seront également offerts pendant le stage, notamment des fiches de citations, des formulations types, un corrigé intégralement rédigé et une majeure préparée.",
    "Le stage se déroulera entièrement en ligne, sur Google Meet. Le lien de connexion ainsi que toutes les informations pratiques te seront envoyés avant le début du stage.",
    "Si tu as la moindre question concernant le contenu ou l'organisation du stage, tu peux me contacter :",
    "📧 julien.prof1@gmail.com<br>📱 WhatsApp : +33 6 05 41 85 21",
    "À bientôt,",
  ];

  const corpsHtml = paragraphes
    .map((p) => `<p style="font-size:15px;color:#333;margin:0 0 16px;">${p}</p>`)
    .join("\n          ");

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a237e;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">TrajectoireDroit</p>
        </td></tr>
        <tr><td style="padding:32px;">
          ${corpsHtml}
          <p style="font-size:15px;color:#1a237e;font-weight:700;margin:0;">Julien<br>Trajectoire Droit</p>
        </td></tr>
        <tr><td style="background:#f0f0f0;padding:16px 32px;">
          <p style="font-size:12px;color:#999;margin:0;">TrajectoireDroit, la référence francophone en droit</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texte = `${paragraphes.join("\n\n").replace(/<br>/g, "\n")}\n\nJulien\nTrajectoire Droit`;

  const payload = {
    sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
    to: [{ email }],
    subject: "Stage TrajectoireDroit, confirmation",
    htmlContent: html,
    textContent: texte,
  };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": brevoKey },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${err}`);
  }
}

// Notifie Julien d'une inscription payée au stage, avec les infos du formulaire
// (nom, whatsapp, niveau, message) transmises en metadata Stripe par create-checkout.js.
// Remplace la notification que faisait l'ancien endpoint /api/contact avant paiement.
async function notifierJulienStage(metadata, email, montantEuros, sessionId, brevoKey) {
  const m = metadata || {};
  const rows = [
    ["Nom", m.nom || "(non renseigné)"],
    ["Email", `<a href="mailto:${email}">${email}</a>`],
    ["WhatsApp", m.whatsapp || "(non renseigné)"],
    ["Niveau", m.niveau || "(non renseigné)"],
    ["Montant payé", `${montantEuros} €`],
    ["Message", (m.message || "(aucun message)").replace(/\n/g, "<br>")],
  ];

  const payload = {
    sender: { name: "TrajectoireDroit", email: "julien.prof1@gmail.com" },
    to: [{ email: "julien.prof1@gmail.com", name: "Julien" }],
    replyTo: { email, name: m.nom || email },
    subject: `Nouvelle inscription payée, stage de méthode (${m.nom || email})`,
    htmlContent: `
      <h2>Nouvelle inscription payée au stage de méthode</h2>
      <table style="border-collapse:collapse; width:100%; max-width:600px">
        ${rows.map(([label, value], i) => `<tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4${i === rows.length - 1 ? "; vertical-align:top" : ""}">${label}</td><td style="padding:8px 12px">${value}</td></tr>`).join("\n        ")}
      </table>
      <p style="font-size:12px; color:#999; margin-top:16px">Session Stripe : ${sessionId}</p>
    `,
  };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": brevoKey, accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${err}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const body = await lireBodyBrut(req);
  const sig = req.headers["stripe-signature"] || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const brevoKey = process.env.BREVO_API_KEY;
  const downloadSecret = process.env.DOWNLOAD_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const origin = "https://trajectoiredroit.com";

  if (!webhookSecret || !brevoKey || !downloadSecret) {
    console.error("Variables d'environnement manquantes");
    res.status(500).end();
    return;
  }

  if (!verifierSignatureStripe(body, sig, webhookSecret)) {
    console.error("Signature Stripe invalide");
    res.status(400).json({ erreur: "Signature invalide" });
    return;
  }

  let evt;
  try { evt = JSON.parse(body.toString("utf-8")); } catch { res.status(400).end(); return; }

  if (evt.type === "customer.subscription.created" || evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
    try {
      await synchroniserAbonnement(evt.data.object);
    } catch (e) {
      console.error("Erreur synchronisation abonnement Supabase:", e.message);
    }
    res.status(200).json({ recu: true });
    return;
  }

  if (evt.type === "checkout.session.expired") {
    try {
      await gererPanierAbandonne(evt.data.object, brevoKey, stripeKey, origin);
    } catch (e) {
      console.error("Erreur relance panier abandonné:", e.message);
    }
    res.status(200).json({ recu: true });
    return;
  }

  if (evt.type !== "checkout.session.completed") {
    res.status(200).json({ recu: true });
    return;
  }

  const session = evt.data.object;

  // L'abonnement Portalis est traité par customer.subscription.created ci-dessus,
  // qui contient déjà toutes les informations nécessaires (customer, statut, période).
  if (session.mode === "subscription") {
    res.status(200).json({ recu: true });
    return;
  }

  const produitIdsRaw = session.metadata && session.metadata.produitIds;
  const email = session.customer_details && session.customer_details.email;

  if (!produitIdsRaw || !email) {
    console.error("produitIds ou email manquant dans la session:", JSON.stringify(session));
    res.status(200).json({ recu: true });
    return;
  }

  const produitIds = produitIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const produitsAchetes = produitIds
    .map(id => ({ id, produit: PRODUITS[id] }))
    .filter(p => p.produit);

  if (!produitsAchetes.length) {
    console.error("Aucun produitId connu dans la session:", produitIdsRaw);
    res.status(200).json({ recu: true });
    return;
  }

  // Détecter un code ambassadeur utilisé
  let codeAmbassadeur = null;
  const discounts = session.discounts || [];
  if (discounts.length > 0 && stripeKey) {
    const promotionCodeId =
      typeof discounts[0].promotion_code === "string"
        ? discounts[0].promotion_code
        : discounts[0].promotion_code?.id || null;
    if (promotionCodeId) {
      codeAmbassadeur = await recupererCodePromo(promotionCodeId, stripeKey);
    }
  }

  const montantEuros = session.amount_total != null ? (session.amount_total / 100).toFixed(2) : "?";
  const estRelance = session.metadata && session.metadata.relance === "1";

  const libelleProduits = produitIds.join("+");
  if (codeAmbassadeur) {
    console.log(`[AMBASSADEUR] code=${codeAmbassadeur} produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  } else if (estRelance) {
    console.log(`[VENTE-RELANCE] produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  } else {
    console.log(`[VENTE] produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  }

  const estStage = produitIds.includes("stage-methode");

  if (session.metadata && session.metadata.consentMarketing === "1" && montantEuros !== "?") {
    envoyerAchatMeta({
      email,
      montantEuros,
      produitIds,
      sessionId: session.id,
      fbp: session.metadata.fbp,
      fbc: session.metadata.fbc,
    }).catch(e => console.error("envoyerAchatMeta erreur:", e.message));
  }

  if (estStage) {
    // Session datée, pas de PDF : confirmation d'inscription au client + notification
    // à Julien avec les infos du formulaire, au lieu des liens de téléchargement.
    try {
      await envoyerConfirmationStage(email, session.metadata, brevoKey);
      await notifierJulienStage(session.metadata, email, montantEuros, session.id, brevoKey);
      console.log(`Confirmation stage envoyée à ${email}, Julien notifié`);
    } catch (e) {
      console.error("Erreur envoi email stage:", e.message);
    }
  } else {
    let liens = [];
    produitsAchetes.forEach(({ id, produit }) => {
      liens = liens.concat(construireLiensEmail(id, produit, downloadSecret, origin));
    });
    try {
      await envoyerEmail(email, produitsAchetes.map(p => p.produit), liens, brevoKey, codeAmbassadeur);
      console.log(`Email envoyé à ${email} pour ${libelleProduits}${codeAmbassadeur ? " (code " + codeAmbassadeur + ")" : ""}`);
    } catch (e) {
      console.error("Erreur envoi email:", e.message);
    }
  }

  try {
    await creerContactBrevoAchat(email, produitsAchetes.map(p => p.produit), montantEuros, brevoKey);
  } catch (e) {
    console.error("Erreur création contact Brevo:", e.message);
  }

  try {
    await inserer("achats", {
      email,
      produit_ids: produitIds,
      session_id: session.id,
      montant: montantEuros !== "?" ? Number(montantEuros) : null,
      landing_page: (session.metadata && session.metadata.landingPage) || null,
      referrer: (session.metadata && session.metadata.referrer) || null,
      utm_source: (session.metadata && session.metadata.utmSource) || null,
      utm_medium: (session.metadata && session.metadata.utmMedium) || null,
      utm_campaign: (session.metadata && session.metadata.utmCampaign) || null,
      relance: !!estRelance,
    });
  } catch (e) {
    console.error("Erreur écriture achat Supabase:", e.message);
  }

  res.status(200).json({ recu: true });
};
