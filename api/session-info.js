// Renvoie le montant, la devise et les produits d'une session Stripe Checkout
// terminée, pour permettre à merci-achat.html d'envoyer l'évènement Purchase
// au pixel Meta ET à GA4/Matomo avec la vraie valeur de la commande (le
// success_url ne porte que le session_id). Renvoie aussi les suggestions de
// compléments et, depuis le 14/10/2026, le code de remise personnel de 15 %.
//
// GET  /api/session-info?session_id=cs_xxx   état du paiement, puis liens si confirmé
// GET  /api/session-info?session_id=cs_xxx&vue=confirmation   confirmation sans attendre la remise
// GET  /api/session-info?session_id=cs_xxx&vue=remise   remise seule après confirmation
// GET  /api/session-info?ids=id1,id2          suggestions seules (complements.html),
//                                             aucune donnée personnelle
// POST /api/session-info { session_id, action: "emails" }
//      l'acheteur accepte les emails depuis la page de remerciement : il rejoint
//      la liste des clients Brevo, ce qui ouvre la séquence après achat.

const { suggererComplements, detailComplement } = require("./_suggestions-post-achat");
const { creerClientStripe } = require("./_stripe");
const { construireLiensTelechargement } = require("./_liens-telechargement");

const NOMBRE_SUGGESTIONS = 4;
const ID_PRODUIT_VALIDE = /^[a-z0-9-]{2,80}$/;

function modeDepuisCle(cle) {
  const correspondance = typeof cle === "string" && cle.match(/^[sr]k_(live|test)_/);
  return correspondance ? correspondance[1] : null;
}

function sessionCompatibleAvecCle(sessionId, cle) {
  const correspondance = typeof sessionId === "string" && sessionId.match(/^cs_(live|test)_[A-Za-z0-9]+$/);
  if (!correspondance) return false;
  const modeCle = modeDepuisCle(cle);
  return !modeCle || correspondance[1] === modeCle;
}

function etatPaiementNonConfirme(session, paiement) {
  const statutPaiement = paiement?.status;
  if (session.status === "expired") return "expire";
  if (statutPaiement === "canceled") return "annule";
  if (statutPaiement === "requires_payment_method" && paiement.last_payment_error) return "echec";
  if (statutPaiement === "processing") return "en_attente";
  if (session.status === "open") return "a_terminer";
  return "indisponible";
}

function lireCorps(req) {
  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  return corps && typeof corps === "object" ? corps : {};
}

function estTestInterne(data) {
  return data.livemode === false
    || !!(data.metadata && (data.metadata.internalTest === "1" || data.metadata.source === "test_interne"));
}

function produitIdsDe(data) {
  return (data.metadata && data.metadata.produitIds)
    ? data.metadata.produitIds.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
}

// Le code de 15 % concerne chaque achat payant, hors stage, pack offert et test interne.
function remiseApplicable(data, produitIds) {
  return !estTestInterne(data)
    && !(data.metadata && data.metadata.cadeauEmail)
    && !produitIds.includes("stage-methode")
    && Number(data.amount_total) > 0;
}

// Depuis le 02/11/2026, la page de remerciement affiche aussi les boutons de
// téléchargement. Deux acheteurs n'avaient rien reçu : un mail classé en
// indésirables chez iCloud, et un autre refusé par un serveur qui bloquait l'IP
// partagée de Brevo. Mêmes liens signés que l'email, valables 2 heures.
const DUREE_LIENS_PAGE_SECONDES = 2 * 3600;

function groupesPageRemerciement(data, produitIds, inclureFormatAnki) {
  const secret = process.env.DOWNLOAD_SECRET;
  if (!secret || (data.metadata && data.metadata.cadeauEmail)) return [];
  const PRODUITS = require("./_produits");
  const groupes = [];
  for (const produitId of new Set(produitIds)) {
    const produit = PRODUITS[produitId];
    if (!produit || produitId === "stage-methode" || !Array.isArray(produit.blobs) || !produit.blobs.length) continue;
    if ((Array.isArray(produit.inclus) && Array.isArray(produit.blobsMeta)) || produit.mediaEnLigne) continue;
    const liens = construireLiensTelechargement(
      produitId, produit, secret, "https://trajectoiredroit.com", DUREE_LIENS_PAGE_SECONDES, { sessionId: data.id }
    ).map(({ nom, url, type, format }) => ({
      nom, url, type,
      ...(inclureFormatAnki && format === "apkg" ? { format } : {}),
    }));
    groupes.push({ produitId, nom: produit.nom, liens });
  }
  return groupes;
}

async function lireOuCreerRemise(data, produitIds, stripe) {
  if (!remiseApplicable(data, produitIds)) return null;
  let module;
  try { module = require("./_remise-post-achat"); } catch { return null; }
  if (!module || typeof module.creerRemisePostAchat !== "function") return null;
  try {
    return await module.creerRemisePostAchat(data.id, stripe);
  } catch (e) {
    console.error("session-info remise indisponible:", e && e.code ? e.code : "erreur inconnue");
    return null;
  }
}

function remisePourNavigateur(remise) {
  return remise
    ? { code: remise.code, dateFin: remise.dateFin, expireLe: remise.expireLe, pourcentage: remise.pourcentage }
    : null;
}

function outilsWebhook() {
  try {
    const webhook = require("./stripe-webhook");
    return webhook && webhook.partage ? webhook.partage : null;
  } catch {
    return null;
  }
}

function emailsAcceptes(data) {
  const outils = outilsWebhook();
  return outils && typeof outils.accordEmails === "function" ? outils.accordEmails(data) : false;
}

const BREVO_LISTE_CLIENTS = 7;

async function dejaDansListeClients(email, brevoKey) {
  try {
    const rep = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      headers: { "api-key": brevoKey, accept: "application/json" },
    });
    if (!rep.ok) return false;
    const contact = await rep.json();
    return Array.isArray(contact.listIds) && contact.listIds.includes(BREVO_LISTE_CLIENTS);
  } catch {
    return false;
  }
}

async function accepterEmails(data, produitIds, stripe, res) {
  const email = data.customer_details && data.customer_details.email;
  const brevoKey = process.env.BREVO_API_KEY;
  const outils = outilsWebhook();
  if (!email || !brevoKey || !outils) {
    res.status(500).json({ erreur: "Inscription indisponible" });
    return;
  }
  if (data.metadata && data.metadata.cadeauEmail) {
    res.status(400).json({ erreur: "Achat offert" });
    return;
  }
  // Un second clic ne doit pas relancer toute la séquence d'emails.
  if (await dejaDansListeClients(email, brevoKey)) {
    res.status(200).json({ inscrit: true });
    return;
  }
  const PRODUITS = require("./_produits");
  const produits = produitIds.map((id) => PRODUITS[id]).filter(Boolean);
  const remise = await lireOuCreerRemise(data, produitIds, stripe);
  const montant = data.amount_total != null ? (data.amount_total / 100).toFixed(2) : "?";
  const contact = await outils.creerContactBrevoAchat(
    email, produits, montant, brevoKey, true, remise, data.id,
    {
      produitIds,
      origineAccord: "page-remerciement",
      nomAcheteur: data.customer_details?.individual_name || data.customer_details?.name,
    }
  );
  // Un contact déjà connu de Brevo n'entre dans l'automatisation qu'après une
  // réinscription à la liste des clients.
  if (contact && !contact.estNouveau) await outils.reinscrireAcheteurBrevo(email, brevoKey);
  res.status(200).json({ inscrit: true });
}

async function handler(req, res) {
  const methode = req.method || "GET";
  const corps = methode === "POST" ? lireCorps(req) : {};
  const query = req.query || {};

  // Suggestions publiques ou support précis à partir du catalogue, sans session.
  const lienPrecis = typeof query.produit === "string";
  if (methode === "GET" && !query.session_id && (lienPrecis || typeof query.ids === "string")) {
    const suggestions = lienPrecis
      ? [detailComplement(query.produit.trim())].filter(Boolean)
      : suggererComplements(query.ids.split(",").map((s) => s.trim())
        .filter((s) => ID_PRODUIT_VALIDE.test(s)).slice(0, 20), NOMBRE_SUGGESTIONS);
    let remise = null;
    const code = typeof query.code === "string" ? query.code.trim().toUpperCase() : "";
    if (code && process.env.STRIPE_SECRET_KEY) {
      try {
        const { lireRemiseParCode } = require("./_remise-post-achat");
        remise = await lireRemiseParCode(code, creerClientStripe(process.env.STRIPE_SECRET_KEY));
      } catch (e) {
        console.error("session-info lecture du code impossible:", e && e.code ? e.code : "erreur inconnue");
      }
    }
    if (res.setHeader) res.setHeader("Cache-Control", code ? "private, no-store" : "public, max-age=300");
    res.status(200).json({
      suggestions,
      remise: remisePourNavigateur(remise),
    });
    return;
  }

  const session_id = methode === "POST" ? corps.session_id : query.session_id;
  if (res.setHeader) res.setHeader("Cache-Control", "private, no-store");

  if (!session_id || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(session_id)) {
    res.status(400).json({ erreur: "session_id invalide" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ erreur: "Configuration Stripe manquante" }); return; }
  if (!sessionCompatibleAvecCle(session_id, stripeKey)) {
    res.status(404).json({ erreur: "Session introuvable" });
    return;
  }

  try {
    const stripe = creerClientStripe(stripeKey);
    const data = await stripe.checkout.sessions.retrieve(session_id);
    if (data.status === "expired" || (data.payment_status !== "paid"
      && !require("./_commande-confirmee").commandeGratuiteConfirmee(data))) {
      if (methode === "GET") {
        let paiement = data.payment_intent;
        if (data.status !== "expired" && typeof paiement === "string" && paiement) {
          try {
            paiement = await stripe.paymentIntents.retrieve(paiement);
          } catch {
            res.status(200).json({ etat: "indisponible" });
            return;
          }
        }
        res.status(200).json({ etat: etatPaiementNonConfirme(data, paiement) });
      } else {
        res.status(404).json({ erreur: "Session introuvable ou non payée" });
      }
      return;
    }
    const produitIds = produitIdsDe(data);

    if (methode === "POST") {
      if (corps.action !== "emails") { res.status(400).json({ erreur: "Action inconnue" }); return; }
      await accepterEmails(data, produitIds, stripe, res);
      return;
    }

    if (methode === "GET" && query.vue === "remise") {
      const remise = await lireOuCreerRemise(data, produitIds, stripe);
      res.status(200).json({ remise: remisePourNavigateur(remise) });
      return;
    }

    const confirmationSeule = methode === "GET" && query.vue === "confirmation";
    const cadeau = !!(data.metadata && data.metadata.cadeauEmail);
    // Paiement en plusieurs fois : la valeur de la commande est le total des
    // échéances, pas la seule première mensualité encaissée par Checkout.
    const montantTotalEcheances = Number(data.metadata && data.metadata.montantTotal);
    const remise = confirmationSeule ? null : await lireOuCreerRemise(data, produitIds, stripe);
    const groupes = groupesPageRemerciement(data, produitIds, confirmationSeule);
    const liensGroupables = confirmationSeule && groupes.length > 1;
    // La réponse porte des liens de téléchargement signés, jamais mis en cache.
    res.status(200).json({
      montant: montantTotalEcheances > 0
        ? montantTotalEcheances / 100
        : (data.amount_total != null ? data.amount_total / 100 : null),
      devise: (data.currency || "eur").toUpperCase(),
      produitIds,
      // Le drapeau Stripe suit l'achat même si la page s'ouvre sur un autre appareil.
      internalTest: estTestInterne(data),
      // Pack offert par un parent : merci-achat.html adapte son message, sans
      // jamais renvoyer l'adresse de l'étudiant au navigateur.
      cadeau,
      suggestions: cadeau ? [] : suggererComplements(produitIds, NOMBRE_SUGGESTIONS),
      remise: remisePourNavigateur(remise),
      ...(confirmationSeule ? { remisePossible: remiseApplicable(data, produitIds) } : {}),
      emailsAcceptes: cadeau ? true : emailsAcceptes(data),
      liens: groupes.flatMap(({ produitId, liens }) => liensGroupables
        ? liens.map((lien) => ({ ...lien, produitId }))
        : liens),
      ...(liensGroupables ? { nomsProduits: Object.fromEntries(groupes.map(({ produitId, nom }) => [produitId, nom])) } : {}),
    });
  } catch (e) {
    if (e && (e.code === "resource_missing" || e.statusCode === 404)) {
      res.status(404).json({ erreur: "Session introuvable" });
      return;
    }
    console.error("session-info Stripe erreur:", e && e.message ? e.message : "erreur inconnue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

module.exports = handler;
module.exports._test = { modeDepuisCle, sessionCompatibleAvecCle, remiseApplicable };
