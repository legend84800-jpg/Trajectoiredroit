// Vague 2 (2.5) : ajoute une section "Tout pour ta matière" sur les 18 pages matière,
// juste après la section #fiches existante. Montre les AUTRES formats disponibles
// (majeure préparée, cours complet, pack matière) avec prix et achat direct.
// Idempotent (marqueur HTML vérifié avant insertion).
const fs = require("fs");
const path = require("path");
const { MATIERES } = require("./mapping-matieres");
const { presentationPackMatiere } = require("./libelles-offres");

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
        "Il reprend le programme de la fiche complète, sur une fois et demie à deux fois plus de pages, avec des schémas complets et l'histoire des grands arrêts. Tu y trouves aussi les arguments de tes devoirs maison, qu'il s'agisse d'une dissertation ou d'un commentaire.",
        m.coursComplets,
        "btn--outline"
      )
    );
  }
  if (m.packMatiere) {
    const pack = presentationPackMatiere(m);
    cartes.push(`
      <div class="card" style="border-color:var(--blue-600); border-width:2px">
        <img src="assets/covers/${m.packMatiere.id}.jpg" alt="Coffret ${m.nom}, couverture Trajectoire Droit" loading="lazy" style="display:block; width:100%; aspect-ratio:16 / 9; object-fit:cover; border-radius:10px; margin-bottom:14px">
        <span class="badge badge--popular" style="margin-bottom:8px">Meilleure offre</span>
        <h3 style="margin-top:0">${pack.titre}</h3>
        <p style="color:var(--body); font-size:.9rem">${pack.description}</p>
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
        <p class="lead text-center" style="max-width:620px; margin:0 auto 28px">Chaque format correspond à une façon de réviser. Si tu préfères tout avoir, le pack matière complet en réunit plusieurs à prix réduit.</p>
        <div class="grid-3" style="gap:20px">${cartes.join("")}
        </div>
      </div>
    </section>
`;
}

function ajouterCouverturePack(html, m) {
  if (!m.packMatiere || html.includes(`assets/covers/${m.packMatiere.id}.jpg`)) return html;
  const carte = '<div class="card" style="border-color:var(--blue-600); border-width:2px">';
  const image = `${carte}\n        <img src="assets/covers/${m.packMatiere.id}.jpg" alt="Coffret ${m.nom}, couverture Trajectoire Droit" loading="lazy" style="display:block; width:100%; aspect-ratio:16 / 9; object-fit:cover; border-radius:10px; margin-bottom:14px">`;
  return html.replace(carte, image);
}

let traites = 0;
for (const slug of Object.keys(MATIERES)) {
  const m = MATIERES[slug];
  const fichier = slug + ".html";
  const chemin = path.join(ROOT, fichier);
  if (!fs.existsSync(chemin)) {
    console.log("  ! fichier introuvable : " + fichier);
    continue;
  }
  let html = fs.readFileSync(chemin, "utf8");
  if (html.includes(MARQUEUR)) {
    const htmlAvecCouverture = ajouterCouverturePack(html, m);
    if (htmlAvecCouverture !== html) {
      fs.writeFileSync(chemin, htmlAvecCouverture, "utf8");
      console.log("OK  " + fichier + " (couverture du pack ajoutée)");
      traites++;
    } else {
      console.log("--  " + fichier + " (déjà à jour)");
    }
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
