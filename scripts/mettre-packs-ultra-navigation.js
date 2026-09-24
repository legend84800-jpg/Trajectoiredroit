// Met à jour la navigation commune des pages statiques. Relancer avec --check
// pour vérifier que chaque page porte les cinq Packs Ultra et le quiz déplacé.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const produits = require('../api/_produits');
const { DEFINITIONS, referencesPour } = require('../api/_packs-ultra');

const racine = path.resolve(__dirname, '..');
const verification = process.argv.includes('--check');
const style = fs.readFileSync(path.join(racine, 'assets/style.css'));
const versionStyle = crypto.createHash('sha256').update(style).digest('hex').slice(0, 8);
const packsActifs = Object.entries(DEFINITIONS).filter(([, definition]) => !definition.venteSuspendue);

const lignesPacks = packsActifs.map(([id, definition]) => {
  const suffixe = id.replace('pack-ultra-', '');
  const total = referencesPour(id, produits).reduce((somme, reference) => somme + produits[reference].prix, 0);
  const economie = Math.round((total - definition.prix) / total * 100);
  const totalAffiche = `${(total / 100).toFixed(2).replace('.', ',')} €`;
  const prixAffiche = `${definition.prix / 100} €`;
  const [, annee, semestre] = suffixe.match(/^(l[123])-s([12])$/);
  const titre = `${annee.toUpperCase()} semestre ${semestre}`;
  return `                <a href="index.html#${id}" role="menuitem" class="megamenu__pack-tile">
                  <span class="megamenu__pack-tile-top"><span class="megamenu__pack-tile-title">${titre}</span><span class="badge badge--success">-${economie} %</span></span>
                  <span class="megamenu__pack-tile-meta">${definition.attendus} ressources · accès à vie</span>
                  <span class="megamenu__pack-tile-prices"><span class="megamenu__pack-tile-price-old">${totalAffiche}</span><span class="megamenu__pack-tile-price">${prixAffiche}</span></span>
                </a>`;
}).join('\n');

const blocPacks = `            <div class="megamenu__packs">
              <div class="megamenu__niveau-head"><strong>Le Pack Ultra</strong><span>Choisis ton semestre</span></div>
              <div class="megamenu__packs-grid">
${lignesPacks}
              </div>
            </div>
`;

const ancienPacks = /            <div class="megamenu__packs">[\s\S]*?            <\/div>\n(?=            <div class="megamenu__footer">|          <\/div>\n        <\/div>)/;
const ancienFooter = /            <div class="megamenu__footer">[\s\S]*?              <a class="btn btn--primary btn--sm" href="quiz-methode\.html">Faire le quiz →<\/a>\n            <\/div>\n/;
const repereQuiz = '              <a class="resources-menu__all-methods" href="methodologie-juridique.html" role="menuitem">Voir toutes les méthodes →</a>';
const quizRessources = `              <a class="resources-menu__quiz" href="quiz-methode.html" role="menuitem">Faire le quiz de méthode · 3 min →</a>\n`;
const repereMobile = /        <a class="mobile-nav__illustrated" href="methodologie-juridique\.html"(?: aria-current="page")?><span class="mobile-nav__item-icon" aria-hidden="true">🧭<\/span><span>Toutes les méthodes<\/span><\/a>/;
const quizMobile = `        <a class="mobile-nav__illustrated" href="quiz-methode.html"><span class="mobile-nav__item-icon" aria-hidden="true">❓</span><span>Quiz de méthode · 3 min</span></a>\n`;
const packMobile = `        <a class="mobile-nav__format mobile-nav__format--featured" href="index.html#pack-ultra"><span class="mobile-nav__format-icon" aria-hidden="true">📦</span><span>Le Pack Ultra · par semestre</span></a>\n`;

const bilan = { pages: 0, conformes: 0, modifiees: 0, erreurs: [] };
for (const nom of fs.readdirSync(racine).filter((fichier) => fichier.endsWith('.html'))) {
  const fichier = path.join(racine, nom);
  const original = fs.readFileSync(fichier, 'utf8');
  if (!original.includes('class="megamenu__packs"')) {
    const nouveauStyle = original.replace(/assets\/style\.css\?v=[a-f0-9]+/g, `assets/style.css?v=${versionStyle}`);
    if (nouveauStyle !== original && verification) bilan.erreurs.push(`${nom}: version CSS non conforme`);
    else if (nouveauStyle !== original) fs.writeFileSync(fichier, nouveauStyle);
    continue;
  }
  bilan.pages += 1;
  let nouveau = original;
  if (!nouveau.includes(blocPacks)) {
    if (!ancienPacks.test(nouveau)) { bilan.erreurs.push(`${nom}: bloc packs introuvable`); continue; }
    nouveau = nouveau.replace(ancienPacks, blocPacks);
  }
  if (nouveau.includes('class="megamenu__footer"')) nouveau = nouveau.replace(ancienFooter, '');
  if (!nouveau.includes(quizRessources)) {
    if (!nouveau.includes(repereQuiz)) { bilan.erreurs.push(`${nom}: menu Ressources introuvable`); continue; }
    nouveau = nouveau.replace(repereQuiz, quizRessources + repereQuiz);
  }
  if (!nouveau.includes(quizMobile)) {
    if (!repereMobile.test(nouveau)) { bilan.erreurs.push(`${nom}: menu mobile introuvable`); continue; }
    nouveau = nouveau.replace(repereMobile, (trouve) => trouve + '\n' + quizMobile.trimEnd());
  }
  if (!nouveau.includes(packMobile)) {
    const marqueurFormats = '      <div class="mobile-nav__subnav">\n';
    if (!nouveau.includes(marqueurFormats)) { bilan.erreurs.push(`${nom}: formats mobiles introuvables`); continue; }
    nouveau = nouveau.replace(marqueurFormats, marqueurFormats + packMobile);
  }
  nouveau = nouveau.replace('class="mobile-nav__format mobile-nav__format--featured" href="formations.html"', 'class="mobile-nav__format" href="formations.html"');
  nouveau = nouveau.replace(/assets\/style\.css\?v=[a-f0-9]+/g, `assets/style.css?v=${versionStyle}`);
  if (nouveau === original) bilan.conformes += 1;
  else if (verification) bilan.erreurs.push(`${nom}: navigation non conforme`);
  else { fs.writeFileSync(fichier, nouveau); bilan.modifiees += 1; }
}

console.log(JSON.stringify({ mode: verification ? 'verification' : 'ecriture', versionStyle, ...bilan }, null, 2));
if (bilan.erreurs.length || bilan.pages !== 294) process.exitCode = 1;
