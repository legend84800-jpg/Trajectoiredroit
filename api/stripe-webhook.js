// Webhook Stripe : reçoit checkout.session.completed,
// génère des tokens de téléchargement HMAC et envoie l'email Brevo.
// Trace aussi les codes ambassadeurs utilisés dans les logs Vercel.
// Remonte aussi l'achat à l'API Conversions Meta (server-side, ne dépend pas
// des bloqueurs de pub), uniquement si le visiteur a accepté les cookies.
// Gère aussi les events d'abonnement Portalis (customer.subscription.*) et
// alimente l'historique d'achats consultable depuis mon-compte.html.

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { upsert, insererSiAbsent, supprimer } = require("./_supabase");
const { construireLiensTelechargement } = require("./_liens-telechargement");
const { creerClientStripe } = require("./_stripe");

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

// Liste Brevo des acheteurs qui ont accepté les communications promotionnelles.
// La réinscription contrôlée à cette liste ouvre ou redémarre la séquence
// post-achat à chaque nouveau paiement.
const BREVO_LISTE_CLIENTS = 7;
const COUPON_REMISE_POST_ACHAT = "remise-post-achat-15";

function formaterDateRemise(timestamp) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(timestamp * 1000));
}

// Chaque acheteur consentant reçoit un code personnel. Il est créé dès l'achat,
// puis l'email J+8 lui laisse encore sept jours pour l'utiliser.
async function creerRemisePostAchat(sessionId, stripe) {
  const expiresAt = Math.floor(Date.now() / 1000) + (15 * 24 * 60 * 60);
  const suffixe = crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 8).toUpperCase();
  const code = `POSTA-${suffixe}`;
  const params = {
    code,
    active: true,
    expires_at: expiresAt,
    max_redemptions: 1,
    promotion: { type: "coupon", coupon: COUPON_REMISE_POST_ACHAT },
    metadata: { campaign: "post-achat-brevo", checkout_session: sessionId },
  };

  try {
    const promotion = await stripe.promotionCodes.create(params, {
      idempotencyKey: `remise-${sessionId}`,
    });
    return { code: promotion.code, dateFin: formaterDateRemise(promotion.expires_at) };
  } catch (e) {
    if (e && e.code === "resource_already_exists") {
      const liste = await stripe.promotionCodes.list({ code, limit: 1 });
      const promo = liste.data && liste.data[0];
      if (promo) return { code: promo.code, dateFin: formaterDateRemise(promo.expires_at) };
    }
    throw e;
  }
}

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
async function creerContactBrevoAchat(email, produits, montantEuros, brevoKey, accordPromotionnel, remisePostAchat) {
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
  };

  if (remisePostAchat) {
    payload.attributes.CODE_REMISE_POST_ACHAT = remisePostAchat.code;
    payload.attributes.DATE_FIN_REMISE_POST_ACHAT = remisePostAchat.dateFin;
  }

  // L'adresse sert toujours à la livraison, à l'historique d'achat et au support.
  // Elle rejoint la liste marketing seulement après un accord explicite recueilli
  // par Stripe pendant le paiement.
  if (accordPromotionnel) payload.listIds = [BREVO_LISTE_CLIENTS];

  const resp = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": brevoKey, accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (resp.ok || resp.status === 204) return { estNouveau: resp.status === 201 };
  const detail = await resp.json().catch(() => ({}));
  if (detail && detail.code === "duplicate_parameter") return { estNouveau: false };
  throw new Error(`Brevo contacts ${resp.status}: ${JSON.stringify(detail)}`);
}

// Brevo ne déclenche pas une nouvelle entrée lorsqu'un contact déjà présent est
// seulement ajouté de nouveau à une liste. Pour un acheteur existant, on retire
// donc d'abord son inscription à la liste marketing, puis on la recrée : le
// consentement du contact et tous ses attributs restent inchangés.
async function reinscrireAcheteurBrevo(email, brevoKey) {
  const headers = { "content-type": "application/json", "api-key": brevoKey, accept: "application/json" };
  const retirer = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LISTE_CLIENTS}/contacts/remove`, {
    method: "POST",
    headers,
    body: JSON.stringify({ emails: [email] }),
  });
  if (!retirer.ok) throw new Error(`Brevo retrait liste ${retirer.status}: ${await retirer.text()}`);

  const ajouter = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LISTE_CLIENTS}/contacts/add`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": brevoKey, accept: "application/json" },
    body: JSON.stringify({ emails: [email] }),
  });
  if (!ajouter.ok) throw new Error(`Brevo ajout liste ${ajouter.status}: ${await ajouter.text()}`);
}

async function lireBodyBrut(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function construireLiensEmail(produitId, produit, secret, origin) {
  return construireLiensTelechargement(produitId, produit, secret, origin, 48 * 3600);
}

function uuidRelance(sessionId, etape) {
  const caracteres = crypto.createHash("sha256").update(`${sessionId}:${etape}`).digest("hex").slice(0, 32).split("");
  caracteres[12] = "4";
  caracteres[16] = ((parseInt(caracteres[16], 16) & 3) | 8).toString(16);
  return `${caracteres.slice(0, 8).join("")}-${caracteres.slice(8, 12).join("")}-${caracteres.slice(12, 16).join("")}-${caracteres.slice(16, 20).join("")}-${caracteres.slice(20).join("")}`;
}

function echapperHtml(texte) {
  return String(texte).replace(/[&<>"']/g, caractere => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[caractere]);
}

async function envoyerRelancePanier(email, produits, checkoutUrl, brevoKey, options) {
  const noms = produits.map(p => p.nom).join(" + ");
  const nomsHtml = echapperHtml(noms);
  const urlHtml = echapperHtml(checkoutUrl);
  const estH24 = options.etape === "h24";
  const titre = estH24 ? "Tu peux encore reprendre ton achat" : "Ton paiement est resté en attente";
  const explication = estH24
    ? `Tu avais commencé à commander <strong>${nomsHtml}</strong> hier, mais le paiement n'a pas été terminé. Le nouveau lien sécurisé reste disponible.`
    : `Tu avais commencé à commander <strong>${nomsHtml}</strong>, mais le paiement n'a pas été terminé. Un nouveau lien sécurisé est prêt.`;
  const bouton = estH24 ? "Reprendre mon achat" : "Reprendre mon paiement";

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
          <p style="font-size:18px;font-weight:700;color:#1a237e;margin:0 0 16px;">${titre}</p>
          <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 24px;">${explication}</p>
          <a href="${urlHtml}" style="display:inline-block;margin:8px 0;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">
            ${bouton}
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

  const texte = `${titre}\n\nTu avais commencé à commander ${noms}, mais le paiement n'a pas été terminé.\n\n${bouton}\n${checkoutUrl}\n\nUne question avant d'acheter ? Réponds directement à cet email.`;

  const payload = {
    sender: { name: "TrajectoireDroit", email: "contact@trajectoiredroit.com" },
    to: [{ email }],
    subject: estH24 ? "Tu peux encore reprendre ton achat" : `Ton paiement pour ${noms} est resté en attente`,
    htmlContent: html,
    textContent: texte,
    tags: ["relance-panier", `relance-panier-${options.etape}`],
    headers: { idempotencyKey: uuidRelance(options.sessionOrigine, options.etape) },
  };
  if (options.scheduledAt) payload.scheduledAt = options.scheduledAt;
  if (options.batchId) payload.batchId = options.batchId;

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

// Panier abandonné : la session expire à H+1. Stripe fournit son lien de
// récupération natif, puis le webhook envoie H+1 et programme H+24 dans Brevo.
async function gererPanierAbandonne(sessionEvenement, brevoKey, stripe, origin, operations = {}) {
  if (sessionEvenement.mode === "subscription") return { ignore: "abonnement" };
  const recuperer = operations.recuperer || (id => stripe.checkout.sessions.retrieve(id));
  const mettreAJour = operations.mettreAJour || ((id, params) => stripe.checkout.sessions.update(id, params));
  const envoyer = operations.envoyer || ((email, produits, url, options) => envoyerRelancePanier(email, produits, url, brevoKey, options));
  const session = await recuperer(sessionEvenement.id);
  const metadata = session.metadata || {};
  const produitIdsRaw = metadata.produitIds;
  const email = session.customer_details && session.customer_details.email;
  const checkoutUrl = session.after_expiration
    && session.after_expiration.recovery
    && session.after_expiration.recovery.url;
  const accordPromotionnel = session.consent && session.consent.promotions === "opt_in";
  const eligible = metadata.reminderPlan === "h1-h24-v1"
    && metadata.source === "site"
    && metadata.internalTest !== "1"
    && !session.recovered_from;
  if (!eligible || !produitIdsRaw || !email || !accordPromotionnel || !checkoutUrl) {
    console.log(`[PANIER ABANDONNÉ] ignoré, session=${session.id}`);
    return { ignore: "non-eligible" };
  }

  const produitIds = produitIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const produitsAbandonnes = produitIds.map(id => PRODUITS[id]).filter(Boolean);
  if (!produitsAbandonnes.length || produitsAbandonnes.length !== produitIds.length) {
    return { ignore: "produit-inconnu" };
  }

  if (metadata.rappelH1Status !== "sent") {
    await envoyer(email, produitsAbandonnes, checkoutUrl, {
      etape: "h1",
      sessionOrigine: session.id,
    });
    await mettreAJour(session.id, { metadata: { rappelH1Status: "sent" } });
  }

  const batchId = uuidRelance(session.id, "h24-batch");
  if (metadata.rappelH24Status !== "scheduled") {
    const dateH24 = new Date((session.created + 24 * 3600) * 1000).toISOString();
    await envoyer(email, produitsAbandonnes, checkoutUrl, {
      etape: "h24",
      sessionOrigine: session.id,
      scheduledAt: dateH24,
      batchId,
    });
    await mettreAJour(session.id, { metadata: { rappelH24Status: "scheduled", rappelH24BatchId: batchId } });
  }
  console.log(`[PANIER ABANDONNÉ] rappels préparés pour ${produitIds.join("+")}, session=${session.id}`);
  return { traite: true, batchId };
}

async function annulerRelancePlanifiee(sessionOrigine, brevoKey) {
  const batchId = uuidRelance(sessionOrigine, "h24-batch");
  const resp = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(batchId)}`, {
    method: "DELETE",
    headers: { "api-key": brevoKey, accept: "application/json" },
  });
  if (resp.ok || resp.status === 404) return;
  throw new Error(`Brevo annulation relance ${resp.status}`);
}

// Récupère le code textuel d'un promotion code Stripe (ex: "LYON3JULIE")
async function recupererCodePromo(promotionCodeId, stripe) {
  try {
    const promotion = await stripe.promotionCodes.retrieve(promotionCodeId);
    return promotion.code || null;
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
          <p style="font-size:13px;color:#777;margin:0 0 16px;">
            Enfin, si tu veux aussi apprendre le droit de manière plus ludique, tu peux me retrouver sur <a href="https://www.youtube.com/@TrajectoireDroit" style="color:#1a237e;">YouTube</a> et sur <a href="https://www.tiktok.com/@trajectoiredroit" style="color:#1a237e;">TikTok</a>.
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

  const texte = `Tu viens d'acheter ${nomsAchetes}, et tes PDF sont prêts.\n\nTélécharge-les ici :\n${liens.map(l => `${l.nom} : ${l.url}`).join("\n")}\n\nLiens valables 48 heures. Passé ce délai, connecte-toi à https://trajectoiredroit.com/mon-compte.html avec cette même adresse email pour régénérer un lien à tout moment : l'accès est à vie.\n\nSatisfait ou remboursé sous 7 jours. Si le contenu ne te convient pas, réponds à cet email, je te rembourse sans poser de questions.\n\nAu moindre problème, contacte-moi par mail à julien.prof1@gmail.com ou par WhatsApp au +33 6 05 41 85 21.\n\nMon but est de créer les meilleures fiches de droit en France, donc à la moindre remarque sur le fond ou sur la forme, n'hésite pas à me contacter. Je te renvoie la fiche améliorée, et si tes commentaires sont détaillés et pertinents, je t'offre une fiche de citations en cadeau.\n\nJ'ai mis un temps long à rédiger ces fiches, garde-les pour toi et ne les divulgue pas à autrui, merci.\n\nSi tu as un bon réseau dans ta promo, j'ai un programme ambassadeurs (https://trajectoiredroit.com/ambassadeurs.html) : 10 % de réduction pour chaque filleul, 20 % de commission pour toi.\n\nEnfin, si tu veux aussi apprendre le droit de manière plus ludique, tu peux me retrouver sur YouTube (https://www.youtube.com/@TrajectoireDroit) et sur TikTok (https://www.tiktok.com/@trajectoiredroit).\n\nJulien, TrajectoireDroit`;

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
    "Réponds simplement à cet email avec ton prénom, ton numéro WhatsApp si tu souhaites être contacté par ce moyen et la difficulté principale que tu veux travailler pendant le stage.",
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

// Notifie Julien d'une inscription payée au stage. Le formulaire avant paiement ne
// demande que l'email et le niveau. Le client peut répondre au mail de confirmation
// pour transmettre ensuite son prénom, son WhatsApp et sa difficulté principale.
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

function donneesAchat(session, email, produitIds, montantEuros, estRelance) {
  return {
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
  };
}

async function traiterAchatPaye(session, contexte) {
  if (session.mode === "subscription") return { ignore: "abonnement" };

  const produitIdsRaw = session.metadata && session.metadata.produitIds;
  const email = session.customer_details && session.customer_details.email;
  if (!produitIdsRaw || !email) {
    console.error(`produitIds ou email manquant, session=${session.id}`);
    return { ignore: "donnees-manquantes" };
  }

  const produitIds = produitIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const produitsAchetes = produitIds
    .map(id => ({ id, produit: PRODUITS[id] }))
    .filter(p => p.produit);
  if (!produitsAchetes.length) {
    console.error("Aucun produitId connu dans la session:", produitIdsRaw);
    return { ignore: "produit-inconnu" };
  }

  const montantEuros = session.amount_total != null ? (session.amount_total / 100).toFixed(2) : "?";
  const sessionOrigineRelance = session.recovered_from
    || (session.metadata && session.metadata.sessionOrigine)
    || null;
  const estRelance = !!sessionOrigineRelance || (session.metadata && session.metadata.relance === "1");
  const accordPromotionnel = session.consent && session.consent.promotions === "opt_in";
  const estStage = produitIds.includes("stage-methode");
  const libelleProduits = produitIds.join("+");

  const operations = contexte.operations || {
    insererSiAbsent,
    supprimer,
    envoyerEmail,
    envoyerConfirmationStage,
    notifierJulienStage,
    envoyerAchatMeta,
    creerRemisePostAchat,
    creerContactBrevoAchat,
    reinscrireAcheteurBrevo,
    recupererCodePromo,
    annulerRelancePlanifiee,
  };

  // La contrainte unique achats.session_id devient le verrou d'idempotence.
  // On réserve la session avant tout email. Un webhook rejoué s'arrête ici.
  const lignesCreees = await operations.insererSiAbsent(
    "achats",
    donneesAchat(session, email, produitIds, montantEuros, estRelance),
    "session_id"
  );
  if (!Array.isArray(lignesCreees) || lignesCreees.length === 0) {
    console.log(`[WEBHOOK DÉJÀ TRAITÉ] session=${session.id}`);
    return { dejaTraite: true };
  }

  if (estRelance && sessionOrigineRelance) {
    try {
      await operations.annulerRelancePlanifiee(sessionOrigineRelance, contexte.brevoKey);
    } catch (e) {
      console.error("Erreur annulation rappel H+24:", e.message);
    }
  }

  let codeAmbassadeur = null;
  const discounts = session.discounts || [];
  if (discounts.length > 0) {
    const promotionCodeId = typeof discounts[0].promotion_code === "string"
      ? discounts[0].promotion_code
      : discounts[0].promotion_code && discounts[0].promotion_code.id;
    if (promotionCodeId) {
      codeAmbassadeur = await operations.recupererCodePromo(promotionCodeId, contexte.stripe);
    }
  }

  // La livraison au client est la seule action critique après la réservation.
  // En cas d'échec, la réservation est supprimée et Stripe reçoit un code 500,
  // ce qui lui permet de rejouer le webhook sans créer de double livraison.
  try {
    if (estStage) {
      await operations.envoyerConfirmationStage(email, session.metadata, contexte.brevoKey);
    } else {
      let liens = [];
      produitsAchetes.forEach(({ id, produit }) => {
        liens = liens.concat(construireLiensEmail(id, produit, contexte.downloadSecret, contexte.origin));
      });
      await operations.envoyerEmail(
        email,
        produitsAchetes.map(p => p.produit),
        liens,
        contexte.brevoKey,
        codeAmbassadeur
      );
    }
  } catch (erreurLivraison) {
    try {
      await operations.supprimer("achats", `session_id=eq.${encodeURIComponent(session.id)}`);
    } catch (erreurAnnulation) {
      console.error("ÉCHEC CRITIQUE annulation verrou webhook:", erreurAnnulation.message);
    }
    throw erreurLivraison;
  }

  if (codeAmbassadeur) {
    console.log(`[AMBASSADEUR] code=${codeAmbassadeur} produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  } else if (estRelance) {
    console.log(`[VENTE-RELANCE] produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  } else {
    console.log(`[VENTE] produits=${libelleProduits} montant=${montantEuros}€ session=${session.id}`);
  }
  console.log(`Livraison confirmée pour ${libelleProduits}, session=${session.id}`);

  // Les actions suivantes enrichissent le suivi mais ne doivent jamais faire
  // rejouer une livraison réussie au client.
  if (estStage) {
    try {
      await operations.notifierJulienStage(session.metadata, email, montantEuros, session.id, contexte.brevoKey);
    } catch (e) {
      console.error("Erreur notification stage à Julien:", e.message);
    }
  }

  let remisePostAchat = null;
  if (accordPromotionnel && !estStage) {
    try {
      remisePostAchat = await operations.creerRemisePostAchat(session.id, contexte.stripe);
    } catch (e) {
      console.error("Erreur création remise post-achat:", e.message);
    }
  }

  if (session.metadata && session.metadata.consentMarketing === "1" && montantEuros !== "?") {
    try {
      await operations.envoyerAchatMeta({
        email,
        montantEuros,
        produitIds,
        sessionId: session.id,
        fbp: session.metadata.fbp,
        fbc: session.metadata.fbc,
      });
    } catch (e) {
      console.error("envoyerAchatMeta erreur:", e.message);
    }
  }

  let contactBrevo;
  try {
    contactBrevo = await operations.creerContactBrevoAchat(
      email,
      produitsAchetes.map(p => p.produit),
      montantEuros,
      contexte.brevoKey,
      accordPromotionnel,
      remisePostAchat
    );
  } catch (e) {
    console.error("Erreur création contact Brevo:", e.message);
  }

  if (accordPromotionnel && !estStage && remisePostAchat && contactBrevo && !contactBrevo.estNouveau) {
    try {
      await operations.reinscrireAcheteurBrevo(email, contexte.brevoKey);
    } catch (e) {
      console.error("Erreur réinscription Brevo post-achat:", e.message);
    }
  }

  return { traite: true };
}

async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const body = await lireBodyBrut(req);
  const sig = req.headers["stripe-signature"] || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const brevoKey = process.env.BREVO_API_KEY;
  const downloadSecret = process.env.DOWNLOAD_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const origin = "https://trajectoiredroit.com";

  if (!webhookSecret || !brevoKey || !downloadSecret || !stripeKey) {
    console.error("Variables d'environnement manquantes");
    res.status(500).end();
    return;
  }

  const stripe = creerClientStripe(stripeKey);
  let evt;
  try {
    evt = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    console.error("Signature Stripe invalide");
    res.status(400).json({ erreur: "Signature invalide" });
    return;
  }

  if (evt.type === "customer.subscription.created" || evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
    try {
      await synchroniserAbonnement(evt.data.object);
    } catch (e) {
      console.error("Erreur synchronisation abonnement Supabase:", e.message);
      res.status(500).json({ erreur: "Synchronisation impossible" });
      return;
    }
    res.status(200).json({ recu: true });
    return;
  }

  if (evt.type === "checkout.session.expired") {
    try {
      await gererPanierAbandonne(evt.data.object, brevoKey, stripe, origin);
    } catch (e) {
      console.error("Erreur relance panier abandonné:", e.message);
      res.status(500).json({ erreur: "Relance temporairement impossible" });
      return;
    }
    res.status(200).json({ recu: true });
    return;
  }

  if (evt.type === "checkout.session.async_payment_failed") {
    console.warn(`[PAIEMENT ASYNCHRONE ÉCHOUÉ] session=${evt.data.object.id}`);
    res.status(200).json({ recu: true });
    return;
  }

  const estEvenementPaiement = evt.type === "checkout.session.completed"
    || evt.type === "checkout.session.async_payment_succeeded";
  if (!estEvenementPaiement) {
    res.status(200).json({ recu: true });
    return;
  }

  const session = evt.data.object;
  if (evt.type === "checkout.session.completed" && session.payment_status !== "paid") {
    console.log(`[PAIEMENT EN ATTENTE] session=${session.id}`);
    res.status(200).json({ recu: true });
    return;
  }

  try {
    await traiterAchatPaye(session, {
      brevoKey,
      downloadSecret,
      stripe,
      origin,
    });
  } catch (e) {
    console.error("Erreur critique livraison achat:", e.message);
    res.status(500).json({ erreur: "Livraison temporairement impossible" });
    return;
  }

  res.status(200).json({ recu: true });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
module.exports._test = {
  traiterAchatPaye,
  donneesAchat,
  gererPanierAbandonne,
  uuidRelance,
  creerRemisePostAchat,
};
