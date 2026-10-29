const fs = require('node:fs');
const path = require('node:path');

const DOSSIERS_PUBLICS = ['assets', 'apercus', 'jeu', '.well-known'];
const FICHIERS_PUBLICS = ['robots.txt', 'sitemap.xml', 'llms.txt'];
const FORMATS_PUBLICS = new Set(['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico', '.pdf', '.zip', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.m4a', '.mp3', '.webm', '.ogg', '.wav', '.webmanifest', '.wasm', '.vtt', '.txt', '.xml']);
const DOSSIERS_EXCLUS = new Set(['api', 'lib', 'scripts', 'test', 'tests', 'node_modules', 'brouillons', 'partials']);
const FORMATS_EXCLUS = new Set(['.map', '.md', '.py', '.ts', '.tsx', '.toml', '.lock', '.pem', '.key', '.sqlite', '.db']);

function preparerPublication(racine = path.resolve(__dirname, '..')) {
  const sortie = path.join(racine, 'build', 'site-public');
  const build = path.dirname(sortie);
  if (fs.existsSync(build) && fs.lstatSync(build).isSymbolicLink()) throw new Error('Le dossier build est un lien symbolique.');
  const fichiers = [];
  function examiner(chemin) {
    const nom = path.basename(chemin);
    const relatif = path.relative(racine, chemin);
    if ((nom.startsWith('.') && relatif !== '.well-known') || DOSSIERS_EXCLUS.has(nom)) return;
    const statut = fs.lstatSync(chemin);
    if (statut.isSymbolicLink()) throw new Error(`Un lien symbolique est exclu de la publication, ${relatif}.`);
    if (statut.isDirectory()) {
      for (const enfant of fs.readdirSync(chemin).sort()) examiner(path.join(chemin, enfant));
      return;
    }
    if (!statut.isFile()) return;
    const extension = path.extname(nom).toLowerCase();
    if (FORMATS_EXCLUS.has(extension)) return;
    const dansWellKnown = relatif.startsWith('.well-known' + path.sep);
    if (!FORMATS_PUBLICS.has(extension) && !(dansWellKnown && !extension)) throw new Error(`Le fichier ${relatif} utilise un format exclu de la publication.`);
    fichiers.push(relatif);
  }
  for (const nom of fs.readdirSync(racine).sort()) {
    if (nom.endsWith('.html') || FICHIERS_PUBLICS.includes(nom) || DOSSIERS_PUBLICS.includes(nom)) examiner(path.join(racine, nom));
  }
  if (!fichiers.includes('index.html')) throw new Error('La page d’accueil index.html est absente.');
  // Ce seul sous-dossier est régénéré. Les API et le reste du build restent à la racine du projet.
  fs.rmSync(sortie, { recursive: true, force: true });
  for (const relatif of fichiers) {
    const destination = path.join(sortie, relatif);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(racine, relatif), destination);
  }
  return { sortie, fichiers };
}

if (require.main === module) {
  const resultat = preparerPublication();
  process.stdout.write(`Le dossier de publication contient ${resultat.fichiers.length} fichiers publics.\n`);
}

module.exports = { preparerPublication };
