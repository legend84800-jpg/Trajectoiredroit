const fs = require('node:fs');
const path = require('node:path');
const PRODUITS = require('../api/_produits');

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

const FORMATS_CARTES = {
  'formations.html': 'Fiche complète',
  'flashcards-qcm.html': 'Flashcards + QCM',
  'majeures-preparees.html': 'Majeure préparée',
};

function cartesCatalogue(html, page, formatAttendu) {
  const cartes = [];
  for (const match of html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const [, attributs, corps] = match;
    const niveau = attributs.match(/\bdata-niveau=["'](L[123])["']/)?.[1];
    const produit = corps.match(/\bdata-tjd-produit=["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/)?.[1];
    if (!niveau || !produit || !Object.hasOwn(PRODUITS, produit) || PRODUITS[produit].venteSuspendue || /\shidden(?:\s|=|$)/i.test(attributs)) continue;

    const ancre = attributs.match(/\sid=["']([^"']+)["']/)?.[1];
    const titre = texteHtml(corps.match(/<h3\b[^>]*class=["']product__title["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    const format = texteHtml(corps.match(/<span\b[^>]*class=["'][^"']*\bbadge--format\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const meta = texteHtml(corps.match(/<div\b[^>]*class=["']product__meta["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const majeure = formatAttendu === 'Majeure préparée';
    const niveauMeta = (majeure ? meta.match(/\b(L[123])\b/) : meta.match(/^(L[123])(?: ·|$)/))?.[1];
    if (ancre !== produit || format !== formatAttendu || !titre || niveauMeta !== niveau) continue;

    const semestres = Array.from(meta.matchAll(/\b(?:Semestre\s+|S)([12])\b/gi), (match) => match[1]);
    const sujet = semestres.length === 1 ? titre.replace(new RegExp(` \\(S${semestres[0]}\\)$`), '') : titre;
    const repere = [niveau, semestres.map((semestre) => 'S' + semestre).join(' ou ')].filter(Boolean).join(' ');
    const licence = ['Licence ' + niveau.slice(1), ...semestres.map((semestre) => 'semestre ' + semestre)].join(' ');
    const categorieCarte = majeure ? 'Majeures préparées' : format;
    const motsFormat = format === 'Fiche complète' ? 'Fiche complète fiche de révision PDF' : categorieCarte.replace(' + ', ' et ');
    const adresse = '/' + page + (majeure ? '?niveau=' + niveau.toLowerCase() : '') + '#' + ancre;
    cartes.push({ t: sujet + ' · ' + repere, u: adresse, c: categorieCarte, k: motsFormat + ' de ' + sujet + ' ' + licence });
  }
  return cartes;
}

function choixCasPratiques(html) {
  const ancre = 'recueils-cas-pratiques';
  if (!html.includes(`id="${ancre}"`)) return [];
  const options = html.match(/<select\b[^>]*\bid=["']choixRecueil["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] || '';
  const resultats = [];
  for (const [, attributs, contenu] of options.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const produit = attributs.match(/\bvalue=["'](cas-pratique-[a-z0-9]+(?:-[a-z0-9]+)*)["']/)?.[1];
    const libelle = texteHtml(contenu).match(/^(.+?) (L[123])(?: (S[12]))?(?: · |$)/);
    if (!produit || !Object.hasOwn(PRODUITS, produit) || PRODUITS[produit].venteSuspendue || !libelle || /\s(?:disabled|hidden)(?:\s|=|$)/i.test(attributs)) continue;
    const [, sujet, niveau, semestre] = libelle;
    const categorieCarte = 'Cas pratiques corrigés';
    resultats.push({
      t: sujet + ' · ' + niveau + (semestre ? ' ' + semestre : ''),
      u: '/cas-pratiques-corriges.html?matiere=' + produit + '#' + ancre,
      c: categorieCarte,
      k: categorieCarte + ' de ' + sujet + ' Licence ' + niveau.slice(1) + (semestre ? ' semestre ' + semestre.slice(1) : ''),
    });
  }
  return resultats;
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
    if (FORMATS_CARTES[nom]) index.push(...cartesCatalogue(html, nom, FORMATS_CARTES[nom]));
    if (nom === 'cas-pratiques-corriges.html') index.push(...choixCasPratiques(html));
  }
  return index.sort((a, b) => a.u.localeCompare(b.u));
}

if (require.main === module) {
  const racine = path.resolve(__dirname, '..');
  const index = construireIndex(racine);
  fs.writeFileSync(path.join(racine, 'assets/data/search-index.json'), JSON.stringify(index) + '\n');
  process.stdout.write(`${index.length} entrées publiques dans la recherche.\n`);
}

module.exports = { construireIndex, texteHtml };
