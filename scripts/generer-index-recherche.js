const fs = require('node:fs');
const path = require('node:path');

function texteHtml(texte) {
  const entites = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', ccedil: 'ç', hellip: '…' };
  return String(texte || '').replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (source, cle) => {
    if (cle[0] === '#') {
      const code = cle[1].toLowerCase() === 'x' ? parseInt(cle.slice(2), 16) : parseInt(cle.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : source;
    }
    return entites[cle] || source;
  }).replace(/\s+/g, ' ').trim();
}

function categorie(nom) {
  if (/^(arret-|decision-)/.test(nom)) return 'Arrêt expliqué';
  if (/^(methode-|methodologie|fiche-arrets)/.test(nom)) return 'Méthode';
  if (/corrige|annales|cas-pratique|dissertation|commentaire-arret/.test(nom)) return 'Exercice corrigé';
  if (/^(quiz-|jeu)/.test(nom)) return 'Outil gratuit';
  if (/^(formations|cours-|pack-|majeures|revisions|flashcards|portalis|top-ventes)/.test(nom)) return 'Cours et fiches';
  return 'Page';
}

function construireIndex(racine) {
  const adresses = fs.readdirSync(racine).filter((nom) => nom.endsWith('.html'))
    .map((nom) => 'https://trajectoiredroit.com/' + (nom === 'index.html' ? '' : nom));
  const dejaVus = new Set();
  const index = [];
  for (const adresse of adresses) {
    const url = new URL(adresse);
    if (url.origin !== 'https://trajectoiredroit.com') continue;
    const nom = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\//, '');
    if (nom.includes('/') || !nom.endsWith('.html') || /^(merci|mon-compte|404|produit-template|bientot|complements|donner-mon-avis|google)/.test(nom)) continue;
    if (dejaVus.has(nom)) continue;
    const fichier = path.join(racine, nom);
    if (!fs.existsSync(fichier)) continue;
    const html = fs.readFileSync(fichier, 'utf8');
    const metas = html.match(/<meta\b[^>]*>/gi) || [];
    if (metas.some((meta) => /name=["']robots["']/i.test(meta) && /content=["'][^"']*noindex/i.test(meta))) continue;
    const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i);
    if (!canonical || new URL(canonical[1]).origin !== url.origin) continue;
    const titreBrut = texteHtml((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const titre = titreBrut.replace(/\s*(?:\||·|[-–—])\s*Trajectoire\s*Droit.*$/i, '').trim();
    const h1 = texteHtml((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
    if (!titre || !h1) continue;
    dejaVus.add(nom);
    index.push({ t: titre, u: nom === 'index.html' ? '/' : '/' + nom, c: categorie(nom), k: h1 + ' ' + nom.replace(/\.html$/, '').replace(/-/g, ' ') });
  }
  return index.sort((a, b) => a.u.localeCompare(b.u));
}

if (require.main === module) {
  const racine = path.resolve(__dirname, '..');
  const index = construireIndex(racine);
  fs.writeFileSync(path.join(racine, 'assets/data/search-index.json'), JSON.stringify(index) + '\n');
  process.stdout.write(`${index.length} pages publiées dans la recherche.\n`);
}

module.exports = { construireIndex, texteHtml };
