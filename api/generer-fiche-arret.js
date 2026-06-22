// Fonction serverless Vercel : génère une fiche d'arrêt à partir du texte collé.
// Lit la clé ANTHROPIC_API_KEY dans les variables d'environnement du projet Vercel.
// Aucune dépendance npm : fetch natif (Node 18+).

const { PROMPT_METHODE } = require("./_methode-fiche-arret.js");

const MODELE = "claude-sonnet-4-6";
const MAX_TOKENS = 2800;
const MIN_CHARS = 200;     // en dessous, ce n'est pas un vrai arrêt
const MAX_CHARS = 24000;   // borne le coût par appel
const DELAI_IP_MS = 8000;  // anti-rafale best-effort par IP

// Mémoire d'instance (réinitialisée à chaque démarrage à froid). Garde-fou léger.
const dernierAppelParIp = new Map();

function nettoyerHtml(html) {
  // Retire tout script et tout gestionnaire d'événement inline, par précaution.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ erreur: "Méthode non autorisée." });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ erreur: "L'outil n'est pas encore configuré. Reviens dans un instant." });
    return;
  }

  // Corps de requête (Vercel parse le JSON, mais on sécurise le cas brut).
  let corps = req.body;
  if (typeof corps === "string") {
    try { corps = JSON.parse(corps); } catch (e) { corps = {}; }
  }
  corps = corps || {};

  const arret = typeof corps.arret === "string" ? corps.arret.trim() : "";

  if (arret.length < MIN_CHARS) {
    res.status(422).json({ erreur: "Le texte est trop court pour être un arrêt. Colle le texte complet de la décision." });
    return;
  }
  if (arret.length > MAX_CHARS) {
    res.status(413).json({ erreur: "L'arrêt est trop long. Colle un seul arrêt (environ 24 000 caractères au maximum)." });
    return;
  }

  // Anti-rafale par IP (best-effort).
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "inconnue";
  const maintenant = Date.now();
  const dernier = dernierAppelParIp.get(ip) || 0;
  if (maintenant - dernier < DELAI_IP_MS) {
    res.status(429).json({ erreur: "Doucement, laisse la fiche précédente se générer avant d'en lancer une autre." });
    return;
  }
  dernierAppelParIp.set(ip, maintenant);

  try {
    const reponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: MAX_TOKENS,
        system: PROMPT_METHODE,
        messages: [{ role: "user", content: arret }],
      }),
    });

    if (!reponse.ok) {
      const code = reponse.status;
      if (code === 429) {
        res.status(503).json({ erreur: "L'outil est très demandé en ce moment. Réessaie dans une minute." });
      } else {
        res.status(502).json({ erreur: "La génération a échoué. Réessaie dans un instant." });
      }
      return;
    }

    const data = await reponse.json();
    const texte = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!texte || texte.startsWith("ERREUR_PAS_UN_ARRET")) {
      res.status(422).json({ erreur: "Ce texte ne ressemble pas à un arrêt. Colle le texte complet d'une décision de justice." });
      return;
    }

    let html = texte;
    // On ne garde que le bloc <article>...</article> si le modèle ajoute du bavardage.
    const debut = html.indexOf("<article");
    const fin = html.lastIndexOf("</article>");
    if (debut !== -1 && fin !== -1) {
      html = html.slice(debut, fin + "</article>".length);
    }
    if (!html.startsWith("<article")) {
      res.status(502).json({ erreur: "La génération a échoué. Réessaie dans un instant." });
      return;
    }

    res.status(200).json({ html: nettoyerHtml(html) });
  } catch (e) {
    res.status(502).json({ erreur: "La génération a échoué. Réessaie dans un instant." });
  }
};

// Laisse à la génération le temps de finir (nécessite le plan Vercel Pro pour > 10 s).
module.exports.config = { maxDuration: 60 };
