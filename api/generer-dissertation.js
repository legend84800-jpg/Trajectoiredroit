const { PROMPT_METHODE } = require("./_methode-dissertation.js");

const MODELE = "claude-sonnet-4-6";
const MAX_TOKENS = 3200;
const MIN_CHARS = 5;
const MAX_CHARS = 2000;
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

  const sujet = typeof corps.sujet === "string" ? corps.sujet.trim() : "";

  if (sujet.length < MIN_CHARS) {
    res.status(422).json({ erreur: "Entre un sujet de dissertation." });
    return;
  }
  if (sujet.length > MAX_CHARS) {
    res.status(413).json({ erreur: "Le texte est trop long pour être un sujet de dissertation." });
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
        messages: [{ role: "user", content: sujet }],
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

    if (!texte || texte.startsWith("ERREUR_PAS_UN_SUJET")) {
      res.status(422).json({ erreur: "Ce texte n'est pas exploitable comme sujet de dissertation. Entre un sujet juridique." });
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
