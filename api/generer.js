// Fonction serverless Vercel : génère fiche d'arrêt, commentaire d'arrêt, cas
// pratique ou dissertation, selon le champ "type" du corps de requête.
// Fusion de generer-fiche-arret.js, generer-commentaire-arret.js,
// generer-cas-pratique.js et generer-dissertation.js pour rester sous la
// limite de 12 fonctions serverless du plan Vercel Hobby.
// Les abonnés Portalis (Supabase + Stripe subscription) passent un quota mensuel
// large plutôt que la limite d'essais gratuits par email des visiteurs non connectés.

const { PROMPT_METHODE: PROMPT_FICHE_ARRET } = require("./_methode-fiche-arret.js");
const { PROMPT_METHODE: PROMPT_COMMENTAIRE_ARRET } = require("./_methode-commentaire-arret.js");
const { PROMPT_METHODE: PROMPT_CAS_PRATIQUE } = require("./_methode-cas-pratique.js");
const { PROMPT_METHODE: PROMPT_DISSERTATION } = require("./_methode-dissertation.js");
const { utilisateurDepuisJWT, selectionner, upsert } = require("./_supabase");

const MODELE = "claude-sonnet-4-6";
const DELAI_IP_MS = 8000;
const QUOTA_MENSUEL_ABONNE = 80;

// Retourne { id, email } si le JWT envoyé par le front correspond à un abonné
// Portalis actif, sinon null. Toute erreur Supabase est traitée comme "non abonné"
// plutôt que de bloquer l'outil pour un problème transitoire indépendant du visiteur.
async function abonnePortalisActif(req) {
  const entete = req.headers["authorization"] || "";
  const jwt = entete.startsWith("Bearer ") ? entete.slice(7) : "";
  if (!jwt) return null;
  try {
    const utilisateur = await utilisateurDepuisJWT(jwt);
    if (!utilisateur) return null;
    const lignes = await selectionner(
      "abonnements",
      `user_id=eq.${encodeURIComponent(utilisateur.id)}&statut=eq.actif&select=user_id&limit=1`
    );
    return lignes.length ? utilisateur : null;
  } catch (e) {
    console.error("Vérification abonnement Portalis erreur:", e.message);
    return null;
  }
}

const CONFIGS = {
  fa: {
    prompt: PROMPT_FICHE_ARRET,
    champ: "arret",
    maxTokens: 3200,
    minChars: 200,
    maxChars: 24000,
    erreurCourt: "Le texte est trop court pour être un arrêt. Colle le texte complet de la décision.",
    erreurLong: "L'arrêt est trop long. Colle un seul arrêt (environ 24 000 caractères au maximum).",
    erreurRafale: "Doucement, laisse la fiche précédente se générer avant d'en lancer une autre.",
    codeErreur: "ERREUR_PAS_UN_ARRET",
    erreurContenu: "Ce texte ne ressemble pas à un arrêt. Colle le texte complet d'une décision de justice.",
  },
  ca: {
    prompt: PROMPT_COMMENTAIRE_ARRET,
    champ: "arret",
    maxTokens: 3800,
    minChars: 200,
    maxChars: 24000,
    erreurCourt: "Le texte est trop court. Colle le texte complet de l'arrêt à commenter.",
    erreurLong: "L'arrêt est trop long. Colle un seul arrêt (environ 24 000 caractères au maximum).",
    erreurRafale: "Laisse la génération précédente se terminer avant d'en lancer une autre.",
    codeErreur: "ERREUR_PAS_UN_ARRET",
    erreurContenu: "Ce texte ne ressemble pas à un arrêt. Colle le texte complet d'une décision de justice.",
  },
  cp: {
    prompt: PROMPT_CAS_PRATIQUE,
    champ: "enonce",
    maxTokens: 4500,
    minChars: 50,
    maxChars: 20000,
    erreurCourt: "L'énoncé est trop court. Colle le texte complet du cas pratique.",
    erreurLong: "L'énoncé est trop long. Colle un seul cas pratique (environ 20 000 caractères au maximum).",
    erreurRafale: "Laisse la génération précédente se terminer avant d'en lancer une autre.",
    codeErreur: "ERREUR_PAS_UN_ENONCE",
    erreurContenu: "Ce texte ne ressemble pas à un énoncé de cas pratique. Colle le texte complet de l'exercice.",
  },
  dis: {
    prompt: PROMPT_DISSERTATION,
    champ: "sujet",
    maxTokens: 4000,
    minChars: 5,
    maxChars: 2000,
    erreurCourt: "Entre un sujet de dissertation.",
    erreurLong: "Le texte est trop long pour être un sujet de dissertation.",
    erreurRafale: "Laisse la génération précédente se terminer avant d'en lancer une autre.",
    codeErreur: "ERREUR_PAS_UN_SUJET",
    erreurContenu: "Ce texte n'est pas exploitable comme sujet de dissertation. Entre un sujet juridique.",
  },
};

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

  const config = CONFIGS[corps.type];
  if (!config) {
    res.status(400).json({ erreur: "Type de génération inconnu." });
    return;
  }

  const texte = typeof corps[config.champ] === "string" ? corps[config.champ].trim() : "";

  if (texte.length < config.minChars) {
    res.status(422).json({ erreur: config.erreurCourt });
    return;
  }
  if (texte.length > config.maxChars) {
    res.status(413).json({ erreur: config.erreurLong });
    return;
  }

  const abonne = await abonnePortalisActif(req);
  const moisCourant = new Date().toISOString().slice(0, 7);
  let usageAvant = 0;

  if (abonne) {
    try {
      const lignes = await selectionner(
        "usage_portalis",
        `user_id=eq.${encodeURIComponent(abonne.id)}&mois=eq.${moisCourant}&select=compteur&limit=1`
      );
      usageAvant = lignes.length ? lignes[0].compteur : 0;
    } catch (e) {
      console.error("Lecture quota Portalis erreur:", e.message);
    }
    if (usageAvant >= QUOTA_MENSUEL_ABONNE) {
      res.status(429).json({
        erreur: `Tu as atteint tes ${QUOTA_MENSUEL_ABONNE} générations Portalis ce mois-ci. Ça revient le mois prochain.`,
      });
      return;
    }
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "inconnue";
  const cleRafale = corps.type + ":" + ip;
  const maintenant = Date.now();
  const dernier = dernierAppelParIp.get(cleRafale) || 0;
  if (maintenant - dernier < DELAI_IP_MS) {
    res.status(429).json({ erreur: config.erreurRafale });
    return;
  }
  dernierAppelParIp.set(cleRafale, maintenant);

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
        max_tokens: config.maxTokens,
        stream: true,
        system: [{ type: "text", text: config.prompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: texte }],
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

    // À partir d'ici la réponse passe en flux (SSE minimal, un objet JSON par
    // ligne "data:"). Chaque bout de texte rédigé par le modèle est renvoyé au
    // navigateur dès qu'il arrive, pour que le client garde ce qui a déjà été
    // écrit même si la fonction est coupée à la limite des 60 secondes du plan
    // Vercel avant la fin de la génération (au lieu de perdre tout le travail
    // déjà fait, comme c'était le cas en mode bufferisé).
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const envoyer = (payload) => res.write("data: " + JSON.stringify(payload) + "\n\n");

    let texteGenere = "";
    let erreurFlux = null;

    try {
      const reader = reponse.body.getReader();
      const decoder = new TextDecoder();
      let tampon = "";
      let sortir = false;

      while (!sortir) {
        const { done, value } = await reader.read();
        if (done) break;
        tampon += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = tampon.indexOf("\n\n")) !== -1) {
          const bloc = tampon.slice(0, idx);
          tampon = tampon.slice(idx + 2);

          const ligneData = bloc.split("\n").find((l) => l.startsWith("data:"));
          if (!ligneData) continue;
          let evt;
          try { evt = JSON.parse(ligneData.slice(5).trim()); } catch (e) { continue; }

          if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
            texteGenere += evt.delta.text;
            envoyer({ delta: evt.delta.text });
          } else if (evt.type === "error") {
            erreurFlux = (evt.error && evt.error.message) || "Erreur du modèle.";
            sortir = true;
            break;
          } else if (evt.type === "message_stop") {
            sortir = true;
            break;
          }
        }
      }
    } catch (e) {
      erreurFlux = e.message;
    }

    texteGenere = texteGenere.trim();

    if (!texteGenere) {
      envoyer({ error: erreurFlux || "La génération a échoué. Réessaie dans un instant." });
      res.end();
      return;
    }

    if (texteGenere.startsWith(config.codeErreur)) {
      envoyer({ error: config.erreurContenu });
      res.end();
      return;
    }

    const debut = texteGenere.indexOf("<article");
    const fin = texteGenere.lastIndexOf("</article>");
    const complet = debut !== -1 && fin !== -1 && fin > debut;

    if (!complet) {
      // Pas de balise de fermeture propre : soit le budget de tokens a été
      // atteint (troncature), soit le flux a été coupé net. Le client garde
      // déjà en direct le texte brut affiché jusque-là, il n'a pas besoin du
      // html ici, juste du signal que ce n'est pas la version complète.
      envoyer({ error: "tronque" });
      res.end();
      return;
    }

    const html = texteGenere.slice(debut, fin + "</article>".length);

    if (abonne) {
      try {
        await upsert(
          "usage_portalis",
          { user_id: abonne.id, mois: moisCourant, compteur: usageAvant + 1 },
          "user_id,mois"
        );
      } catch (e) {
        console.error("Incrément quota Portalis erreur:", e.message);
      }
    }

    envoyer({ done: true, html: nettoyerHtml(html) });
    res.end();
  } catch (e) {
    // Si on a déjà commencé à streamer (headers envoyés), il faut le signaler
    // en flux plutôt qu'avec un nouveau code HTTP, qui ne peut plus être posé.
    if (res.headersSent) {
      try { res.write("data: " + JSON.stringify({ error: "La génération a échoué. Réessaie dans un instant." }) + "\n\n"); } catch (e2) {}
      res.end();
    } else {
      res.status(502).json({ erreur: "La génération a échoué. Réessaie dans un instant." });
    }
  }
};

module.exports.config = { maxDuration: 60 };
