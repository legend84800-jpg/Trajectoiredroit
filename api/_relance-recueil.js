// Relance des inscrits du corrigé offert, trois jours après leur inscription (15/11/2026,
// audit de la routine createur-pages-seo-quotidien, code A1).
//
// Constat de l'audit : aucun des 131 inscrits « corrigé offert » depuis le 01/10 n'avait acheté,
// alors que l'essai des majeures, qui envoie un code de 48 heures sur un produit précis, convertit.
// Chaque jour, la tâche planifiée Vercel (/api/relance-recueil, vercel.json) :
//   1. lit les contacts Brevo inscrits il y a 72 à 124 heures avec SOURCE=corrige-offert ;
//   2. écarte ceux qui sont désinscrits, déjà relancés (attribut RELANCE_RECUEIL), ou qui ont déjà
//      acheté ce recueil (ou n'importe quel produit ces 7 derniers jours) d'après Stripe ;
//   3. envoie l'email du recueil de sa matière, avec un lien direct vers sa page, puis note
//      RELANCE_RECUEIL sur le contact.
// Depuis le 23/11/2026 (proposition C40), la relance ne crée plus de code de réduction : sur
// 52 codes COMPILATION de -15 % envoyés, aucun n'a servi. Le mail mène au même produit que la
// dernière page du PDF offert et que le mail de livraison (api/_offre-pdf.js).
// Le mail 1 de la séquence de bienvenue part à J0 et le mail « Relire ton cours » à J+2, d'où J+3.
// Tant que le compte Brevo est sur le plan gratuit (300 envois par jour), rien ne part le lundi,
// pour laisser la place à la newsletter des trois astuces. Depuis le passage à Starter (16/11/2026,
// crédits mensuels), la pause du lundi saute d'elle-même. Une réserve de crédits protège toujours
// les emails d'achat.
// La même tâche tient à jour MATIERE_NOM et MATIERE_DE, lus par la newsletter (codes A4 et A5).

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { COMPTES, recueils } = require("./_corriges-exercices");
const { SUJETS, sujetDe, attributsMatiere } = require("./_offres-matieres");

const FENETRE_H = [72, 124];
const LISTE_LEADS = 3;
const RESERVE_CREDITS = 100;
const MAX_ENVOIS = 40;
const SITE = "https://trajectoiredroit.com";

const euros = c => (c / 100).toFixed(2).replace(".", ",") + " €";
const esc = x => String(x).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const minInitiale = t => t.charAt(0).toLowerCase() + t.slice(1);
// « Droit des biens L2 » donne « de droit des biens L2 », « Introduction au droit L1 » donne « d'introduction au droit L1 ».
const deNom = nom => (/^[aeiouhéèêàâîôûAEIOUHÉ]/.test(nom) ? "d'" : "de ") + minInitiale(nom);

function estLundiParis(maintenant) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Paris" }).format(new Date(maintenant)) === "Mon";
}

// Jeton du lien de désinscription : l'adresse et une signature, pour qu'un lien ne puisse servir
// qu'à l'adresse qui l'a reçu.
function signer(email, secret) {
  return crypto.createHmac("sha256", secret).update("stop:" + email).digest("hex").slice(0, 20);
}
function jetonStop(email, secret) {
  return Buffer.from(email).toString("base64url") + "." + signer(email, secret);
}
function lireJetonStop(jeton, secret) {
  const [b, sig] = String(jeton || "").split(".");
  if (!b || !sig || !secret) return null;
  let email = "";
  try { email = Buffer.from(b, "base64url").toString("utf8"); } catch { return null; }
  const attendu = signer(email, secret);
  if (sig.length !== attendu.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(attendu))) return null;
  return email;
}

// Formats d'exercice, pour accorder le texte au recueil de la matière.
const TYPES = {
  "cas-pratique-": { exercice: "cas pratique", offert: "le cas pratique corrigé", pluriel: "cas pratiques", corriges: "corrigés",
    bien: "les règles de droit que tu avais bien appliquées", manque: "les conditions ou les arrêts qui te manquaient" },
  "commentaire-arret-": { exercice: "commentaire d'arrêt", offert: "le commentaire d'arrêt corrigé", pluriel: "commentaires d'arrêt", corriges: "corrigés",
    bien: "ce que tu avais bien compris de la décision", manque: "les explications qui te manquaient sur le sens et la portée de l'arrêt" },
  "dissertation-": { exercice: "dissertation", offert: "la dissertation corrigée", pluriel: "dissertations", corriges: "corrigées",
    bien: "les idées que tu avais bien trouvées", manque: "les arguments ou les exemples qui te manquaient dans ton plan" },
};
const typeDe = id => TYPES[Object.keys(TYPES).find(p => id.startsWith(p))];

function recueilValide(id) {
  return typeof id === "string" && COMPTES[id] !== undefined && Boolean(PRODUITS[id]) && !PRODUITS[id].venteSuspendue && Boolean(typeDe(id));
}

function urlRecueil(id) {
  const p = new URLSearchParams({ produit: id, utm_source: "brevo", utm_medium: "email", utm_campaign: "relance-recueil", utm_content: id });
  return `${SITE}/corriges.html?${p.toString()}#recueil-selectionne`;
}

// Données de l'email, à partir de la matière du contact.
function donneesRelance(contact) {
  const id = contact.attributes.MATIERE;
  const produit = PRODUITS[id];
  const t = typeDe(id);
  const info = recueils().find(r => r.id === id);
  const cle = sujetDe(id);
  const matiere = cle ? deNom(SUJETS[cle].nom) : "de ta matière";
  const themes = matiere.replace(/ L[123](?: S[12])?$/, "").replace(/^de droit\b/, "du droit");
  // Le nom du produit précise le semestre, y compris quand il est absent de l'identifiant.
  const niveauProduit = produit.nom.match(/ L([123])(?: S([12]))?$/);
  const niveau = niveauProduit
    ? [niveauProduit[2] && `semestre ${niveauProduit[2]}`, `licence ${niveauProduit[1]}`].filter(Boolean).join(", ")
    : "";
  const prix = produit.prix;
  return {
    MATIERE: id,
    PRENOM: contact.attributes.PRENOM?.trim() || contact.attributes.FIRSTNAME?.trim() || "",
    EXERCICE: t.exercice,
    // Corrigé offert d'une page de matière (lead.js, CORRIGE_PARTIELS renseigné) ou corrigé d'un
    // exercice précis (_corriges-exercices.js, CORRIGE_PARTIELS à 0 et titre de l'exercice).
    TELECHARGE: contact.attributes.CORRIGE_PARTIELS && contact.attributes.CORRIGE_PARTIELS !== "0" || !contact.attributes.CORRIGE_MATIERE
      ? `${t.offert} ${matiere}`
      : `« ${contact.attributes.CORRIGE_MATIERE} »`,
    BIEN: t.bien,
    MANQUE: t.manque,
    MATIERE_NIVEAU: niveau ? `${themes} (${niveau})` : themes,
    NOMBRE: String(info ? info.nombre : COMPTES[id]),
    TYPE: t.pluriel,
    OBJET_FORMAT: `Les ${t.pluriel} ${t.corriges} ${cle ? matiere : "de " + minInitiale(produit.nom)}`,
    BOUTON: `Voir les ${t.pluriel} ${t.corriges} ${cle ? matiere : "de " + minInitiale(produit.nom)}`,
    PRIX: euros(prix),
    URL: urlRecueil(id),
  };
}

function construireEmailRelance(d, lienStop) {
  const nombreExercices = `${d.NOMBRE} ${d.TYPE}`;
  const paragraphes = [
    { texte: d.PRENOM ? `Salut ${d.PRENOM},` : "Salut," },
    {
      texte: `Il y a quelques jours, tu as téléchargé ${d.TELECHARGE}. Si tu as d’abord fait l’exercice sans regarder la correction, tu as pu repérer ${d.BIEN}, mais aussi ${d.MANQUE}.`,
      gras: ["fait l’exercice sans regarder la correction"],
    },
    {
      texte: `Pour progresser en ${d.EXERCICE}, il faut refaire ce travail sur d’autres sujets de la même matière afin de maîtriser les différents thèmes de cette dernière. Ainsi, en t’exerçant sur des exercices spécifiquement adaptés à tout ton cours, tu développes un niveau qui te permettra de viser plus de 15 sur 20 lors de ton partiel.`,
      gras: ["viser plus de 15 sur 20"],
    },
    {
      texte: `C’est pour cela que j’ai créé et corrigé moi-même, étape par étape, de manière ultra complète et pédagogique, ${nombreExercices} sur les différents thèmes ${d.MATIERE_NIVEAU}. Je les vends dans ma compilation de corrigés.`,
      gras: ["ultra complète et pédagogique", nombreExercices, d.MATIERE_NIVEAU],
    },
    {
      texte: `La compilation coûte ${d.PRIX}. Le bouton ci-dessous t’amène directement sur sa page, et tu reçois le PDF par email dès que le paiement est validé.`,
      gras: [d.PRIX],
    },
    { lien: d.URL, texte: d.BOUTON },
    { texte: "Si tu as une question sur le corrigé, n'hésite pas à m'envoyer un message en répondant à ce mail." },
    { texte: "Respectueusement,\nJulien\nTrajectoire Droit" },
  ];
  const pied = "Tu reçois cet email parce que tu as demandé un corrigé sur trajectoiredroit.com.";
  const desinscription = "Se désinscrire de ces emails";
  const corps = paragraphes.map(p => {
    let contenu = esc(p.texte).replace(/\n/g, "<br>");
    for (const groupe of p.gras || []) {
      if (groupe) contenu = contenu.replace(esc(groupe), mot => `<strong>${mot}</strong>`);
    }
    if (p.lien) {
      contenu = '<a href="' + esc(p.lien) + '" style="display:inline-block;padding:11px 18px;background:#1A2851;color:#fff;border-radius:8px;font-weight:bold;text-decoration:none">' + contenu + "</a>";
    }
    return '<p style="margin:0 0 24px">' + contenu + "</p>";
  }).join("");
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;font:16px Arial,sans-serif;line-height:1.6;color:#1F1F1F">'
    + '<div style="display:none;visibility:hidden;mso-hide:all;max-height:0;overflow:hidden">Les autres sujets de ta matière, corrigés étape par étape.</div>'
    + '<div style="box-sizing:border-box;max-width:600px;margin:0 auto;padding:18px">' + corps
    + '<p style="font-size:11px;color:#6B7280;margin:32px 0 0">' + esc(pied)
    + (lienStop ? '<br><a href="' + esc(lienStop) + '" style="color:#6B7280;text-decoration:none">' + desinscription + "</a>" : "") + "</p>"
    + "</div></body></html>";
  const texte = paragraphes.map(p => p.lien ? p.texte + "\n" + p.lien : p.texte).join("\n\n")
    + "\n\n" + pied + (lienStop ? "\n" + desinscription + "\n" + lienStop : "");
  return { sujet: d.OBJET_FORMAT, html, texte };
}

// ---------- Accès Brevo et Stripe ----------

function brevo(apiKey) {
  const appel = async (chemin, options = {}) => {
    const resp = await fetch("https://api.brevo.com/v3" + chemin, {
      ...options,
      headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json", ...(options.headers || {}) },
    });
    if (!resp.ok) throw new Error(`Brevo ${resp.status} ${chemin.split("?")[0]}: ${(await resp.text()).slice(0, 200)}`);
    return resp.status === 204 ? {} : resp.json().catch(() => ({}));
  };
  return {
    async contactsDepuis(champ, depuis) {
      const tous = [];
      for (let offset = 0; offset < 5000; offset += 500) {
        const p = new URLSearchParams({ limit: "500", offset: String(offset), [champ]: depuis.toISOString() });
        const page = await appel("/contacts?" + p.toString());
        tous.push(...(page.contacts || []));
        if (!page.contacts || page.contacts.length < 500) break;
      }
      return tous;
    },
    async credits() {
      return (await this.plan()).credits;
    },
    // Crédits restants et type d'offre. Le plan gratuit compte ses crédits par jour, une offre payante
    // les compte par mois. Sans réponse lisible, on suppose le plan gratuit, le cas le plus prudent.
    async plan() {
      const compte = await appel("/account");
      const plans = compte.plan || [];
      const envoi = plans.find(x => x.creditsType === "sendLimit");
      return {
        credits: envoi ? Number(envoi.credits) : Infinity,
        gratuit: plans.length === 0 || plans.some(x => x.type === "free"),
      };
    },
    majContact: (email, attributs) => appel("/contacts/" + encodeURIComponent(email), { method: "PUT", body: JSON.stringify({ attributes: attributs }) }),
    bloquer: email => appel("/contacts/" + encodeURIComponent(email), { method: "PUT", body: JSON.stringify({ emailBlacklisted: true }) }),
    envoyer: (corps) => appel("/smtp/email", { method: "POST", body: JSON.stringify(corps) }),
  };
}

function stripeClient(cle) {
  return require("stripe")(cle, { timeout: 8000, maxNetworkRetries: 1 });
}

async function dejaAcheteur(stripe, email, produitId, maintenant) {
  const liste = await stripe.checkout.sessions.list({ customer_details: { email }, status: "complete", limit: 20 });
  return (liste.data || []).some(s => {
    const ids = String((s.metadata || {}).produitIds || "").split(",").map(x => x.trim());
    const recent = (maintenant / 1000 - s.created) < 7 * 86400;
    return ids.includes(produitId) || recent;
  });
}

function eligible(contact, maintenant) {
  const a = contact.attributes || {};
  const age = (maintenant - new Date(contact.createdAt).getTime()) / 3600000;
  if (a.SOURCE !== "corrige-offert" || !recueilValide(a.MATIERE)) return "hors-cible";
  if (age < FENETRE_H[0] || age > FENETRE_H[1]) return "hors-fenetre";
  if (contact.emailBlacklisted) return "desinscrit";
  if (!(contact.listIds || []).includes(LISTE_LEADS) || (contact.listUnsubscribed || []).includes(LISTE_LEADS)) return "hors-liste";
  if (a.RELANCE_RECUEIL) return "deja-relance";
  return "";
}

// ---------- Passage quotidien ----------

async function passer(options = {}) {
  const maintenant = options.maintenant || Date.now();
  const essai = Boolean(options.essai);
  const api = options.brevo || brevo(process.env.BREVO_API_KEY);
  const stripe = options.stripe || stripeClient(process.env.STRIPE_SECRET_KEY);
  const secret = process.env.CRON_SECRET || "";
  const jour = new Date(maintenant).toISOString().slice(0, 10);
  const bilan = { jour, essai, matieresMisesAJour: 0, examines: 0, envoyes: 0, ecartes: {}, erreurs: [] };
  const ecarter = r => { bilan.ecartes[r] = (bilan.ecartes[r] || 0) + 1; };

  // 1. MATIERE_NOM et MATIERE_DE des contacts modifiés depuis trois jours (newsletter, A5).
  const modifies = await api.contactsDepuis("modifiedSince", new Date(maintenant - 3 * 86400000));
  for (const c of modifies) {
    const a = c.attributes || {};
    if (!a.MATIERE) continue;
    const voulu = attributsMatiere(a.MATIERE);
    if (!voulu.MATIERE_DE || (a.MATIERE_NOM === voulu.MATIERE_NOM && a.MATIERE_DE === voulu.MATIERE_DE)) continue;
    if (essai) { bilan.matieresMisesAJour++; continue; }
    try { await api.majContact(c.email, voulu); bilan.matieresMisesAJour++; } catch (e) { bilan.erreurs.push("matiere: " + e.message); }
  }

  // 2. Relance du recueil (A1).
  if (estLundiParis(maintenant) && !options.ignorerLundi && (await api.plan()).gratuit) {
    bilan.pause = "lundi, newsletter des trois astuces (plan Brevo gratuit)";
    return bilan;
  }
  const crees = await api.contactsDepuis("createdSince", new Date(maintenant - FENETRE_H[1] * 3600000));
  let credits = essai ? Infinity : await api.credits();
  for (const c of crees) {
    const raison = eligible(c, maintenant);
    if (raison === "hors-cible" || raison === "hors-fenetre") continue;
    bilan.examines++;
    if (raison) { ecarter(raison); continue; }
    const email = c.email;
    const produitId = c.attributes.MATIERE;
    try {
      if (await dejaAcheteur(stripe, email, produitId, maintenant)) { ecarter("acheteur"); continue; }
      if (credits <= RESERVE_CREDITS) { ecarter("credits-brevo"); continue; }
      if (bilan.envoyes >= MAX_ENVOIS) { ecarter("plafond-du-jour"); continue; }
      if (essai) { bilan.envoyes++; continue; }
      const lienStop = secret ? `${SITE}/api/relance-recueil?stop=${jetonStop(email, secret)}` : "";
      const contenu = construireEmailRelance(donneesRelance(c), lienStop);
      await api.envoyer({
        sender: { name: "Trajectoire Droit", email: "contact@trajectoiredroit.com" },
        to: [{ email }],
        replyTo: { email: "julien.prof1@gmail.com", name: "Julien" },
        subject: contenu.sujet, htmlContent: contenu.html, textContent: contenu.texte,
        headers: lienStop ? { "List-Unsubscribe": `<${lienStop}>` } : undefined,
        tags: ["relance-recueil", produitId],
      });
      credits--;
      bilan.envoyes++;
      await api.majContact(email, { RELANCE_RECUEIL: `${jour} lien-direct` })
        .catch(e => bilan.erreurs.push("marque: " + e.message));
    } catch (e) {
      bilan.erreurs.push(e.message ? e.message.slice(0, 200) : "erreur inconnue");
    }
  }
  return bilan;
}

module.exports = {
  passer, construireEmailRelance, donneesRelance, eligible, recueilValide, jetonStop, lireJetonStop,
  brevo, estLundiParis, FENETRE_H, RESERVE_CREDITS,
};
