const { PROMPT_METHODE } = require("./_methode-commentaire-arret.js");

const MODELE = "claude-sonnet-4-6";
const MAX_TOKENS = 3200;
const MIN_CHARS = 200;
const MAX_CHARS = 24000;
const DELAI_IP_MS = 8000;

const dernierAppelParIp = new Map();

function nettoyerHtml(html) {
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

  let corps = req.body;
  if (typeof corps === "string") {
    try { corps = JSON.parse(corps); } catch (e) { corps = {}; }
  }
  corps = corps || {};

  const arret = typeof corps.arret === "string" ? corps.arret.trim() : "";

  if (arret.length < MIN_CHARS) {
    res.status(422).json({ erreur: "Le texte est trop court. Colle le texte complet de l'arrêt à commenter." });
    return;
  }
  if (arret.length > MAX_CHARS) {
    res.status(413).json({ erreur: "L'arrêt est trop long. Colle un seul arrêt (environ 24 000 caractères au maximum)." });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "inconnue";
  const maintenant = Date.now();
  const dernier = dernierAppelParIp.get(ip) || 0;
  if (maintenant - dernier < DELAI_IP_MS) {
    res.status(429).json({ erreur: "Laisse la génération précédente se terminer avant d'en lancer une autre." });
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

module.exports.config = { maxDuration: 60 };
