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
  const citation = formatAttendu === 'Citations';
  for (const match of html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const [, attributs, corps] = match;
    const niveaux = (attributs.match(/\bdata-niveau=["'](L[123](?:,L[123])*)["']/)?.[1] || '').split(',').filter(Boolean);
    const produit = corps.match(/\bdata-tjd-produit=["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/)?.[1];
    if ((!niveaux.length && !citation) || !produit || !Object.hasOwn(PRODUITS, produit) || PRODUITS[produit].venteSuspendue || /\shidden(?:\s|=|$)/i.test(attributs)) continue;

    const ancre = attributs.match(/\sid=["']([^"']+)["']/)?.[1];
    const titre = texteHtml(corps.match(/<h3\b[^>]*class=["']product__title["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    const format = texteHtml(corps.match(/<span\b[^>]*class=["'][^"']*\bbadge--format\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const meta = texteHtml(corps.match(/<div\b[^>]*class=["']product__meta["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const majeure = formatAttendu === 'Majeure préparée';
    const libelleNiveaux = (majeure ? meta.match(/\b(L[123](?: et L[123])*)\b/) : meta.match(/^(L[123](?: et L[123])*)(?: ·|$)/))?.[1];
    const niveauxMeta = libelleNiveaux?.split(' et ') || [];
    if (ancre !== produit || format !== formatAttendu || !titre) continue;
    if (niveauxMeta.length !== niveaux.length || niveauxMeta.some((niveau) => !niveaux.includes(niveau))) continue;
    if (citation && (!produit.startsWith('citations-') || (!niveaux.length && !/^Complément(?: ·|$)/.test(meta)))) continue;

    const semestres = Array.from(meta.matchAll(/\b(?:Semestre\s+|S)([12])\b/gi), (match) => match[1]);
    const sujet = semestres.length === 1 ? titre.replace(new RegExp(` \\(S${semestres[0]}\\)$`), '') : titre;
    const repere = [libelleNiveaux || 'Complément', semestres.map((semestre) => 'S' + semestre).join(' ou ')].filter(Boolean).join(' ');
    const licence = [...niveauxMeta.map((niveau) => 'Licence ' + niveau.slice(1)), ...semestres.map((semestre) => 'semestre ' + semestre)].filter(Boolean).join(' ');
    const categorieCarte = majeure ? 'Majeures préparées' : citation ? 'Fiches de citations' : format;
    const motsFormat = format === 'Fiche complète' ? 'Fiche complète fiche de révision PDF' : categorieCarte.replace(' + ', ' et ');
    const adresse = '/' + page + (majeure ? '?niveau=' + niveaux[0].toLowerCase() : '') + '#' + ancre;
    cartes.push({ t: sujet + ' · ' + repere, u: adresse, c: categorieCarte, k: [motsFormat + ' de ' + sujet, licence].filter(Boolean).join(' ') });
  }
  return cartes;
}

function choixCasPratiques(html) {
  const ancre = 'recueils-cas-pratiques';
  if (!html.includes(`id="${ancre}"`)) return [];
  const options = html.match(/<select\b[^>]*\bid=["']choixRecueil["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] || '';
  const recueils = new Map();
  for (const [, attributs, contenu] of options.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const produit = attributs.match(/\bvalue=["'](cas-pratique-[a-z0-9]+(?:-[a-z0-9]+)*)["']/)?.[1];
    const libelle = texteHtml(contenu).match(/^(.+?) (L[123])(?: (S[12]))?(?: · |$)/);
    if (!produit || !Object.hasOwn(PRODUITS, produit) || PRODUITS[produit].venteSuspendue || !libelle || /\s(?:disabled|hidden)(?:\s|=|$)/i.test(attributs)) continue;
    const [, sujet, niveau, semestre] = libelle;
    if (!recueils.has(produit)) recueils.set(produit, { sujet, niveaux: new Set(), semestre });
    recueils.get(produit).niveaux.add(niveau);
  }
  const categorieCarte = 'Cas pratiques corrigés';
  return Array.from(recueils, ([produit, { sujet, niveaux, semestre }]) => ({
    t: sujet + ' · ' + Array.from(niveaux).join(' et ') + (semestre ? ' ' + semestre : ''),
    u: '/cas-pratiques-corriges.html?matiere=' + produit + '#' + ancre,
    c: categorieCarte,
    k: [categorieCarte + ' de ' + sujet, ...Array.from(niveaux, (niveau) => 'Licence ' + niveau.slice(1)), semestre && 'semestre ' + semestre.slice(1)].filter(Boolean).join(' '),
  }));
}

const SECTIONS_GUIDES = {
  'contrats-speciaux-l3.html': 'programme',
  'ressources-gratuites.html': 'guides-gratuits',
};

function sectionAvecAncre(html, ancre) {
  return html.match(new RegExp(`<section\\b[^>]*\\sid=["']${ancre}["'][^>]*>([\\s\\S]*?)</section>`, 'i'))?.[1] || '';
}

function pagesGuides(racine) {
  const nom = 'ressources-gratuites.html';
  const fichier = path.join(racine, nom);
  if (!fs.existsSync(fichier)) return new Map();
  const section = sectionAvecAncre(fs.readFileSync(fichier, 'utf8'), SECTIONS_GUIDES[nom]);
  const liens = section.matchAll(/<li\b[^>]*>\s*<a\b[^>]*\shref=["']([a-z0-9][a-z0-9_-]*\.html)["'][^>]*>([\s\S]*?)<\/a>/gi);
  const guides = new Map();
  for (const [, destination, libelle] of liens) {
    const matiere = texteHtml(libelle);
    if (matiere) guides.set(destination, matiere);
  }
  return guides;
}

function guideIndexe(html, nom) {
  const ancre = SECTIONS_GUIDES[nom];
  if (!ancre) return null;
  const section = sectionAvecAncre(html, ancre);
  const titre = texteHtml(section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
  if (!titre) return null;
  return { t: titre, u: `/${nom}#${ancre}`, c: categorie(nom), k: 'guide gratuit', g: true };
}

function construireIndex(racine) {
  const guides = pagesGuides(racine);
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
    index.push({
      t: titre,
      u: nom === 'index.html' ? '/' : '/' + nom,
      c: categorie(nom),
      k: h1 + ' ' + nom.replace(/\.html$/, '').replace(/-/g, ' '),
      ...(guides.has(nom) ? { g: guides.get(nom) } : {}),
    });
    const guide = guideIndexe(html, nom);
    if (guide) index.push(guide);
    if (FORMATS_CARTES[nom]) index.push(...cartesCatalogue(html, nom, FORMATS_CARTES[nom]));
    if (nom === 'revisions.html') {
      const section = sectionAvecAncre(html, 'citations');
      const titreCitations = texteHtml(section.match(/<span\b[^>]*class=["']eyebrow["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
      if (titreCitations) {
        index.push({ t: titreCitations, u: '/revisions.html#citations', c: 'Cours et fiches', k: titreCitations });
        index.push(...cartesCatalogue(section, nom, 'Citations'));
      }
    }
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
