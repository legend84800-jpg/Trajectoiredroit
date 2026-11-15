// Relance des inscrits du corrigé offert, trois jours après leur inscription (15/11/2026,
// audit de la routine createur-pages-seo-quotidien, code A1).
//
// Constat de l'audit : aucun des 131 inscrits « corrigé offert » depuis le 01/10 n'avait acheté,
// alors que l'essai des majeures, qui envoie un code de 48 heures sur un produit précis, convertit.
// Chaque jour, la tâche planifiée Vercel (/api/relance-recueil, vercel.json) :
//   1. lit les contacts Brevo inscrits il y a 72 à 124 heures avec SOURCE=corrige-offert ;
//   2. écarte ceux qui sont désinscrits, déjà relancés (attribut RELANCE_RECUEIL), ou qui ont déjà
//      acheté ce recueil (ou n'importe quel produit ces 7 derniers jours) d'après Stripe ;
//   3. crée pour chacun un code Stripe à usage unique de -15 % valable 48 heures, sur le coupon
//      « remise-post-achat-15 », exactement comme les codes ESSAI des majeures ;
//   4. envoie l'email du recueil de sa matière, dont le bouton porte ?code= (le site applique le
//      code tout seul au paiement), puis note RELANCE_RECUEIL sur le contact.
// Le mail 1 de la séquence de bienvenue part à J0 et le mail « Relire ton cours » à J+2, d'où J+3.
// Le lundi, rien ne part, pour laisser au plan gratuit de Brevo (300 envois par jour) la place de
// la newsletter des trois astuces. Une réserve de crédits protège aussi les emails d'achat.
// La même tâche tient à jour MATIERE_NOM et MATIERE_DE, lus par la newsletter (codes A4 et A5).

const crypto = require("crypto");
const PRODUITS = require("./_produits");
const { COMPTES, recueils } = require("./_corriges-exercices");
const { SUJETS, sujetDe, attributsMatiere } = require("./_offres-matieres");

const COUPON = "remise-post-achat-15";
const POURCENTAGE = 15;
const DUREE_CODE_S = 48 * 3600;
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

function dateFin(ts) {
  const d = new Date(ts * 1000);
  const jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(d).replace(/\D/g, "");
  return `${jour} à ${heure} h`;
}

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
  "cas-pratique-": { exercice: "cas pratique", pluriel: "cas pratiques", corriges: "corrigés",
    bien: "les règles que tu avais bien appliquées", manque: "les conditions ou les arrêts qui te manquaient",
    raison: "chaque énoncé oblige à appliquer les règles du cours à des faits différents" },
  "commentaire-arret-": { exercice: "commentaire d'arrêt", pluriel: "commentaires d'arrêt", corriges: "corrigés",
    bien: "ce que tu avais bien compris de la décision", manque: "les explications qui te manquaient sur le sens et la portée de l'arrêt",
    raison: "chaque décision oblige à retrouver la question posée au juge, puis à expliquer sa réponse avec les règles du cours" },
  "dissertation-": { exercice: "dissertation", pluriel: "dissertations", corriges: "corrigées",
    bien: "les idées que tu avais bien trouvées", manque: "les arguments ou les exemples qui te manquaient dans ton plan",
    raison: "chaque sujet oblige à construire un plan différent à partir des notions du cours" },
};
const typeDe = id => TYPES[Object.keys(TYPES).find(p => id.startsWith(p))];

function recueilValide(id) {
  return typeof id === "string" && COMPTES[id] !== undefined && Boolean(PRODUITS[id]) && !PRODUITS[id].venteSuspendue && Boolean(typeDe(id));
}

function urlRecueil(id, code) {
  const p = new URLSearchParams({ produit: id, utm_source: "brevo", utm_medium: "email", utm_campaign: "relance-recueil", utm_content: id });
  if (code) p.set("code", code);
  return `${SITE}/corriges.html?${p.toString()}#recueil-selectionne`;
}

// Données de l'email, à partir de la matière du contact et du code créé pour lui.
function donneesRelance(contact, remise) {
  const id = contact.attributes.MATIERE;
  const produit = PRODUITS[id];
  const t = typeDe(id);
  const info = recueils().find(r => r.id === id);
  const cle = sujetDe(id);
  const prix = produit.prix;
  return {
    MATIERE: id,
    EXERCICE: t.exercice,
    RAISON: t.raison,
    // Corrigé offert d'une page de matière (lead.js, CORRIGE_PARTIELS renseigné) ou corrigé d'un
    // exercice précis (_corriges-exercices.js, CORRIGE_PARTIELS à 0 et titre de l'exercice).
    TELECHARGE: contact.attributes.CORRIGE_PARTIELS && contact.attributes.CORRIGE_PARTIELS !== "0" || !contact.attributes.CORRIGE_MATIERE
      ? `le ${t.exercice} corrigé ${cle ? deNom(SUJETS[cle].nom) : "de ta matière"}`
      : `« ${contact.attributes.CORRIGE_MATIERE} »`,
    BIEN: t.bien,
    MANQUE: t.manque,
    RECUEIL: cle ? deNom(SUJETS[cle].nom) : produit.nom,
    NOMBRE: String(info ? info.nombre : COMPTES[id]),
    TYPE: info && info.type === "cas pratiques et sujets de partiel" ? "cas pratiques et sujets de partiel" : t.pluriel,
    CORRIGES: t.corriges,
    OBJET_FORMAT: (t.pluriel === "dissertations" ? "les dissertations corrigées " : "les " + t.pluriel + " corrigés ")
      + (cle ? deNom(SUJETS[cle].nom) : "de " + minInitiale(produit.nom)),
    PRIX: euros(prix),
    PRIX_REMISE: euros(prix - Math.round(prix * POURCENTAGE / 100)),
    CODE: remise.code,
    FIN: dateFin(remise.expire),
    URL: urlRecueil(id, remise.code),
  };
}

// Texte passé par redaction-julien (checklist, passe adversariale, vale, verificateur_anti_ia.py,
// verificateur_style_positif.py) le 15/11/2026. Signature et formule de question reprises des mails
// de bienvenue réécrits par Julien le 14/11/2026.
function construireEmailRelance(d, lienStop) {
  const paragraphes = [
    "Salut,",
    `Il y a quelques jours, tu as téléchargé ${d.TELECHARGE}. Si tu as d'abord fait l'exercice sans regarder la correction, tu as pu repérer ${d.BIEN}, mais aussi ${d.MANQUE}.`,
    `Pour progresser en ${d.EXERCICE}, il faut refaire ce travail sur d'autres sujets de la même matière. En effet, ${d.RAISON}. Ainsi, en comparant plusieurs corrections, tu repères les erreurs qui reviennent dans tes copies et tu les corriges avant le partiel.`,
    `Le recueil ${d.RECUEIL} réunit ${d.NOMBRE} ${d.TYPE} ${d.CORRIGES} en entier. Il coûte normalement ${d.PRIX}, mais je te propose un code de -15 % valable 48 heures. Ton code est ${d.CODE}, donc le recueil passe à ${d.PRIX_REMISE}. Le bouton ci-dessous applique d'ailleurs le code tout seul au paiement, jusqu'au ${d.FIN}.`,
    { lien: d.URL, texte: "Voir le recueil avec -15 %" },
    "Si tu as une question sur le corrigé, n'hésite pas à m'envoyer un message en répondant à ce mail.",
    "Respectueusement,\nJulien\nTrajectoire Droit",
  ];
  const pied = "Tu reçois cet email parce que tu as demandé un corrigé sur trajectoiredroit.com.";
  const html = '<html lang="fr"><body style="font:16px Arial;line-height:1.6;max-width:580px;margin:30px auto;padding:20px;color:#1F1F1F">'
    + paragraphes.map(p => typeof p === "string" ? "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"
      : '<p><a href="' + esc(p.lien) + '" style="display:inline-block;padding:11px 18px;background:#1A2851;color:#fff;border-radius:8px;font-weight:bold;text-decoration:none">' + esc(p.texte) + "</a></p>").join("")
    + '<p style="font-size:12px;color:#6B7280;margin-top:32px">' + esc(pied)
    + (lienStop ? ' <a href="' + esc(lienStop) + '" style="color:#6B7280">Ne plus recevoir mes emails</a>' : "") + "</p>"
    + "</body></html>";
  const texte = paragraphes.map(p => typeof p === "string" ? p : p.texte + "\n" + p.lien).join("\n\n")
    + "\n\n" + pied + (lienStop ? "\nNe plus recevoir mes emails : " + lienStop : "");
  return { sujet: `-15 % sur ${d.OBJET_FORMAT}, jusqu'au ${d.FIN}`, html, texte };
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
      const compte = await appel("/account");
      const plan = (compte.plan || []).find(x => x.creditsType === "sendLimit");
      return plan ? Number(plan.credits) : Infinity;
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

async function creerCode(stripe, produitId, email, jour) {
  const code = "RECUEIL-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const expire = Math.floor(Date.now() / 1000) + DUREE_CODE_S;
  const promo = await stripe.promotionCodes.create({
    code, active: true, expires_at: expire, max_redemptions: 1,
    promotion: { type: "coupon", coupon: COUPON },
    metadata: { campaign: "relance-recueil", produit: produitId },
  }, { idempotencyKey: "relance-recueil-" + crypto.createHash("sha256").update(email + jour).digest("hex").slice(0, 24) });
  return { code: promo.code, expire: promo.expires_at || expire };
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
  if (estLundiParis(maintenant) && !options.ignorerLundi) { bilan.pause = "lundi, newsletter des trois astuces"; return bilan; }
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
      const remise = await creerCode(stripe, produitId, email, jour);
      const lienStop = secret ? `${SITE}/api/relance-recueil?stop=${jetonStop(email, secret)}` : "";
      const contenu = construireEmailRelance(donneesRelance(c, remise), lienStop);
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
      await api.majContact(email, { RELANCE_RECUEIL: `${jour} ${remise.code}` })
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
