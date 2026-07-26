// Complément de generer-encarts-produit.js pour les 5 pages sans ancre #faits
// (structure différente : arret-nikon, fiche-revision-*, comment-reviser-*).
// Idempotent comme le script principal.
const fs = require("fs");
const path = require("path");
const { MATIERES } = require("./mapping-matieres");

const ROOT = path.join(__dirname, "..");
const MARQUEUR_ENCART = "<!-- vague2:encart-produit -->";
const MARQUEUR_STICKY = "<!-- vague2:sticky-bar -->";

function lire(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }
function ecrire(f, c) { fs.writeFileSync(path.join(ROOT, f), c, "utf8"); }

function construireEncart(matiereSlug) {
  const m = MATIERES[matiereSlug];
  const pageMatiere = matiereSlug + ".html";
  if (m.semestres.length === 1) {
    const s = m.semestres[0];
    const thumb = s.apercus[0] || "";
    const apercuBtn = s.apercus.length
      ? `<button type="button" class="apercu-link" data-apercu='${JSON.stringify(s.apercus)}' data-apercu-title="${m.nom}" data-apercu-price="${s.prix}" data-apercu-cta="${s.id}">Voir un aperçu</button>`
      : "";
    return `${MARQUEUR_ENCART}
    <section class="section" style="padding-top:0; padding-bottom:0">
      <div class="container container--narrow">
        <div class="article-produit-inline">
          ${thumb ? `<img class="article-produit-inline__thumb" src="${thumb}" alt="Aperçu de la fiche ${m.nom}" loading="lazy">` : ""}
          <div class="article-produit-inline__body">
            <p class="article-produit-inline__label">Fiche complète</p>
            <p class="article-produit-inline__title">${m.nom}</p>
            <p class="article-produit-inline__meta">Tout le cours en PDF · <strong>${s.prix}</strong></p>
          </div>
          <div class="article-produit-inline__actions">
            ${apercuBtn}
            <button type="button" class="btn btn--primary" data-tjd-produit="${s.id}">Acheter · ${s.prix}</button>
          </div>
        </div>
      </div>
    </section>
`;
  }
  const thumb = m.semestres[0].apercus[0] || "";
  return `${MARQUEUR_ENCART}
    <section class="section" style="padding-top:0; padding-bottom:0">
      <div class="container container--narrow">
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
      </div>
    </section>
`;
}

function construireEncartGenerique() {
  return `${MARQUEUR_ENCART}
    <section class="section" style="padding-top:0; padding-bottom:0">
      <div class="container container--narrow">
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
      </div>
    </section>
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

function injecterAvant(html, cibleLitterale, encartHtml) {
  if (html.includes(MARQUEUR_ENCART)) return html;
  const idx = html.indexOf(cibleLitterale);
  if (idx === -1) {
    console.log("  ! cible introuvable : " + cibleLitterale);
    return html;
  }
  return html.slice(0, idx) + encartHtml + "\n    " + html.slice(idx);
}

function injecterSticky(html, stickyHtml) {
  if (html.includes(MARQUEUR_STICKY) || html.includes("sticky-cta-bar")) return html;
  const m = html.match(/(\s*)<script src="assets\/js\/main\.js/);
  if (!m) { console.log("  ! point d'insertion sticky introuvable"); return html; }
  const idx = html.indexOf(m[0]);
  return html.slice(0, idx) + "\n" + stickyHtml + html.slice(idx);
}

function traiter(fichier, cible, encartHtml, stickyHtml) {
  let html = lire(fichier);
  const avant = html;
  html = injecterAvant(html, cible, encartHtml);
  if (stickyHtml) html = injecterSticky(html, stickyHtml);
  html = assurerAchatJs(html);
  if (html !== avant) { ecrire(fichier, html); console.log("OK  " + fichier); }
  else console.log("--  " + fichier + " (déjà à jour)");
}

traiter(
  "arret-nikon.html",
  "<!-- LES FAITS -->",
  construireEncart("droit-du-travail-l3"),
  construireSticky("droit-du-travail-l3")
);

traiter(
  "fiche-revision-droit-administratif-l2.html",
  '<section class="section section--alt" id="programme">',
  construireEncart("droit-administratif-l2"),
  construireSticky("droit-administratif-l2")
);

traiter(
  "comment-reviser-le-droit-administratif-l2.html",
  '<section class="section section--alt" id="planning">',
  construireEncart("droit-administratif-l2"),
  construireSticky("droit-administratif-l2")
);

traiter(
  "comment-reviser-le-droit-des-obligations-l2.html",
  '<section class="section section--alt" id="planning">',
  construireEncart("droit-des-obligations-l2"),
  construireSticky("droit-des-obligations-l2")
);

traiter(
  "comment-reviser-le-droit.html",
  '<section class="section section--alt" id="recuperation-active">',
  construireEncartGenerique(),
  null
);

console.log("Terminé.");
