// Vague 4.6 : inverse le megamenu Fiches (niveau en colonne principale avec les
// matières listées directement, format relégué en 4e colonne). Remplace le bloc
// <div class="megamenu" role="menu">...</div> identique sur 154 des 157 pages,
// ancré sur le commentaire "Item : Methode" qui suit toujours immédiatement.
const fs = require("fs");
const path = require("path");
const { NIVEAUX } = require("./mapping-megamenu-niveaux");

const ROOT = path.join(__dirname, "..");
const MARQUEUR = "<!-- vague4.6:megamenu-inverse -->";

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
              <a href="formations.html" role="menuitem">📄 Fiches complètes</a>
              <a href="majeures-preparees.html" role="menuitem">⚖️ Majeures préparées</a>
              <a href="revisions.html" role="menuitem">📜 Fiches d'arrêt et citations</a>
              <a href="corriges.html" role="menuitem">✍️ Exercices corrigés</a>
              <a href="outil-fiche-arret.html" role="menuitem">🤖 Portalis</a>
            </div>`;

const NOUVEAU_MEGAMENU = `${MARQUEUR}
          <div class="megamenu megamenu--fiches" role="menu">
            <div class="megamenu__niveaux-cols">
${construireColonneNiveau(NIVEAUX.L1)}
${construireColonneNiveau(NIVEAUX.L2)}
${construireColonneNiveau(NIVEAUX.L3)}
${COLONNE_FORMATS}
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
