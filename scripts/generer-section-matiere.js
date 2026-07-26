// Vague 2 (2.5) : ajoute une section "Tout pour ta matière" sur les 18 pages matière,
// juste après la section #fiches existante. Montre les AUTRES formats disponibles
// (majeure préparée, cours complet, pack matière) avec prix et achat direct.
// Idempotent (marqueur HTML vérifié avant insertion).
const fs = require("fs");
const path = require("path");
const { MATIERES } = require("./mapping-matieres");

const ROOT = path.join(__dirname, "..");
const MARQUEUR = "<!-- vague2:tout-pour-ta-matiere -->";

function carteMultiple(titre, description, items, styleBtn) {
  const boutons = items
    .map(
      (it) => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 0; border-top:1px solid var(--blue-100)">
          <span style="font-size:.9rem; color:var(--body)">${it.label ? it.label : titre}</span>
          <button type="button" class="btn ${styleBtn} btn--sm" data-tjd-produit="${it.id}">Acheter · ${it.prix}</button>
        </div>`
    )
    .join("");
  return `
      <div class="card">
        <h3 style="margin-top:0">${titre}</h3>
        <p style="color:var(--body); font-size:.9rem; margin-bottom:0">${description}</p>
        ${boutons}
      </div>`;
}

function construireSection(matiereSlug) {
  const m = MATIERES[matiereSlug];
  const cartes = [];

  if (m.majeures && m.majeures.length) {
    cartes.push(
      carteMultiple(
        "Majeure préparée",
        "La règle de droit déjà rédigée, prête à apprendre pour le cas pratique.",
        m.majeures,
        "btn--outline"
      )
    );
  }
  if (m.coursComplets && m.coursComplets.length) {
    cartes.push(
      carteMultiple(
        "Cours complet",
        "Le format le plus détaillé, jusqu'au moindre développement, pour ne rien laisser au hasard.",
        m.coursComplets,
        "btn--outline"
      )
    );
  }
  if (m.packMatiere) {
    cartes.push(`
      <div class="card" style="border-color:var(--blue-600); border-width:2px">
        <span class="badge badge--popular" style="margin-bottom:8px">Meilleure offre</span>
        <h3 style="margin-top:0">Pack matière complet</h3>
        <p style="color:var(--body); font-size:.9rem">Fiche complète, flashcards et QCM, fiches d'arrêt et un corrigé. Tout ce qu'il faut pour ${m.nom}, à prix réduit.</p>
        <button type="button" class="btn btn--primary btn--full" data-tjd-produit="${m.packMatiere.id}">Acheter le pack · ${m.packMatiere.prix}</button>
      </div>`);
  }

  if (!cartes.length) return null;

  return `
    <!-- TOUT POUR TA MATIÈRE -->
    ${MARQUEUR}
    <section class="section" id="tout-pour-ta-matiere">
      <div class="container container--narrow">
        <h2 class="h2 text-center">Tout pour ${m.nom}</h2>
        <p class="lead text-center" style="max-width:620px; margin:0 auto 28px">Choisis le format qui correspond à ta façon de réviser, ou prends le pack complet pour ne plus y penser.</p>
        <div class="grid-3" style="gap:20px">${cartes.join("")}
        </div>
      </div>
    </section>
`;
}

let traites = 0;
for (const slug of Object.keys(MATIERES)) {
  const fichier = slug + ".html";
  const chemin = path.join(ROOT, fichier);
  if (!fs.existsSync(chemin)) {
    console.log("  ! fichier introuvable : " + fichier);
    continue;
  }
  let html = fs.readFileSync(chemin, "utf8");
  if (html.includes(MARQUEUR)) {
    console.log("--  " + fichier + " (déjà à jour)");
    continue;
  }
  const section = construireSection(slug);
  if (!section) {
    console.log("--  " + fichier + " (aucun format supplémentaire à proposer)");
    continue;
  }
  const idxFiches = html.indexOf('id="fiches"');
  if (idxFiches === -1) {
    console.log("  ! " + fichier + " : ancre #fiches introuvable");
    continue;
  }
  const idxFermeture = html.indexOf("</section>", idxFiches);
  if (idxFermeture === -1) {
    console.log("  ! " + fichier + " : fermeture de section #fiches introuvable");
    continue;
  }
  const pointInsertion = idxFermeture + "</section>".length;
  html = html.slice(0, pointInsertion) + "\n" + section + html.slice(pointInsertion);
  fs.writeFileSync(chemin, html, "utf8");
  console.log("OK  " + fichier);
  traites++;
}
console.log("Terminé. " + traites + " pages mises à jour.");
