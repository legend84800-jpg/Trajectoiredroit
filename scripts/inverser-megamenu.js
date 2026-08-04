// Vague 5.2 : le format redevient la colonne prioritaire du megamenu Fiches
// (titre "Par format" plus gros, colonne en tête), les niveaux L1/L2/L3 suivent.
// Avant (vague 4.6), c'était l'inverse. Remplace le bloc
// <div class="megamenu" role="menu">...</div> identique sur les pages du site,
// ancré sur le commentaire "Item : Methode" qui suit toujours immédiatement.
const fs = require("fs");
const path = require("path");
const { NIVEAUX } = require("./mapping-megamenu-niveaux");

const ROOT = path.join(__dirname, "..");
const MARQUEUR = "<!-- vague5.2:megamenu-format-avant -->";

function construireColonneNiveau(niveau) {
  const liens = niveau.matieres
    .map((m) => `              <a href="${m.href}" role="menuitem">${m.nom}</a>`)
    .join("\n");
  return `            <div class="megamenu__niveau-col">
              <div class="megamenu__niveau-head"><strong>${niveau.label}</strong><span>${niveau.matieres.length} matières</span></div>
${liens}
              <a class="megamenu__niveau-cta" href="${niveau.pageReussir}">Réussir sa ${niveau.label} →</a>
            </div>`;
}

const COLONNE_FORMATS = `            <div class="megamenu__niveau-col megamenu__niveau-col--formats">
              <div class="megamenu__niveau-head"><strong>Par format</strong></div>
              <a href="cours-fiches.html" role="menuitem">🎓 Cours complet</a>
              <a href="formations.html" role="menuitem" class="megamenu__format--featured">📄 Fiches complètes</a>
              <a href="majeures-preparees.html" role="menuitem">⚖️ Majeures préparées</a>
              <a href="revisions.html" role="menuitem">📜 Fiches d'arrêt et citations</a>
              <a href="corriges.html" role="menuitem">✍️ Exercices corrigés</a>
              <a href="outil-fiche-arret.html" role="menuitem">🤖 Portalis</a>
              <a href="flashcards-qcm.html" role="menuitem">🗂️ Flashcards + QCM</a>
            </div>`;

const NOUVEAU_MEGAMENU = `${MARQUEUR}
          <div class="megamenu megamenu--fiches" role="menu">
            <div class="megamenu__niveaux-cols">
${COLONNE_FORMATS}
${construireColonneNiveau(NIVEAUX.L1)}
${construireColonneNiveau(NIVEAUX.L2)}
${construireColonneNiveau(NIVEAUX.L3)}
            </div>
            <div class="megamenu__footer">
              <div>
                <strong>Pas sûr de ta matière ?</strong>
                <span>Le quiz gratuit te dit où tu perds des points, en 3 minutes.</span>
              </div>
              <a class="btn btn--primary btn--sm" href="quiz-methode.html">Faire le quiz →</a>
            </div>
          </div>
        </div>
`;

// Capture depuis l'ouverture du megamenu jusqu'à la fermeture du nav-item parent
// (</div> du megamenu, puis </div> du wrapper .has-megamenu), sans dépendre de ce
// qui suit (certaines pages n'ont aucun commentaire "Item :" après).
const REGEX = /<div class="megamenu" role="menu">[\s\S]*?<\/div>\n(\s*)<\/div>\n/;

let traites = 0;
const fichiers = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
for (const fichier of fichiers) {
  const chemin = path.join(ROOT, fichier);
  let html = fs.readFileSync(chemin, "utf8");
  if (html.includes(MARQUEUR)) { console.log("--  " + fichier + " (déjà à jour)"); continue; }
  if (!REGEX.test(html)) { console.log("  ! " + fichier + " : ancre megamenu introuvable"); continue; }
  html = html.replace(REGEX, NOUVEAU_MEGAMENU);
  fs.writeFileSync(chemin, html, "utf8");
  console.log("OK  " + fichier);
  traites++;
}
console.log("Terminé. " + traites + " pages mises à jour.");
