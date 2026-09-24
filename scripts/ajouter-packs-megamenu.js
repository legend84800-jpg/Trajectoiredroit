// Vague 5.3 : ajoute la rangée "Par pack" (Pack Licence 1/2/3/complète) dans le
// méga-menu Fiches de chaque page, juste avant le footer du méga-menu. Les
// colonnes "Par format" et L1/L2/L3 restent inchangées (choix 1.1 de la refonte
// du 23/09/2026 : maillage interne par matière conservé, packs ajoutés à côté).
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const MODE_VERIFICATION = process.argv.includes('--check');

const fichiers = fs.readdirSync(RACINE)
  .filter((nom) => nom.endsWith('.html'))
  .map((nom) => path.join(RACINE, nom));

const MARQUEUR = '<a class="megamenu__niveau-cta" href="reussir-sa-l3.html">Réussir sa L3 →</a>\n            </div>\n            </div>\n            <div class="megamenu__footer">';

const BLOC_PACKS = `            <div class="megamenu__packs">
              <div class="megamenu__niveau-head"><strong>Par pack</strong><span>moins cher qu'à l'unité</span></div>
              <div class="megamenu__packs-grid">
                <a href="formations.html#pack-l1" role="menuitem" class="megamenu__pack-tile"><span class="megamenu__pack-tile-title">Pack Licence 1</span><span class="megamenu__pack-tile-price">87 €</span></a>
                <a href="formations.html#pack-l2" role="menuitem" class="megamenu__pack-tile"><span class="megamenu__pack-tile-title">Pack Licence 2</span><span class="megamenu__pack-tile-price">79 €</span></a>
                <a href="formations.html#pack-l3" role="menuitem" class="megamenu__pack-tile"><span class="megamenu__pack-tile-title">Pack Licence 3</span><span class="megamenu__pack-tile-price">58 €</span></a>
                <a href="formations.html#pack-complet" role="menuitem" class="megamenu__pack-tile megamenu__pack-tile--featured"><span class="megamenu__pack-tile-title">Pack Licence complète</span><span class="megamenu__pack-tile-price">179 €</span></a>
              </div>
            </div>
`;

const REMPLACEMENT = `<a class="megamenu__niveau-cta" href="reussir-sa-l3.html">Réussir sa L3 →</a>\n            </div>\n            </div>\n${BLOC_PACKS}            <div class="megamenu__footer">`;

const bilan = {
  examines: 0,
  dejaPresent: 0,
  modifies: 0,
  sansMarqueur: [],
  marqueurMultiple: [],
};

const aEcrire = [];

for (const fichierAbsolu of fichiers) {
  const nom = path.basename(fichierAbsolu);
  const original = fs.readFileSync(fichierAbsolu, 'utf8');

  if (!original.includes('class="megamenu megamenu--fiches"')) continue;
  bilan.examines += 1;

  if (original.includes('class="megamenu__packs"')) {
    bilan.dejaPresent += 1;
    continue;
  }

  const occurrences = original.split(MARQUEUR).length - 1;
  if (occurrences === 0) {
    bilan.sansMarqueur.push(nom);
    continue;
  }
  if (occurrences > 1) {
    bilan.marqueurMultiple.push(nom);
    continue;
  }

  const modifie = original.replace(MARQUEUR, REMPLACEMENT);
  bilan.modifies += 1;
  aEcrire.push({ fichierAbsolu, contenu: modifie });
}

if (!MODE_VERIFICATION) {
  for (const entree of aEcrire) fs.writeFileSync(entree.fichierAbsolu, entree.contenu);
}

console.log(JSON.stringify({
  mode: MODE_VERIFICATION ? 'verification' : 'ecriture',
  examines: bilan.examines,
  dejaPresent: bilan.dejaPresent,
  modifies: bilan.modifies,
  sansMarqueur: bilan.sansMarqueur,
  marqueurMultiple: bilan.marqueurMultiple,
}, null, 2));

if (bilan.sansMarqueur.length > 0 || bilan.marqueurMultiple.length > 0) {
  process.exitCode = 2;
}
