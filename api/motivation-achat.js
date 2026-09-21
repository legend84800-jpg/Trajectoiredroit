// Une réponse facultative par achat confirmé de fiche ou de majeure.
// Les réponses sont conservées séparément des coordonnées de l'acheteur.
const crypto = require("node:crypto");
const PRODUITS = require("./_produits");
const { creerClientStripe } = require("./_stripe");
const { insererSiAbsent } = require("./_supabase");

const DECLENCHEURS = new Set(["td", "note", "partiel", "nouvelle_matiere", "autre"]);
const RESULTATS = new Set(["comprendre", "exercice", "partiel", "temps", "autre"]);

function texteCourt(valeur) {
  if (valeur == null || valeur === "") return null;
  if (typeof valeur !== "string") return undefined;
  const texte = valeur.trim().replace(/\s+/g, " ");
  if (texte.length > 160 || /[\r\n]/.test(valeur)) return undefined;
  return texte || null;
}

function sessionCompatible(sessionId, cle) {
  const correspondance = typeof sessionId === "string" && sessionId.match(/^cs_(live|test)_[A-Za-z0-9]+$/);
  const modeCle = typeof cle === "string" && cle.match(/^[sr]k_(live|test)_/);
  return Boolean(correspondance && (!modeCle || correspondance[1] === modeCle[1]));
}

async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ erreur: "Méthode non autorisée" }); return; }
  if (req.headers && req.headers.origin && req.headers.origin !== "https://trajectoiredroit.com") {
    res.status(403).json({ erreur: "Origine non autorisée" }); return;
  }

  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  corps = corps || {};
  const { session_id: sessionId, declencheur, resultat } = corps;
  const declencheurAutre = texteCourt(corps.declencheur_autre);
  const resultatPrecision = texteCourt(corps.resultat_precision);
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!sessionCompatible(sessionId, stripeKey) || !DECLENCHEURS.has(declencheur)
      || !RESULTATS.has(resultat) || declencheurAutre === undefined
      || resultatPrecision === undefined) {
    res.status(400).json({ erreur: "Réponse invalide" }); return;
  }
  if (!stripeKey) { res.status(503).json({ erreur: "Service indisponible" }); return; }

  try {
    const stripe = creerClientStripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const produitIds = ((session.metadata && session.metadata.produitIds) || "")
      .split(",").map((id) => id.trim()).filter(Boolean);
    if (session.mode !== "payment" || session.payment_status !== "paid"
        || !(session.amount_total > 0) || (session.metadata && session.metadata.internalTest) === "1"
        || !produitIds.some((id) =>
          (id.startsWith("fiche-") || id.startsWith("maj-")) && PRODUITS[id])) {
      res.status(404).json({ erreur: "Achat éligible introuvable" }); return;
    }

    const sessionHash = crypto.createHash("sha256").update(sessionId).digest("hex");
    const lignes = await insererSiAbsent("motivations_achats", {
      session_hash: sessionHash,
      mode: sessionId.startsWith("cs_live_") ? "live" : "test",
      produit_ids: produitIds.filter((id) => PRODUITS[id]),
      declencheur,
      declencheur_autre: declencheur === "autre" ? declencheurAutre : null,
      resultat,
      resultat_precision: resultatPrecision,
    }, "session_hash");
    res.status(200).json({ enregistre: true, dejaRepondu: lignes.length === 0 });
  } catch (e) {
    if (e && (e.code === "resource_missing" || e.statusCode === 404)) {
      res.status(404).json({ erreur: "Achat éligible introuvable" }); return;
    }
    console.error("motivation-achat erreur:", e && e.message ? e.message : "erreur inconnue");
    res.status(503).json({ erreur: "Enregistrement indisponible" });
  }
}

module.exports = handler;
module.exports._test = { texteCourt, sessionCompatible };
