// Fonction serverless Vercel : inscrit l'email capté par l'outil dans Brevo.
// Lit BREVO_API_KEY (déjà possédée) et, en option, BREVO_LIST_ID pour ranger
// le contact dans une liste dédiée. Aucune dépendance npm.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ erreur: "Méthode non autorisée." });
    return;
  }

  let corps = req.body;
  if (typeof corps === "string") {
    try { corps = JSON.parse(corps); } catch (e) { corps = {}; }
  }
  corps = corps || {};

  const email = typeof corps.email === "string" ? corps.email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(email)) {
    res.status(422).json({ erreur: "Email invalide." });
    return;
  }

  // Pas de clé Brevo : on ne bloque pas l'élève, on l'autorise quand même.
  if (!process.env.BREVO_API_KEY) {
    res.status(200).json({ ok: true, stocke: false });
    return;
  }

  const contact = {
    email,
    updateEnabled: true,
    attributes: { SOURCE: "generateur-fiche-arret" },
  };
  if (process.env.BREVO_LIST_ID) {
    contact.listIds = [Number(process.env.BREVO_LIST_ID)];
  }

  try {
    const reponse = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(contact),
    });

    // 201 = créé, 204 = mis à jour. Le code "duplicate_parameter" (contact déjà
    // présent) n'est pas une erreur pour nous : l'élève reste autorisé.
    if (reponse.ok || reponse.status === 204 || reponse.status === 400) {
      res.status(200).json({ ok: true, stocke: true });
      return;
    }
    res.status(200).json({ ok: true, stocke: false });
  } catch (e) {
    // Même en cas d'échec réseau, on ne bloque pas l'élève.
    res.status(200).json({ ok: true, stocke: false });
  }
};
