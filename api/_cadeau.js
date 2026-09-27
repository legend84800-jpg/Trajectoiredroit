// Offrir un Pack Ultra (ajouté le 27/09/2026). Le parent paie sur parents.html,
// en 1, 2 ou 3 fois, et indique l'email de l'étudiant avec un prénom et un message
// facultatifs. Ces champs voyagent dans la metadata de la session Stripe (500
// caractères au plus par valeur) : le webhook livre alors le pack et les PDF
// nominatifs à l'étudiant, et envoie au parent une confirmation sans les fichiers.
// Aucune carte cadeau ni aucun code à gérer.

const LIMITES = { email: 200, prenom: 40, message: 300 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function nettoyerLigne(valeur, max) {
  if (typeof valeur !== "string") return "";
  return valeur.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function nettoyerMessage(valeur, max) {
  if (typeof valeur !== "string") return "";
  return valeur
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0b-\x1f\x7f]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

function emailValide(valeur) {
  return typeof valeur === "string" && valeur.length <= LIMITES.email && EMAIL_RE.test(valeur);
}

// Lit les champs cadeau envoyés par le formulaire. Retourne null quand aucun
// email n'est fourni (achat classique), { erreur } quand l'email est invalide.
function lireCadeauFormulaire(corps) {
  const brut = corps && typeof corps.cadeauEmail === "string" ? corps.cadeauEmail.trim() : "";
  if (!brut) return null;
  const email = brut.toLowerCase();
  if (!emailValide(email)) return { erreur: "cadeau_email_invalide" };
  return {
    email,
    prenom: nettoyerLigne(corps.cadeauPrenom, LIMITES.prenom),
    message: nettoyerMessage(corps.cadeauMessage, LIMITES.message),
  };
}

// Relit le cadeau depuis la metadata d'une session payée (webhook, personnalisation).
function cadeauDepuisMetadata(metadata) {
  const email = metadata && typeof metadata.cadeauEmail === "string"
    ? metadata.cadeauEmail.trim().toLowerCase()
    : "";
  if (!emailValide(email)) return null;
  return {
    email,
    prenom: nettoyerLigne(metadata.cadeauPrenom, LIMITES.prenom),
    message: nettoyerMessage(metadata.cadeauMessage, LIMITES.message),
  };
}

function metadataCadeau(cadeau) {
  const metadata = { cadeauEmail: cadeau.email };
  if (cadeau.prenom) metadata.cadeauPrenom = cadeau.prenom;
  if (cadeau.message) metadata.cadeauMessage = cadeau.message;
  return metadata;
}

function euros(centimes) {
  return (centimes / 100).toFixed(2).replace(".", ",") + " €";
}

// Le nom du porteur de carte arrive parfois tout en majuscules ou en minuscules.
function formaterNomOffrant(nom) {
  const propre = nettoyerLigne(nom, 60);
  if (!propre) return "";
  if (propre !== propre.toUpperCase() && propre !== propre.toLowerCase()) return propre;
  return propre.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, lettre) => sep + lettre.toUpperCase());
}

// « Le Pack Ultra L1 semestre 1 » devient « le Pack Ultra L1 semestre 1 » en milieu de phrase.
function nomEnPhrase(nom) {
  return String(nom).replace(/^Le /, "le ");
}

// Textes affichés par Stripe au parent, qui paie pour quelqu'un d'autre.
function descriptionProduitCadeau(produit, cadeau, nombreEcheances) {
  // Même décompte que le tableau de parents.html (31 documents pour L1 S1).
  const nombre = Array.isArray(produit.inclus) ? produit.inclus.length : (produit.blobs || []).length;
  const moment = nombreEcheances ? "dès le premier paiement" : "dès le paiement validé";
  return `Cadeau pour ${cadeau.email}, qui reçoit les ${nombre} ressources du pack par email ${moment} et les garde à vie avec leurs mises à jour.`;
}

function messagePaiementCadeau(cadeau, produit, nombreEcheances, montantEcheance) {
  const avecMessage = cadeau.message ? ", avec votre message" : "";
  if (!nombreEcheances) {
    return `Dès que le paiement est validé, le pack part par email chez ${cadeau.email}${avecMessage}. `
      + "Vous recevez de votre côté une confirmation d'achat.";
  }
  const total = montantEcheance * nombreEcheances;
  const suite = nombreEcheances === 2
    ? ` et ${euros(montantEcheance)} dans un mois`
    : `, puis ${euros(montantEcheance)} chacun des deux mois suivants`;
  return `Vous payez ${euros(montantEcheance)} aujourd'hui${suite}, soit ${euros(total)} au total. `
    + `Les prélèvements s'arrêtent ensuite automatiquement. Le pack, lui, part en entier chez ${cadeau.email} dès le premier paiement${avecMessage}.`;
}

// Applique le cadeau aux paramètres Checkout finaux (paiement unique ou abonnement borné).
function appliquerCadeauCheckout(params, produit, cadeau, nombreEcheances, montantEcheance) {
  const suite = { ...params };
  suite.metadata = { ...params.metadata, ...metadataCadeau(cadeau) };
  suite.line_items = params.line_items.map((ligne, i) => (i === 0
    ? {
      ...ligne,
      price_data: {
        ...ligne.price_data,
        product_data: {
          name: ligne.price_data.product_data.name,
          description: descriptionProduitCadeau(produit, cadeau, nombreEcheances),
        },
      },
    }
    : ligne));
  suite.custom_text = {
    submit: { message: messagePaiementCadeau(cadeau, produit, nombreEcheances, montantEcheance) },
  };
  if (suite.subscription_data) {
    suite.subscription_data = {
      ...suite.subscription_data,
      metadata: { ...suite.subscription_data.metadata, cadeau: "1" },
    };
  }
  if (suite.payment_intent_data) {
    suite.payment_intent_data = {
      ...suite.payment_intent_data,
      metadata: { ...suite.payment_intent_data.metadata, cadeau: "1" },
    };
  }
  return suite;
}

function echapperHtml(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

const STYLE_P = "font-size:15px;color:#333;line-height:1.6;margin:0 0 20px;";
const STYLE_BOUTON = "display:inline-block;margin:8px 0 24px;padding:12px 24px;background:#1a237e;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;";
const URL_COMPTE = "https://trajectoiredroit.com/mon-compte.html";

function gabarit(titre, corps) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a237e;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">TrajectoireDroit</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:18px;font-weight:700;color:#1a237e;margin:0 0 24px;">${titre}</p>
          ${corps}
          <p style="font-size:15px;color:#1a237e;font-weight:700;margin:0;">Julien</p>
        </td></tr>
        <tr><td style="background:#f0f0f0;padding:16px 32px;">
          <p style="font-size:12px;color:#999;margin:0;">TrajectoireDroit, la référence francophone en droit</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Email à l'étudiant : il annonce le cadeau, reprend le message du parent et
// donne l'accès au pack. Tutoiement, comme tous les emails aux étudiants.
function construireEmailEtudiant({ cadeau, nomOffrant, produits, liens }) {
  const nomsPack = produits.map((p) => p.nom).join(" + ");
  const nomsPhrase = nomEnPhrase(nomsPack);
  const offrant = nomOffrant || "";
  const sujet = `${offrant || "On"} t'offre ${nomsPhrase}`;
  const titre = "Tu as reçu le Pack Ultra en cadeau";
  const salutation = cadeau.prenom ? `Bonjour ${cadeau.prenom},` : "Bonjour,";
  const annonce = `${offrant || "Quelqu'un de ton entourage"} vient de t'offrir ${nomsPhrase} sur Trajectoire Droit. `
    + "Tu as donc accès dès maintenant à toutes les ressources publiées pour ce semestre, et tu les gardes à vie.";
  const acces = "Pour télécharger les fichiers, connecte-toi à ton espace Mon compte avec l'adresse email qui reçoit ce message. "
    + "Tu y retrouves chaque ressource du pack. Les mises à jour qui suivent une réforme ou un nouvel arrêt important s'y ajoutent ensuite sans supplément.";
  const licence = "Chaque PDF porte ton nom et une partie de ton adresse email, puisque la licence du pack est personnelle. Je te fais donc confiance pour garder ces fichiers pour toi.";
  const aide = "Au moindre problème, tu peux me répondre directement sur cet email. Je réponds sous 24 heures.";

  const blocMessage = cadeau.message
    ? `<p style="${STYLE_P}">Voici le message qui accompagne ce cadeau :</p>
          <blockquote style="margin:0 0 24px;padding:14px 18px;border-left:3px solid #c9a227;background:#faf6ea;font-size:15px;color:#333;line-height:1.6;font-style:italic;">${echapperHtml(cadeau.message).replace(/\n/g, "<br>")}</blockquote>`
    : "";
  const boutonsFichiers = (liens || []).map((l) => `<a href="${l.url}" style="${STYLE_BOUTON}">Télécharger ${echapperHtml(l.nom)}</a><br>`).join("\n");

  const html = gabarit(titre, `
          <p style="${STYLE_P}">${echapperHtml(salutation)}</p>
          <p style="${STYLE_P}">${echapperHtml(annonce).replace(echapperHtml(nomsPhrase), `<strong>${echapperHtml(nomsPhrase)}</strong>`)}</p>
          ${blocMessage}
          <p style="${STYLE_P}">${echapperHtml(acces)}</p>
          <a href="${URL_COMPTE}" style="${STYLE_BOUTON}">Accéder à mon Pack Ultra</a><br>
          ${boutonsFichiers}
          <p style="${STYLE_P}">${echapperHtml(licence)}</p>
          <p style="${STYLE_P}">${echapperHtml(aide)}</p>`);

  const texte = [
    salutation,
    annonce,
    cadeau.message ? `Voici le message qui accompagne ce cadeau :\n« ${cadeau.message} »` : "",
    `${acces}\n${URL_COMPTE}`,
    (liens || []).length ? (liens || []).map((l) => `${l.nom} : ${l.url}`).join("\n") : "",
    licence,
    aide,
    "Julien, TrajectoireDroit",
  ].filter(Boolean).join("\n\n");

  return { sujet, html, texte };
}

// Confirmation au parent : le pack est parti chez l'étudiant, sans les fichiers.
// Vouvoiement, comme sur parents.html.
function construireEmailParent({ cadeau, produits, metadata, montantCentimes, codePromo }) {
  const nomsPack = nomEnPhrase(produits.map((p) => p.nom).join(" + "));
  const destinataire = cadeau.prenom ? `${cadeau.prenom} (${cadeau.email})` : cadeau.email;
  const beneficiaire = cadeau.prenom || "l'étudiant";
  const nombreEcheances = Number(metadata && metadata.echeances) || 0;
  const montantEcheance = Number(metadata && metadata.montantEcheance) || 0;

  const sujet = `Votre cadeau est bien parti chez ${cadeau.prenom || cadeau.email}`;
  const titre = "Votre cadeau est bien parti";
  const annonce = `Merci pour votre achat. Vous avez offert ${nomsPack} à ${destinataire}, `
    + `et je viens de lui envoyer le pack par email${cadeau.message ? ", accompagné de votre message" : ""}.`;
  let paiement = "";
  if (nombreEcheances && montantEcheance) {
    const suite = nombreEcheances === 2
      ? "le second, du même montant, aura lieu dans un mois"
      : "les deux suivants, du même montant, auront lieu à un mois d'intervalle";
    paiement = `Vous avez choisi de payer en ${nombreEcheances} fois, soit ${euros(montantEcheance * nombreEcheances)} au total. `
      + `Le premier prélèvement de ${euros(montantEcheance)} a eu lieu aujourd'hui, et ${suite}. Les prélèvements s'arrêtent ensuite automatiquement.`;
  } else if (Number.isFinite(montantCentimes) && montantCentimes > 0) {
    paiement = `Votre paiement de ${euros(montantCentimes)} a bien été reçu.`;
  }
  const reduction = codePromo ? `La réduction du code ${codePromo} a bien été appliquée.` : "";
  const acces = `Pour ouvrir le pack, ${beneficiaire} se connecte à son espace Mon compte sur trajectoiredroit.com avec l'adresse ${cadeau.email}. `
    + "Les fichiers y portent son nom et restent disponibles à vie, avec leurs mises à jour.";
  const indesirables = "Si l'email du cadeau n'apparaît pas dans sa boîte de réception, il se trouve sans doute dans ses courriers indésirables. "
    + "En cas d'erreur dans l'adresse, il vous suffit de répondre à cet email, et j'envoie alors le pack à la bonne adresse.";
  const contact = "Pour toute autre question, vous pouvez aussi me joindre sur WhatsApp au +33 6 05 41 85 21.";

  const paragraphes = ["Bonjour,", annonce, paiement, reduction, acces, indesirables, contact].filter(Boolean);
  const html = gabarit(titre, paragraphes
    .map((p) => `<p style="${STYLE_P}">${p === annonce
      ? echapperHtml(p).replace(echapperHtml(nomsPack), `<strong>${echapperHtml(nomsPack)}</strong>`)
      : echapperHtml(p)}</p>`)
    .join("\n          "));
  const texte = `${paragraphes.join("\n\n")}\n\nJulien, TrajectoireDroit`;
  return { sujet, html, texte };
}

module.exports = {
  LIMITES,
  emailValide,
  lireCadeauFormulaire,
  cadeauDepuisMetadata,
  metadataCadeau,
  formaterNomOffrant,
  descriptionProduitCadeau,
  messagePaiementCadeau,
  appliquerCadeauCheckout,
  construireEmailEtudiant,
  construireEmailParent,
};
