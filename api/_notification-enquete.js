const supabase = require("./_supabase");

const TABLE = "enquete_supports";
const OPTIONS = {
  usage: {
    cours: "Pour comprendre ou revoir une partie du cours",
    td: "Pour préparer un TD ou rédiger un exercice",
    partiel: "Pour réviser un partiel",
    autre: "Pour un autre usage",
    pas_encore: "Je ne l’ai pas encore utilisé",
  },
  aide: { oui: "Oui", en_partie: "En partie", non: "Non" },
  partie_utilisee: {
    regles: "Les règles et leurs conditions d’application",
    explications: "Les explications du cours",
    exemples: "Les exemples et les exercices corrigés",
    references: "Les références aux articles de loi ou aux décisions de justice",
    plan: "Le plan ou le sommaire",
    autre: "Une autre partie",
    aucune: "Aucune partie en particulier",
  },
  clarte: {
    premiere_lecture: "Oui, dès la première lecture",
    relecture: "Oui, après avoir relu certains passages",
    difficile: "Non, certains passages restent difficiles à comprendre",
    pas_assez: "Je n’ai pas assez lu pour répondre",
  },
  priorite: {
    explication: "Développer une explication",
    exemple: "Ajouter un exemple d’application",
    programme: "Traiter un point du programme qui manque",
    erreur: "Corriger une erreur",
    navigation: "Faciliter la recherche d’un passage",
    autre: "Une autre amélioration",
    aucune: "Rien à changer pour le moment",
    pas_assez: "Je ne l’ai pas assez utilisé pour répondre",
  },
  frein: {
    plus_tard: "J’en aurai besoin plus tard",
    temps: "J’ai manqué de temps",
    acces: "J’ai eu un problème d’accès ou de téléchargement",
    debut: "Je cherche encore par où commencer",
    programme: "Je doute que le support corresponde à mon programme",
    autre_ressource: "Une autre ressource me suffit pour le moment",
    autre: "Une autre raison",
  },
  hesitation: {
    programme: "Je voulais vérifier que le support correspondait à mon programme",
    format: "J’hésitais entre plusieurs formats, comme une fiche et un cours",
    prix: "Le prix m’a fait hésiter",
    autre_ressource: "J’envisageais d’utiliser une autre ressource",
    usage: "Je cherchais à savoir comment ce support m’aiderait dans mon travail",
    autre: "Une autre raison",
    aucune: "J’ai choisi sans hésiter",
    pas_achete: "Je n’ai pas acheté ce support",
  },
};

const CHAMPS = "id,support,usage,aide,partie_utilisee,clarte,priorite,utile,remarque,frein,hesitation";
const DELAI_REPRISE = 2 * 60 * 1000;

function echapperHtml(texte) {
  return texte.replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[caractere]);
}

function construireNotification(reponse, nomSupport, { destinataire, urlTableau }) {
  const choix = (champ) => OPTIONS[champ][reponse[champ]];
  const sansUsage = reponse.usage === "pas_encore";
  const lignes = [
    ["Utilisation du support", choix("usage")],
    ...(sansUsage ? [
      ["Pourquoi le support n’a pas encore été utilisé", choix("frein")],
      ["Ce qui aiderait à commencer", reponse.remarque],
    ] : [
      ["Le support a-t-il aidé ?", choix("aide")],
      ["Partie la plus utilisée", choix("partie_utilisee")],
      ["Compréhension à la lecture", choix("clarte")],
      ["Amélioration souhaitée en priorité", choix("priorite")],
      ["Détail de la suggestion", reponse.remarque],
      ["Passage qui a aidé", reponse.utile],
    ]),
    ["Hésitation avant l’achat", choix("hesitation")],
  ].filter(([, valeur]) => valeur);

  return {
    sender: { name: "Trajectoire Droit", email: "contact@trajectoiredroit.com" },
    to: [{ email: destinataire, name: "Julien" }],
    subject: "Enquête Trajectoire Droit · " + nomSupport,
    htmlContent: `<div lang="fr" style="max-width:560px;margin:auto;padding:20px 12px;font:16px/1.55 Arial,sans-serif;color:#17283b">
      <p style="margin:0 0 4px">Nouvelle réponse à l’enquête</p>
      <h1 style="font-size:23px;line-height:1.3;margin:0 0 16px;color:#102a43">${echapperHtml(nomSupport)}</h1>
      <p style="margin:0 0 24px"><a href="${echapperHtml(urlTableau)}" style="display:inline-block;padding:10px 14px;background:#155864;color:#fff;text-decoration:none;border-radius:6px">Voir toutes les réponses dans le tableau privé</a></p>
      ${lignes.map(([intitule, valeur]) => `<p style="margin:0 0 14px"><strong>${intitule}</strong><br>${echapperHtml(valeur).replace(/\r?\n/g, "<br>")}</p>`).join("\n")}
    </div>`,
    textContent: `Nouvelle réponse à l’enquête\n${nomSupport}\n\nVoir toutes les réponses dans le tableau privé\n${urlTableau}\n\n`
      + lignes.map(([intitule, valeur]) => `${intitule}\n${valeur}`).join("\n\n"),
    headers: { idempotencyKey: reponse.id },
    tags: ["enquete-supports"],
  };
}

function notificationsDues(date) {
  return `notification_envoyee_le=is.null&notification_a_partir_de=lte.${date}`;
}

async function notifierReponse(id, supports, {
  db = supabase,
  fetchImpl = fetch,
  apiKey = process.env.BREVO_API_KEY,
  destinataire = process.env.ENQUETE_SUPPORTS_EMAIL,
  urlTableau = process.env.ENQUETE_SUPPORTS_TABLEAU_URL,
} = {}) {
  const signal = AbortSignal.timeout(6500);
  try {
    if (!apiKey || !destinataire || !urlTableau) throw new Error("Configuration de notification manquante");
    const maintenant = Date.now();
    const reprise = new Date(maintenant + DELAI_REPRISE).toISOString();
    const [reponse] = await db.mettreAJour(
      TABLE, `id=eq.${id}&${notificationsDues(new Date(maintenant).toISOString())}&select=${CHAMPS}`,
      { notification_a_partir_de: reprise }, { signal }
    );
    if (!reponse) return false;

    const resultat = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
      body: JSON.stringify(construireNotification(reponse, supports[reponse.support] || reponse.support, {
        destinataire, urlTableau,
      })),
      signal,
    });
    if (!resultat.ok) {
      const detail = await resultat.json().catch(() => ({}));
      if (detail.code !== "duplicate_parameter" || !/idempotency/i.test(detail.message || "")) {
        throw Object.assign(new Error("Envoi Brevo impossible"), { code: `brevo_${resultat.status}` });
      }
    }

    const lignes = await db.mettreAJour(
      TABLE, `id=eq.${id}&notification_a_partir_de=eq.${reprise}&notification_envoyee_le=is.null&select=id`,
      { notification_envoyee_le: new Date().toISOString() }, { signal }
    );
    return lignes.length > 0;
  } catch (erreur) {
    console.error("enquete-supports notification", { code: erreur.code || erreur.name });
    return false;
  }
}

async function reprendreNotifications(supports) {
  const lignes = await supabase.selectionner(
    TABLE, `${notificationsDues(new Date().toISOString())}&select=id&order=notification_a_partir_de.asc&limit=20`,
    { signal: AbortSignal.timeout(5000) }
  );
  const resultats = await Promise.all(lignes.map(({ id }) => notifierReponse(id, supports)));
  return { a_envoyer: lignes.length, envoyees: resultats.filter(Boolean).length };
}

module.exports = { construireNotification, notifierReponse, reprendreNotifications };
