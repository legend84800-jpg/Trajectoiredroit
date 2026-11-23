const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const PRODUITS = require('../api/_produits');
const { CHEMIN_INCLUSIONS_PANIER, construireInclusionsPanier } = require('./generer-inclusions-panier');

const DOSSIERS_PUBLICS = ['assets', 'apercus', 'jeu', '.well-known'];
const FICHIERS_PUBLICS = ['robots.txt', 'sitemap.xml', 'llms.txt'];
const FORMATS_PUBLICS = new Set(['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico', '.pdf', '.zip', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.m4a', '.mp3', '.webm', '.ogg', '.wav', '.webmanifest', '.wasm', '.vtt', '.txt', '.xml']);
const DOSSIERS_EXCLUS = new Set(['api', 'lib', 'scripts', 'test', 'tests', 'node_modules', 'brouillons', 'partials']);
const FORMATS_EXCLUS = new Set(['.map', '.md', '.py', '.ts', '.tsx', '.toml', '.lock', '.pem', '.key', '.sqlite', '.db']);

const IDENTIFIANTS_COURS_RETIRES = Object.entries(PRODUITS)
  .filter(([id, produit]) => produit.venteSuspendue && (produit.nom.startsWith('Cours complet ') || id.startsWith('pack-cours-complets-')))
  .map(([id]) => id);
const APERCUS_COURS_RETIRES = new RegExp(`(?:^|[/_-])(?:${IDENTIFIANTS_COURS_RETIRES.join('|')})(?:[/_.-]|$)`, 'i');
const VISUELS_COURS_RETIRES = /(?:comparatif-dol-cours-|photo-cours-complet-|og-cours-complet\.|hero-video-produits-poster\.jpg$)/;

function preparerPublication(racine = path.resolve(__dirname, '..')) {
  for (const [id, produit] of Object.entries(PRODUITS)) {
    if (produit.blobs.some((reference) => !/^r2:\/\/tjd\/.+\.(pdf|apkg|m4a|mp4)$/.test(reference))) {
      throw new Error(`Un fichier du produit ${id} ne référence pas le stockage privé.`);
    }
  }
  const sortie = path.join(racine, 'build', 'site-public');
  const build = path.dirname(sortie);
  if (fs.existsSync(build) && fs.lstatSync(build).isSymbolicLink()) throw new Error('Le dossier build est un lien symbolique.');
  const fichiers = [];
  function examiner(chemin) {
    const nom = path.basename(chemin);
    const relatif = path.relative(racine, chemin);
    if ((nom.startsWith('.') && relatif !== '.well-known') || DOSSIERS_EXCLUS.has(nom)) return;
    if (APERCUS_COURS_RETIRES.test(relatif) || VISUELS_COURS_RETIRES.test(relatif)) return;
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
  const pdfParents = 'assets/downloads/presentation-parents-trajectoire-droit.pdf';
  const versionsRessources = new Map([
    'assets/style.css', 'assets/js/cookie-consent.js', 'assets/js/main.js', 'assets/js/achat.js',
    'assets/js/catalogue.js', 'assets/js/portalis.js', 'assets/js/recueil-selectionne.js',
    'assets/js/offre-partiels.js',
    'assets/js/prix-promotion.js', 'assets/prix-promotion.css',
    pdfParents,
  ]
    .filter((ressource) => fichiers.includes(ressource))
    .map((ressource) => [ressource, createHash('sha256').update(fs.readFileSync(path.join(racine, ressource))).digest('hex').slice(0, 8)]));
  const scriptPromotion = versionsRessources.get('assets/js/prix-promotion.js');
  const stylePromotion = versionsRessources.get('assets/prix-promotion.css');
  // Ce seul sous-dossier est régénéré. Les API et le reste du build restent à la racine du projet.
  fs.rmSync(sortie, { recursive: true, force: true });
  for (const relatif of fichiers) {
    const destination = path.join(sortie, relatif);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const source = path.join(racine, relatif);
    if (versionsRessources.size && relatif.endsWith('.html')) {
      const html = fs.readFileSync(source, 'utf8');
      const htmlVersionne = html.replace(/(assets\/style\.css|assets\/js\/[a-z0-9-]+\.js)\?v=[a-f0-9]+/g, (reference, ressource) => {
        const version = versionsRessources.get(ressource);
        return version ? `${ressource}?v=${version}` : reference;
      }).replaceAll(`href="${pdfParents}"`, (reference) => {
        const version = versionsRessources.get(pdfParents);
        return version ? `href="${pdfParents}?v=${version}"` : reference;
      });
      const avecAchat = /assets\/js\/(?:main|achat|portalis)\.js\b/.test(htmlVersionne);
      const balisesPromotion = scriptPromotion && stylePromotion && avecAchat
        ? '  <link rel="stylesheet" href="/assets/prix-promotion.css?v=' + stylePromotion + '">\n'
          + '  <script src="/assets/js/prix-promotion.js?v=' + scriptPromotion + '" defer></script>\n'
        : '';
      fs.writeFileSync(destination, balisesPromotion
        ? htmlVersionne.replace(/<\/head>/i, balisesPromotion + '</head>')
        : htmlVersionne);
    } else if (relatif === 'assets/data/saison.json' && scriptPromotion) {
      const saison = JSON.parse(fs.readFileSync(source, 'utf8'));
      if (saison.offre_partiels) {
        saison.prix_catalogue = Object.fromEntries(Object.entries(PRODUITS)
          .filter(([, produit]) => !produit.venteSuspendue)
          .map(([id, produit]) => [id, produit.prix]));
      }
      fs.writeFileSync(destination, JSON.stringify(saison) + '\n');
    } else {
      fs.copyFileSync(source, destination);
    }
  }
  if (versionsRessources.has('assets/js/achat.js')) {
    const graphe = construireInclusionsPanier(PRODUITS);
    fs.writeFileSync(path.join(sortie, CHEMIN_INCLUSIONS_PANIER), JSON.stringify(graphe) + '\n');
    fichiers.push(CHEMIN_INCLUSIONS_PANIER);
  }
  return { sortie, fichiers };
}

if (require.main === module) {
  const resultat = preparerPublication();
  process.stdout.write(`Le dossier de publication contient ${resultat.fichiers.length} fichiers publics.\n`);
}

module.exports = { preparerPublication };
