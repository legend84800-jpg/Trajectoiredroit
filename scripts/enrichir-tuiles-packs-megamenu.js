// Vague 5.4 : enrichit les tuiles "Par pack" du méga-menu Fiches (ajoutées en
// vague 5.3) avec le prix barré, le badge de réduction et le nombre de
// matières, déjà affichés sur formations.html mais absents du menu. Reprend
// les vrais chiffres du catalogue, n'en invente aucun.
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const MODE_VERIFICATION = process.argv.includes('--check');

const fichiers = fs.readdirSync(RACINE)
  .filter((nom) => nom.endsWith('.html'))
  .map((nom) => path.join(RACINE, nom));

const ANCIEN_BLOC = `            <div class="megamenu__packs">
              <div class="megamenu__niveau-head"><strong>Par pack</strong><span>moins cher qu'à l'unité</span></div>
              <div class="megamenu__packs-grid">
                <a href="formations.html#pack-l1" role="menuitem" class="megamenu__pack-tile"><span class="megamenu__pack-tile-title">Pack Licence 1</span><span class="megamenu__pack-tile-price">87 €</span></a>
                <a href="formations.html#pack-l2" role="menuitem" class="megamenu__pack-tile"><span class="megamenu__pack-tile-title">Pack Licence 2</span><span class="megamenu__pack-tile-price">79 €</span></a>
                <a href="formations.html#pack-l3" role="menuitem" class="megamenu__pack-tile"><span class="megamenu__pack-tile-title">Pack Licence 3</span><span class="megamenu__pack-tile-price">58 €</span></a>
                <a href="formations.html#pack-complet" role="menuitem" class="megamenu__pack-tile megamenu__pack-tile--featured"><span class="megamenu__pack-tile-title">Pack Licence complète</span><span class="megamenu__pack-tile-price">179 €</span></a>
              </div>
            </div>
`;

const NOUVEAU_BLOC = `            <div class="megamenu__packs">
              <div class="megamenu__niveau-head"><strong>Par pack</strong><span>jusqu'à -27 % vs l'unité</span></div>
              <div class="megamenu__packs-grid">
                <a href="formations.html#pack-l1" role="menuitem" class="megamenu__pack-tile">
                  <span class="megamenu__pack-tile-top"><span class="megamenu__pack-tile-title">Pack Licence 1</span><span class="badge badge--success">-27 %</span></span>
                  <span class="megamenu__pack-tile-meta">8 matières · accès à vie</span>
                  <span class="megamenu__pack-tile-prices"><span class="megamenu__pack-tile-price-old">119,92 €</span><span class="megamenu__pack-tile-price">87 €</span></span>
                </a>
                <a href="formations.html#pack-l2" role="menuitem" class="megamenu__pack-tile">
                  <span class="megamenu__pack-tile-top"><span class="megamenu__pack-tile-title">Pack Licence 2</span><span class="badge badge--success">-25 %</span></span>
                  <span class="megamenu__pack-tile-meta">7 matières · accès à vie</span>
                  <span class="megamenu__pack-tile-prices"><span class="megamenu__pack-tile-price-old">104,93 €</span><span class="megamenu__pack-tile-price">79 €</span></span>
                </a>
                <a href="formations.html#pack-l3" role="menuitem" class="megamenu__pack-tile">
                  <span class="megamenu__pack-tile-top"><span class="megamenu__pack-tile-title">Pack Licence 3</span><span class="badge badge--success">-23 %</span></span>
                  <span class="megamenu__pack-tile-meta">5 matières · accès à vie</span>
                  <span class="megamenu__pack-tile-prices"><span class="megamenu__pack-tile-price-old">74,95 €</span><span class="megamenu__pack-tile-price">58 €</span></span>
                </a>
                <a href="formations.html#pack-complet" role="menuitem" class="megamenu__pack-tile megamenu__pack-tile--featured">
                  <span class="megamenu__pack-tile-top"><span class="megamenu__pack-tile-title">Pack Licence complète</span><span class="badge badge--success">-20 %</span></span>
                  <span class="megamenu__pack-tile-meta">L1 + L2 + L3 · tout le cursus</span>
                  <span class="megamenu__pack-tile-prices"><span class="megamenu__pack-tile-price-old">224 €</span><span class="megamenu__pack-tile-price">179 €</span></span>
                </a>
              </div>
            </div>
`;

const bilan = { examines: 0, modifies: 0, dejaAJour: 0, introuvables: [], multiples: [] };
const aEcrire = [];

for (const fichierAbsolu of fichiers) {
  const nom = path.basename(fichierAbsolu);
  const original = fs.readFileSync(fichierAbsolu, 'utf8');

  if (!original.includes('class="megamenu__packs"')) continue;
  bilan.examines += 1;

  if (original.includes(NOUVEAU_BLOC)) {
    bilan.dejaAJour += 1;
    continue;
  }

  const occurrences = original.split(ANCIEN_BLOC).length - 1;
  if (occurrences === 0) {
    bilan.introuvables.push(nom);
    continue;
  }
  if (occurrences > 1) {
    bilan.multiples.push(nom);
    continue;
  }

  bilan.modifies += 1;
  aEcrire.push({ fichierAbsolu, contenu: original.replace(ANCIEN_BLOC, NOUVEAU_BLOC) });
}

if (!MODE_VERIFICATION) {
  for (const entree of aEcrire) fs.writeFileSync(entree.fichierAbsolu, entree.contenu);
}

console.log(JSON.stringify({
  mode: MODE_VERIFICATION ? 'verification' : 'ecriture',
  ...bilan,
}, null, 2));

if (bilan.introuvables.length > 0 || bilan.multiples.length > 0) {
  process.exitCode = 2;
}
