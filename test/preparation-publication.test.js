const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { preparerPublication } = require('../scripts/preparer-publication');

function versionScript(texte) {
  return createHash('sha256').update(texte).digest('hex').slice(0, 8);
}

function projet(t) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'tjd-publication-'));
  t.after(() => fs.rmSync(racine, { recursive: true, force: true }));
  function ecrire(relatif, texte = 'fichier de test') {
    const fichier = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, texte);
  }
  const scriptPrincipal = 'window.exemple = true;';
  const versionPrincipale = versionScript(scriptPrincipal);
  ecrire('index.html', `<a href="/cours.html#extrait">Cours</a><script src="/assets/js/main.js?v=${versionPrincipale}"></script><a href="/jeu/">Jeu</a>`);
  ecrire('cours.html', '<main id="extrait"><img src="apercus/page.webp"></main>');
  ecrire('assets/js/main.js', scriptPrincipal);
  ecrire('assets/style.css', 'body{color:black}');
  ecrire('apercus/page.webp');
  ecrire('jeu/index.html', '<script src="jeu.js"></script>');
  ecrire('jeu/jeu.js', 'fetch("data/questions.json")');
  ecrire('jeu/data/questions.json', '[]');
  ecrire('robots.txt', 'User-agent: *');
  ecrire('sitemap.xml', '<urlset/>');
  ecrire('llms.txt', 'Trajectoire Droit');
  return { racine, ecrire };
}

test('la sortie conserve les pages, ressources et adresses du site et du jeu', (t) => {
  const p = projet(t);
  p.ecrire('.well-known/apple-developer-merchantid-domain-association', 'preuve de test');
  const { sortie } = preparerPublication(p.racine);
  for (const relatif of ['index.html', 'cours.html', 'assets/js/main.js', 'assets/style.css', 'apercus/page.webp', 'jeu/index.html', 'jeu/jeu.js', 'jeu/data/questions.json', 'robots.txt', 'sitemap.xml', 'llms.txt', '.well-known/apple-developer-merchantid-domain-association']) {
    assert.equal(fs.readFileSync(path.join(sortie, relatif), 'utf8'), fs.readFileSync(path.join(p.racine, relatif), 'utf8'), relatif);
  }
});

test('la sortie actualise les versions des ressources partagées sans modifier les sources', (t) => {
  const p = projet(t);
  const consentement = 'window.consentement = true;';
  const principal = 'window.nouvelleVersion = true;';
  const style = 'body{color:blue}';
  const achat = 'window.achat = true;';
  const avant = '<script src="/assets/js/cookie-consent.js?v=00000000"></script>'
    + '<script src="assets/js/main.js?v=11111111"></script>'
    + '<script src="assets/js/autre.js?v=22222222"></script>'
    + '<script src="assets/js/achat.js?v=44444444"></script>'
    + '<link rel="stylesheet" href="/assets/style.css?v=33333333">';
  p.ecrire('assets/js/cookie-consent.js', consentement);
  p.ecrire('assets/js/main.js', principal);
  p.ecrire('assets/js/achat.js', achat);
  p.ecrire('assets/style.css', style);
  p.ecrire('cours.html', avant);
  const { sortie } = preparerPublication(p.racine);
  const coursPublie = fs.readFileSync(path.join(sortie, 'cours.html'), 'utf8');
  assert.equal(coursPublie, avant.replace('00000000', versionScript(consentement))
    .replace('11111111', versionScript(principal)).replace('33333333', versionScript(style)).replace('44444444', versionScript(achat)));
  assert.equal(fs.readFileSync(path.join(p.racine, 'cours.html'), 'utf8'), avant);
  const accueil = fs.readFileSync(path.join(p.racine, 'index.html'), 'utf8');
  assert.equal(fs.readFileSync(path.join(sortie, 'index.html'), 'utf8'),
    accueil.replace(/main\.js\?v=[a-f0-9]+/, `main.js?v=${versionScript(principal)}`));
});

test('les inclusions du panier sont publiées sans les références des fichiers', (t) => {
  const p = projet(t);
  p.ecrire('assets/js/achat.js');
  const { sortie, fichiers } = preparerPublication(p.racine);
  const relatif = 'assets/panier-inclusions.json';
  const contenu = fs.readFileSync(path.join(sortie, relatif), 'utf8');
  const { inclusions, noms } = JSON.parse(contenu);
  assert.ok(fichiers.includes(relatif));
  assert.ok(inclusions['pack-matiere-da-l2'].includes('fiche-da-l2-s1'));
  assert.equal(noms['fiche-da-l2-s1'], 'Fiche complète Droit administratif L2 S1');
  assert.doesNotMatch(contenu, /r2:\/\/|\/tjd\/|\.pdf|\.apkg/);
  assert.equal(fs.existsSync(path.join(p.racine, relatif)), false);
  const config = require('../vercel.json');
  const enTetes = config.headers.find(({ source }) => source === '/' + relatif).headers;
  assert.ok(enTetes.some(({ key, value }) => key === 'Cache-Control' && value.includes('must-revalidate')));
});

test('les sources serveur, brouillons et fichiers de configuration restent hors de la sortie', (t) => {
  const p = projet(t);
  for (const relatif of ['api/_stripe.js', 'lib/moteur.js', 'scripts/prive.js', 'node_modules/exemple/index.js', 'brouillons/page.html', 'blob_urls.json', 'ambassadeurs.js', 'package.json', '.env', 'assets/.env.local', 'assets/partials/_header.html', 'assets/js/main.js.map', 'jeu/README.md', 'jeu/scripts/generer.js']) p.ecrire(relatif);
  const { sortie } = preparerPublication(p.racine);
  for (const relatif of ['api', 'lib', 'scripts', 'node_modules', 'brouillons', 'blob_urls.json', 'ambassadeurs.js', 'package.json', '.env', 'assets/.env.local', 'assets/partials', 'assets/js/main.js.map', 'jeu/README.md', 'jeu/scripts']) assert.equal(fs.existsSync(path.join(sortie, relatif)), false, relatif);
  assert.equal(fs.existsSync(path.join(p.racine, 'api/_stripe.js')), true);
});

test('une nouvelle préparation nettoie uniquement build/site-public', (t) => {
  const p = projet(t);
  p.ecrire('build/a-conserver.txt', 'autre sortie');
  p.ecrire('build/site-public/ancien-fichier.js', 'ancienne publication');
  const premier = preparerPublication(p.racine);
  assert.equal(fs.existsSync(path.join(premier.sortie, 'ancien-fichier.js')), false);
  assert.equal(fs.readFileSync(path.join(p.racine, 'build/a-conserver.txt'), 'utf8'), 'autre sortie');
  p.ecrire('cours.html', '<main id="extrait">Nouvelle page</main>');
  preparerPublication(p.racine);
  assert.equal(fs.readFileSync(path.join(premier.sortie, 'cours.html'), 'utf8'), '<main id="extrait">Nouvelle page</main>');
  assert.equal(fs.existsSync(path.join(p.racine, 'index.html')), true);
});

test('un lien symbolique vers une source privée interrompt la préparation', (t) => {
  const p = projet(t);
  p.ecrire('lib/prive.js');
  fs.symlinkSync(path.join(p.racine, 'lib/prive.js'), path.join(p.racine, 'assets/js/source.js'));
  assert.throws(() => preparerPublication(p.racine), /lien symbolique/);
  assert.equal(fs.existsSync(path.join(p.racine, 'build/site-public')), false);
});

test('Vercel sert la sortie publique et garde les fonctions natives à la racine', () => {
  const config = require('../vercel.json');
  const commande = require('../package.json').scripts.build;
  assert.equal(config.outputDirectory, 'build/site-public');
  assert.ok(commande.indexOf('synchroniser-presentations-catalogue.js --check') < commande.indexOf('generer-index-recherche.js'));
  assert.ok(commande.indexOf('generer-index-recherche.js') < commande.indexOf('preparer-publication.js'));
  assert.ok(config.functions['api/generer.js']);
  assert.ok(config.functions['api/personnaliser-pdf.py']);
  assert.equal(fs.existsSync(path.join(__dirname, '../api/create-checkout.js')), true);
});
