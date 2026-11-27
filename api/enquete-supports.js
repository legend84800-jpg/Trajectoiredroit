const { randomBytes } = require("node:crypto");
const PRODUITS = require("./_produits");
const supabase = require("./_supabase");
const { creerClientStripe } = require("./_stripe");
const { creerRemiseEnquete } = require("./_remise-enquete");

const TABLE = "enquete_supports";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGES = new Set(["cours", "td", "partiel", "autre", "pas_encore"]);
const AIDE = new Set(["oui", "en_partie", "non"]);
const PRIORITES = new Set(["explication", "exemple", "programme", "erreur", "navigation", "autre", "aucune", "pas_assez"]);
const SUPPORTS = Object.fromEntries(Object.entries(PRODUITS)
  .filter(([id, p]) => !p.venteSuspendue && (id.startsWith("maj-") || p.nom.startsWith("Fiche complète ")))
  .map(([id, p]) => [id, p.nom]));

function texte(valeur) {
  if (valeur == null || valeur === "") return null;
  if (typeof valeur !== "string" || valeur.length > 600 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(valeur)) return undefined;
  return valeur.trim() || null;
}

function lireReponse(corps) {
  if (!corps || typeof corps !== "object") return null;
  const { id, support, usage, aide, priorite } = corps;
  if (typeof id !== "string" || !UUID.test(id)
      || typeof support !== "string" || !Object.hasOwn(SUPPORTS, support)
      || !USAGES.has(usage) || !PRIORITES.has(priorite)) return null;
  const utilise = usage !== "pas_encore";
  if (utilise && !AIDE.has(aide)) return null;
  const utile = utilise ? texte(corps.utile) : null;
  const remarque = texte(corps.remarque);
  if (utile === undefined || remarque === undefined) return null;
  return { id: id.toLowerCase(), support, usage, aide: utilise ? aide : null, priorite, utile, remarque };
}

async function enregistrerReponse(reponse, db = supabase) {
  const code = "ENQUETE-" + randomBytes(9).toString("hex").toUpperCase();
  const lignes = await db.insererSiAbsent(TABLE, { ...reponse, code }, "id");
  if (lignes.length) return lignes[0];
  const deja = await db.selectionner(TABLE, "id=eq." + reponse.id + "&select=id,support,code&limit=1");
  return deja[0]?.support === reponse.support ? deja[0] : null;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const supports = Object.entries(SUPPORTS).sort((a, b) => a[1].localeCompare(b[1], "fr"));
    return res.status(200).json({ supports });
  }
  if (req.method !== "POST") return res.status(405).end();
  const origine = req.headers?.origin;
  const hote = req.headers?.host;
  if (origine && origine !== "https://" + hote && origine !== "https://trajectoiredroit.com") {
    return res.status(403).end();
  }
  let corps;
  try {
    corps = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erreur: "reponses_incompletes" });
  }
  const reponse = lireReponse(corps);
  if (!reponse) return res.status(400).json({ erreur: "reponses_incompletes" });

  try {
    const stripe = creerClientStripe(process.env.STRIPE_SECRET_KEY);
    const enregistrement = await enregistrerReponse(reponse);
    if (!enregistrement) return res.status(409).json({ erreur: "support_modifie" });
    return res.status(200).json(await creerRemiseEnquete(stripe, enregistrement));
  } catch (e) {
    console.error("enquete-supports", { code: e.code || e.name || "inconnu" });
    return res.status(503).json({ erreur: "envoi_indisponible" });
  }
}

module.exports = handler;
module.exports._test = { SUPPORTS, lireReponse, enregistrerReponse };
