// Fonction serverless Vercel : génère fiche d'arrêt, commentaire d'arrêt, cas
// pratique ou dissertation, selon le champ "type" du corps de requête.
// Fusion de generer-fiche-arret.js, generer-commentaire-arret.js,
// generer-cas-pratique.js et generer-dissertation.js pour rester sous la
// limite de 12 fonctions serverless du plan Vercel Hobby.
// Les abonnés Portalis (Supabase + Stripe subscription) passent un quota mensuel
// large. Les autres ont droit à deux essais gratuits vérifiés ici même (table
// essais_gratuits) : un par IP sans inscription, un par compte après connexion
// par lien magique. Rien de tout ça ne doit jamais être vérifié côté client.

const crypto = require("crypto");
const { PROMPT_METHODE: PROMPT_FICHE_ARRET } = require("./_methode-fiche-arret.js");
const { PROMPT_METHODE: PROMPT_COMMENTAIRE_ARRET } = require("./_methode-commentaire-arret.js");
const { PROMPT_METHODE: PROMPT_CAS_PRATIQUE } = require("./_methode-cas-pratique.js");
const { PROMPT_METHODE: PROMPT_DISSERTATION } = require("./_methode-dissertation.js");
const { utilisateurDepuisJWT, selectionner, upsert } = require("./_supabase");

const MODELE = "claude-sonnet-4-6";
const DELAI_IP_MS = 8000;
const QUOTA_MENSUEL_ABONNE = 80;
// Deux essais gratuits au total avant abonnement : un sans inscription (gated
// par IP), un supplémentaire après connexion par email (lien magique
// Supabase). Les deux sont vérifiés ici côté serveur (table essais_gratuits),
// jamais côté client : le localStorage du navigateur ne fait plus foi, il ne
// sert qu'à l'affichage indicatif du compteur.
const LIMITE_ESSAI_IP = 1;
const LIMITE_ESSAI_COMPTE = 1;

// Retourne { id, email } si le JWT envoyé par le front correspond à une
// session Supabase valide, qu'il s'agisse d'un abonné payant ou d'un simple
// compte créé pour débloquer l'essai gratuit supplémentaire. null si aucun JWT
// ou JWT invalide.
async function utilisateurDuJWT(req) {
  const entete = req.headers["authorization"] || "";
  const jwt = entete.startsWith("Bearer ") ? entete.slice(7) : "";
  if (!jwt) return null;
  try {
    return await utilisateurDepuisJWT(jwt);
  } catch (e) {
    console.error("Vérification JWT Portalis erreur:", e.message);
    return null;
  }
}

// true si l'utilisateur a un abonnement Portalis actif. Toute erreur Supabase
// est traitée comme "non abonné" plutôt que de bloquer l'outil pour un
// problème transitoire indépendant du visiteur.
async function estAbonneActif(utilisateur) {
  if (!utilisateur) return false;
  try {
    const lignes = await selectionner(
      "abonnements",
      `user_id=eq.${encodeURIComponent(utilisateur.id)}&statut=eq.actif&select=user_id&limit=1`
    );
    return lignes.length > 0;
  } catch (e) {
    console.error("Vérification abonnement Portalis erreur:", e.message);
    return false;
  }
}

// Clé de rate-limit, pas une frontière de sécurité : un simple sha256 de l'IP
// suffit à identifier "le même visiteur" sans stocker l'IP en clair.
function cleEssaiIp(ip) {
  return "ip:" + crypto.createHash("sha256").update(ip).digest("hex");
}

async function compteurEssai(identifiant) {
  try {
    const lignes = await selectionner(
      "essais_gratuits",
      `identifiant=eq.${encodeURIComponent(identifiant)}&select=compteur&limit=1`
    );
    return lignes.length ? lignes[0].compteur : 0;
  } catch (e) {
    console.error("Lecture essai gratuit Portalis erreur:", e.message);
    return 0;
  }
}

async function incrementerEssai(identifiant, valeurActuelle) {
  try {
    await upsert(
      "essais_gratuits",
      { identifiant, compteur: valeurActuelle + 1, maj: new Date().toISOString() },
      "identifiant"
    );
  } catch (e) {
    console.error("Incrément essai gratuit Portalis erreur:", e.message);
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
  // Texte déjà rédigé lors d'un appel précédent sur le même exercice, envoyé par
  // le client quand la génération a été coupée par la limite de 60 secondes de
  // la fonction serverless. Le modèle (claude-sonnet-4-6) ne supporte pas le
  // préremplissage de message assistant ("the conversation must end with a user
  // message"), donc on ne peut pas lui faire continuer son propre message : on
  // renvoie tout dans un seul message utilisateur qui lui montre ce qu'il a déjà
  // écrit et lui demande explicitement d'écrire la suite, sans rien répéter.
  // slice(-60000) et non slice(0, 60000) : sur un document long ayant déjà
  // enchaîné plusieurs relances, c'est la FIN du texte déjà rédigé qui indique
  // au modèle où reprendre. Garder le début et couper la fin lui aurait caché
  // la coupure réelle et l'aurait fait regénérer (en double) tout ce qui suit.
  const continuation = typeof corps.continuation === "string" ? corps.continuation.slice(-60000) : "";

  if (texte.length < config.minChars) {
    res.status(422).json({ erreur: config.erreurCourt });
    return;
  }
  if (texte.length > config.maxChars) {
    res.status(413).json({ erreur: config.erreurLong });
    return;
  }

  const utilisateur = await utilisateurDuJWT(req);
  const abonne = utilisateur && (await estAbonneActif(utilisateur)) ? utilisateur : null;
  const moisCourant = new Date().toISOString().slice(0, 7);
  let usageAvant = 0;

  // Trois cas, du plus large accès au plus restreint : abonné payant (quota
  // mensuel large), compte connecté sans abonnement (un essai gratuit
  // supplémentaire, débloqué par lien magique), visiteur anonyme (un essai
  // gratuit sans inscription, gated par IP). Les compteurs essais_gratuits ne
  // sont incrémentés qu'après une génération réussie, plus bas, jamais ici.
  let identifiantEssai = null;
  let essaiAvant = 0;

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
        code: "QUOTA_ABONNE_EPUISE",
      });
      return;
    }
  } else if (utilisateur) {
    identifiantEssai = "compte:" + utilisateur.id;
    essaiAvant = await compteurEssai(identifiantEssai);
    if (essaiAvant >= LIMITE_ESSAI_COMPTE) {
      res.status(429).json({
        erreur: "Tu as déjà utilisé ton essai gratuit avec ce compte. Abonne-toi à Portalis (6 €/mois) pour continuer.",
        code: "ESSAI_COMPTE_EPUISE",
      });
      return;
    }
  } else {
    identifiantEssai = cleEssaiIp(
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "inconnue"
    );
    essaiAvant = await compteurEssai(identifiantEssai);
    if (essaiAvant >= LIMITE_ESSAI_IP) {
      res.status(403).json({
        erreur: "Tu as déjà utilisé ton essai gratuit sans compte. Connecte-toi avec ton email pour un essai supplémentaire.",
        code: "ESSAI_IP_EPUISE",
      });
      return;
    }
  }

  // Le garde-fou anti-rafale protège contre un élève qui relance des générations
  // à la chaîne. Une continuation n'est pas une nouvelle génération demandée par
  // l'élève, c'est la suite automatique de celle en cours : elle ne doit pas être
  // bloquée par le délai, sinon aucune génération longue ne pourrait jamais aboutir.
  if (!continuation) {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "inconnue";
    const cleRafale = corps.type + ":" + ip;
    const maintenant = Date.now();
    const dernier = dernierAppelParIp.get(cleRafale) || 0;
    if (maintenant - dernier < DELAI_IP_MS) {
      res.status(429).json({ erreur: config.erreurRafale });
      return;
    }
    dernierAppelParIp.set(cleRafale, maintenant);
  }

  try {
    // Sans continuation : un seul message utilisateur, comme avant. Avec
    // continuation : un unique message utilisateur qui montre au modèle ce
    // qu'il a déjà écrit et lui demande d'écrire uniquement la suite, jusqu'à
    // la fermeture de la balise. Le modèle ne recopie donc jamais le début.
    // Le client (voir trimAuDernierMotComplet dans outil-fiche-arret.html)
    // recule toujours jusqu'au dernier espace avant d'envoyer ce texte : il se
    // termine donc systématiquement par un espace, juste après un mot complet.
    // Sans cette garantie, demander au modèle de deviner si la coupure tombe
    // en plein milieu d'un mot produisait régulièrement un mot recollé sans
    // espace à la jointure ("d'équitéqui").
    const messages = continuation
      ? [{
          role: "user",
          content: texte +
            "\n\n---\n\nTa réponse précédente à cette demande a été interrompue avant la fin car trop longue pour un seul appel. Voici exactement ce que tu as déjà rédigé, à ne surtout pas répéter (ce texte se termine toujours par un espace, juste après un mot complet) :\n\n" +
            continuation +
            "\n\n---\n\nÉcris uniquement la SUITE de ce texte : commence directement par le mot suivant, sans espace ni retour à la ligne avant ce mot, et continue jusqu'à la fermeture complète de la balise </article>. Ne recopie et ne réécris rien de ce qui précède, ne remets pas la balise d'ouverture <article>.",
        }]
      : [{ role: "user", content: texte }];

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
        messages,
      }),
    });

    if (!reponse.ok) {
      const code = reponse.status;
      const detail = await reponse.text().catch(() => "");
      console.error("Appel Anthropic en échec:", code, detail.slice(0, 500));
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
    // Vercel avant la fin de la génération. Si le texte est incomplet à la fin
    // du flux, le client relance automatiquement un nouvel appel avec ce texte
    // en continuation (voir plus haut), chaque appel disposant de son propre
    // budget de 60 secondes, jusqu'à ce que la génération aboutisse ou que le
    // nombre maximal de relances soit atteint.
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

    // En continuation, texteGenere ne devrait contenir que la suite écrite lors
    // de CET appel (la balise d'ouverture est déjà dans le texte du premier
    // appel). Si le modèle a malgré la consigne réécrit une balise d'ouverture,
    // il est reparti du début : dans ce cas on ignore l'ancien texte accumulé
    // plutôt que de produire un HTML dupliqué et cassé.
    const repartiDuDebut = continuation && /^\s*<article/.test(texteGenere);
    const texteComplet = repartiDuDebut ? texteGenere : continuation + texteGenere;

    if (texteComplet.startsWith(config.codeErreur)) {
      envoyer({ error: config.erreurContenu });
      res.end();
      return;
    }

    const debut = texteComplet.indexOf("<article");
    const fin = texteComplet.lastIndexOf("</article>");
    const complet = debut !== -1 && fin !== -1 && fin > debut;

    if (!complet) {
      // Pas de balise de fermeture propre : soit le budget de tokens a été
      // atteint (troncature), soit le flux a été coupé net. Le client garde
      // déjà en direct le texte brut affiché jusque-là et va relancer une
      // continuation automatique ; il n'a pas besoin du html ici, juste du
      // signal que ce n'est pas la version complète.
      envoyer({ error: "tronque" });
      res.end();
      return;
    }

    const html = texteComplet.slice(debut, fin + "</article>".length);

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
    } else if (identifiantEssai) {
      await incrementerEssai(identifiantEssai, essaiAvant);
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
