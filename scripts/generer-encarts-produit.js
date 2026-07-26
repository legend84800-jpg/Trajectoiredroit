// Vague 2 (2.1, 2.2) : injecte un encart produit compact + la sticky bar sur les pages de trafic SEO
// qui n'avaient encore aucun pont vers la vente (fiches d'arrêt, fiche-revision, comment-reviser).
// Idempotent : relancer le script ne duplique rien (marqueurs HTML vérifiés avant insertion).
const fs = require("fs");
const path = require("path");
const { MATIERES, ARRETS_VERS_MATIERE, REVISION_VERS_MATIERE, PAGES_GENERIQUES } = require("./mapping-matieres");

const ROOT = path.join(__dirname, "..");
const MARQUEUR_ENCART = "<!-- vague2:encart-produit -->";
const MARQUEUR_STICKY = "<!-- vague2:sticky-bar -->";

function lire(fichier) {
  return fs.readFileSync(path.join(ROOT, fichier), "utf8");
}
function ecrire(fichier, contenu) {
  fs.writeFileSync(path.join(ROOT, fichier), contenu, "utf8");
}

function construireEncart(matiereSlug) {
  const m = MATIERES[matiereSlug];
  if (!m) throw new Error("Matière inconnue : " + matiereSlug);
  const pageMatiere = matiereSlug + ".html";

  if (m.semestres.length === 1) {
    const s = m.semestres[0];
    const thumb = s.apercus[0] || "";
    const apercuBtn = s.apercus.length
      ? `<button type="button" class="apercu-link" data-apercu='${JSON.stringify(s.apercus)}' data-apercu-title="${m.nom}" data-apercu-price="${s.prix}" data-apercu-cta="${s.id}">Voir un aperçu</button>`
      : "";
    return `${MARQUEUR_ENCART}
<div class="article-produit-inline">
  ${thumb ? `<img class="article-produit-inline__thumb" src="${thumb}" alt="Aperçu de la fiche ${m.nom}" loading="lazy">` : ""}
  <div class="article-produit-inline__body">
    <p class="article-produit-inline__label">Fiche complète</p>
    <p class="article-produit-inline__title">${m.nom}</p>
    <p class="article-produit-inline__meta">Tout le cours en PDF, avec cet arrêt et tous les autres · <strong>${s.prix}</strong></p>
  </div>
  <div class="article-produit-inline__actions">
    ${apercuBtn}
    <button type="button" class="btn btn--primary" data-tjd-produit="${s.id}">Acheter · ${s.prix}</button>
  </div>
</div>
`;
  }

  // Plusieurs semestres (droit administratif L2, droit constitutionnel L1) : on ne devine pas
  // le semestre exact vu depuis l'arrêt, on renvoie vers la section d'achat de la page matière.
  const thumb = m.semestres[0].apercus[0] || "";
  return `${MARQUEUR_ENCART}
<div class="article-produit-inline">
  ${thumb ? `<img class="article-produit-inline__thumb" src="${thumb}" alt="Aperçu de la fiche ${m.nom}" loading="lazy">` : ""}
  <div class="article-produit-inline__body">
    <p class="article-produit-inline__label">Fiche complète</p>
    <p class="article-produit-inline__title">${m.nom}</p>
    <p class="article-produit-inline__meta">Tout le cours en PDF, semestre 1 ou semestre 2 · <strong>${m.semestres[0].prix}</strong></p>
  </div>
  <div class="article-produit-inline__actions">
    <a class="btn btn--primary" href="${pageMatiere}#fiches">Voir les fiches S1 et S2 →</a>
  </div>
</div>
`;
}

function construireEncartGenerique() {
  return `${MARQUEUR_ENCART}
<div class="article-produit-inline">
  <div class="article-produit-inline__body">
    <p class="article-produit-inline__label">Fiches complètes</p>
    <p class="article-produit-inline__title">Toutes les matières, prêtes à réviser</p>
    <p class="article-produit-inline__meta">Cours complet, arrêts et notions clés en PDF · à partir de <strong>14,99 €</strong></p>
  </div>
  <div class="article-produit-inline__actions">
    <a class="btn btn--primary" href="formations.html">Voir les fiches →</a>
  </div>
</div>
`;
}

function construireSticky(matiereSlug) {
  const m = MATIERES[matiereSlug];
  const pageMatiere = matiereSlug + ".html";
  const prix = m.semestres[0].prix;
  const sousTitre = m.semestres.length > 1 ? "Fiche S1 ou S2 · accès à vie" : "Fiche complète · accès à vie";
  return `  ${MARQUEUR_STICKY}
  <div class="sticky-cta-bar sticky-cta-bar--always" id="stickyCta">
    <div class="sticky-cta-bar__text">
      <strong>${m.nom} · ${prix}</strong>
      <small>${sousTitre}</small>
    </div>
    <a class="btn btn--primary" href="${pageMatiere}#fiches">Voir la fiche →</a>
  </div>
`;
}

function assurerAchatJs(html) {
  if (html.includes("assets/js/achat.js")) return html;
  return html.replace(
    /(\s*)(<script src="assets\/js\/main\.js\?v=[a-f0-9]+" defer><\/script>)/,
    `$1<script src="assets/js/achat.js" defer></script>$1$2`
  );
}

function injecterEncartAvantFaits(html, encartHtml) {
  if (html.includes(MARQUEUR_ENCART)) return { html, insere: false };
  const cible = '<h2 id="faits">';
  const idx = html.indexOf(cible);
  if (idx === -1) return { html, insere: false, erreur: "ancre #faits introuvable" };
  const html2 = html.slice(0, idx) + encartHtml + "\n          " + html.slice(idx);
  return { html: html2, insere: true };
}

function injecterSticky(html, stickyHtml) {
  if (html.includes(MARQUEUR_STICKY) || html.includes("sticky-cta-bar")) return { html, insere: false };
  const cible = /(\s*)<script src="assets\/js\/main\.js/;
  const m = html.match(cible);
  if (!m) return { html, insere: false, erreur: "point d'insertion sticky introuvable" };
  const idx = html.indexOf(m[0]);
  const html2 = html.slice(0, idx) + "\n" + stickyHtml + html.slice(idx);
  return { html: html2, insere: true };
}

function traiterPage(fichier, encartHtml, stickyHtml) {
  let html = lire(fichier);
  const avant = html;
  const resEncart = injecterEncartAvantFaits(html, encartHtml);
  html = resEncart.html;
  if (stickyHtml) {
    const resSticky = injecterSticky(html, stickyHtml);
    html = resSticky.html;
    if (resSticky.erreur) console.log("  ! " + fichier + " : " + resSticky.erreur);
  }
  html = assurerAchatJs(html);
  if (html !== avant) {
    ecrire(fichier, html);
    console.log("OK  " + fichier);
  } else {
    console.log("--  " + fichier + " (déjà à jour)");
  }
  if (resEncart.erreur) console.log("  ! " + fichier + " : " + resEncart.erreur);
}

console.log("=== Fiches d'arrêt ===");
for (const [slug, matiereSlug] of Object.entries(ARRETS_VERS_MATIERE)) {
  const fichier = slug + ".html";
  if (!fs.existsSync(path.join(ROOT, fichier))) {
    console.log("  ! fichier introuvable : " + fichier);
    continue;
  }
  const encart = construireEncart(matiereSlug);
  const sticky = construireSticky(matiereSlug);
  traiterPage(fichier, encart, sticky);
}

console.log("=== Fiche-révision / comment-réviser (matière précise) ===");
for (const [slug, matiereSlug] of Object.entries(REVISION_VERS_MATIERE)) {
  const fichier = slug + ".html";
  if (!fs.existsSync(path.join(ROOT, fichier))) {
    console.log("  ! fichier introuvable : " + fichier);
    continue;
  }
  const encart = construireEncart(matiereSlug);
  const sticky = construireSticky(matiereSlug);
  traiterPage(fichier, encart, sticky);
}

console.log("=== Pages génériques (comment-reviser-le-droit) ===");
for (const slug of PAGES_GENERIQUES) {
  const fichier = slug + ".html";
  if (!fs.existsSync(path.join(ROOT, fichier))) {
    console.log("  ! fichier introuvable : " + fichier);
    continue;
  }
  const encart = construireEncartGenerique();
  traiterPage(fichier, encart, null);
}

console.log("Terminé.");
