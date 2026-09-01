const crypto = require("crypto");
const { selectionner } = require("./_supabase");
const { creerClientStripe } = require("./_stripe");

const PRODUIT_PILOTE = "maj-penal-l2-s1";
const FINGERPRINT_RE = /^[0-9A-F]{10}$/;
const LICENCE_RE = /^TD-PEN-S1-[0-9A-F]{8}$/;
const DELAI_SIGNATURE_SECONDES = 5 * 60;

function reponseSecurisee(res, statut, corps, secret) {
  const contenu = JSON.stringify(corps);
  const signature = secret
    ? crypto.createHmac("sha256", secret).update(contenu).digest("hex")
    : "";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (signature) res.setHeader("X-TJD-Response-Signature", signature);
  res.status(statut).send(contenu);
}

function listeNettoyee(valeur, expression) {
  if (!Array.isArray(valeur)) return [];
  return [...new Set(
    valeur
      .map(element => String(element || "").trim().toUpperCase())
      .filter(element => expression.test(element))
  )].sort().slice(0, 32);
}

function chargeSignature(horodatage, nonce, fingerprints, licences) {
  return [horodatage, nonce, fingerprints.join(","), licences.join(",")].join("|");
}

function signatureValide(req, fingerprints, licences, secret, maintenant = Date.now()) {
  const horodatage = String(req.headers["x-tjd-timestamp"] || "");
  const nonce = String(req.headers["x-tjd-nonce"] || "");
  const signature = String(req.headers["x-tjd-signature"] || "").toLowerCase();
  if (!/^\d{10}$/.test(horodatage) || !/^[0-9a-f]{32}$/.test(nonce)) return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const ecart = Math.abs(Math.floor(maintenant / 1000) - Number(horodatage));
  if (ecart > DELAI_SIGNATURE_SECONDES) return false;
  const attendu = crypto
    .createHmac("sha256", secret)
    .update(chargeSignature(horodatage, nonce, fingerprints, licences))
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(attendu, "hex"), Buffer.from(signature, "hex"));
}

function codesCommande(sessionId, secret) {
  const empreinte = crypto
    .createHmac("sha256", secret)
    .update(`licence|${PRODUIT_PILOTE}|${sessionId}`)
    .digest("hex")
    .toUpperCase();
  return {
    licence: `TD-PEN-S1-${empreinte.slice(0, 8)}`,
    fingerprint: empreinte.slice(8, 18),
  };
}

function contientProduit(achat) {
  const produits = Array.isArray(achat.produit_ids)
    ? achat.produit_ids
    : String(achat.produit_ids || "").split(",");
  return produits.map(produit => produit.trim()).includes(PRODUIT_PILOTE);
}

function nomLicence(session) {
  const champ = (session.custom_fields || []).find(element => element.key === "nomlicence");
  const nomChamp = champ && champ.text && champ.text.value;
  return String(nomChamp || (session.customer_details && session.customer_details.name) || "").trim();
}

async function identifier(body, contexte) {
  const fingerprints = listeNettoyee(body && body.fingerprints, FINGERPRINT_RE);
  const licences = listeNettoyee(body && body.licences, LICENCE_RE);
  if (!fingerprints.length && !licences.length) {
    return { statut: 400, corps: { erreur: "Aucun marqueur valide" } };
  }

  const achats = await contexte.selectionner(
    "achats",
    "select=email,produit_ids,session_id,montant,cree_le&session_id=not.is.null&limit=10000"
  );
  const correspondances = achats
    .filter(achat => achat.session_id && contientProduit(achat))
    .map(achat => ({ achat, ...codesCommande(achat.session_id, contexte.downloadSecret) }))
    .filter(element => (
      fingerprints.includes(element.fingerprint) || licences.includes(element.licence)
    ));

  if (correspondances.length === 0) {
    return { statut: 404, corps: { erreur: "Aucune commande correspondante" } };
  }
  if (correspondances.length > 1) {
    throw new Error("Plusieurs commandes correspondent aux mêmes marqueurs");
  }

  const correspondance = correspondances[0];
  const session = await contexte.stripe.checkout.sessions.retrieve(
    correspondance.achat.session_id
  );
  const produitsStripe = String((session.metadata && session.metadata.produitIds) || "")
    .split(",")
    .map(produit => produit.trim());
  if (
    session.mode !== "payment"
    || session.payment_status !== "paid"
    || !produitsStripe.includes(PRODUIT_PILOTE)
  ) {
    throw new Error("La session Stripe ne confirme pas l'achat");
  }
  const emailStripe = String(
    (session.customer_details && session.customer_details.email) || ""
  ).trim().toLowerCase();
  if (!emailStripe || emailStripe !== String(correspondance.achat.email || "").trim().toLowerCase()) {
    throw new Error("Les adresses Supabase et Stripe ne correspondent pas");
  }

  return {
    statut: 200,
    corps: {
      schema: "tjd-correspondance-fuite-v1",
      licence: correspondance.licence,
      fingerprint: correspondance.fingerprint,
      commande: {
        session_stripe: session.id,
        paiement: session.payment_status,
        produits: correspondance.achat.produit_ids,
        montant_euros: correspondance.achat.montant,
        date: correspondance.achat.cree_le,
      },
      titulaire: {
        nom: nomLicence(session),
        nom_affiche_pdf: "",
        email: emailStripe,
      },
    },
  };
}

async function handler(req, res) {
  const adminSecret = process.env.FORENSIC_ADMIN_SECRET || "";
  const downloadSecret = process.env.DOWNLOAD_SECRET || "";
  const stripeKey = process.env.STRIPE_SECRET_KEY || "";
  if (!adminSecret || !downloadSecret || !stripeKey) {
    reponseSecurisee(res, 503, { erreur: "Configuration incomplète" }, adminSecret);
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    reponseSecurisee(res, 405, { erreur: "Méthode refusée" }, adminSecret);
    return;
  }

  const fingerprints = listeNettoyee(req.body && req.body.fingerprints, FINGERPRINT_RE);
  const licences = listeNettoyee(req.body && req.body.licences, LICENCE_RE);
  if (!signatureValide(req, fingerprints, licences, adminSecret)) {
    reponseSecurisee(res, 401, { erreur: "Authentification refusée" }, adminSecret);
    return;
  }

  try {
    const resultat = await identifier(
      { fingerprints, licences },
      {
        selectionner,
        downloadSecret,
        stripe: creerClientStripe(stripeKey),
      }
    );
    reponseSecurisee(res, resultat.statut, resultat.corps, adminSecret);
  } catch (erreur) {
    console.error("Identification fuite impossible:", erreur.message);
    reponseSecurisee(res, 500, { erreur: "Identification temporairement impossible" }, adminSecret);
  }
}

module.exports = {
  handler,
  identifier,
  codesCommande,
  chargeSignature,
  signatureValide,
};
