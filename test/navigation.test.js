const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '..');
const pages = fs.readdirSync(racine)
  .filter((nom) => nom.endsWith('.html'))
  .map((nom) => ({ nom, html: fs.readFileSync(path.join(racine, nom), 'utf8') }))
  .filter(({ html }) => html.includes('<nav class="primary-nav"'))
  .filter(({ html }) => !/<html\s+lang="en"/i.test(html));

function extraire(html, debut, fin) {
  const positionDebut = html.indexOf(debut);
  assert.notEqual(positionDebut, -1, `Début introuvable pour ${debut}`);
  const positionFin = html.indexOf(fin, positionDebut);
  assert.notEqual(positionFin, -1, `Fin introuvable pour ${debut}`);
  return html.slice(positionDebut, positionFin + fin.length);
}

test('les pages françaises partagent cinq familles de navigation', () => {
  assert.equal(pages.length, 247);

  for (const { nom, html } of pages) {
    const nav = extraire(html, '<nav class="primary-nav"', '</nav>');
    const familles = nav.match(/<div class="nav-item\b/g) || [];

    assert.equal(familles.length, 5, `${nom} doit avoir cinq familles`);
    assert.match(nav, />Fiches\s*</, `${nom} doit proposer Fiches`);
    assert.match(nav, />Cours particuliers\s*</, `${nom} doit proposer Cours particuliers`);
    assert.match(nav, />Stage en direct\s*</, `${nom} doit proposer Stage en direct`);
    assert.match(nav, />Ressources\s*</, `${nom} doit proposer Ressources`);
    assert.match(nav, />À propos\s*</, `${nom} doit proposer À propos`);
    assert.doesNotMatch(nav, />Méthode\s*</, `${nom} ne doit plus afficher Méthode au premier niveau`);
  }
});

test('Ressources conserve les articles et les quatre méthodes juridiques', () => {
  const liensAttendus = [
    'blog.html',
    'methode-fiche-arret.html',
    'methode-commentaire-arret.html',
    'methode-cas-pratique.html',
    'methode-dissertation-juridique.html',
    'methodologie-juridique.html',
  ];

  for (const { nom, html } of pages) {
    const nav = extraire(html, '<nav class="primary-nav"', '</nav>');
    assert.match(nav, /dropdown--resources/, `${nom} doit contenir le panneau Ressources`);
    assert.match(nav, />Le blog pour apprendre le droit</, `${nom} doit présenter clairement le blog`);
    assert.match(nav, />Grands arrêts, notions et conseils pour progresser\.</, `${nom} doit expliquer le contenu du blog`);
    assert.match(nav, />Découvrir le blog →</, `${nom} doit proposer un appel à l'action explicite`);
    assert.doesNotMatch(nav, />Articles pour apprendre le droit</, `${nom} ne doit plus afficher l'ancien titre du blog`);
    for (const lien of liensAttendus) {
      assert.ok(nav.includes(`href="${lien}"`), `${nom} doit conserver le lien ${lien}`);
    }
    assert.match(nav, />Notre approche</, `${nom} doit nommer clairement l'approche TrajectoireDroit`);
  }
});

test('le menu mobile reprend les cinq familles avec divulgation progressive', () => {
  for (const { nom, html } of pages) {
    const navMobile = extraire(html, '<nav class="mobile-nav"', '</nav>');
    const groupes = navMobile.match(/<details class="mobile-nav__group/g) || [];

    assert.equal(groupes.length, 3, `${nom} doit regrouper Fiches, Ressources et À propos`);
    assert.match(navMobile, /<details class="mobile-nav__group[^>]*" open>/, `${nom} doit montrer les formats dès l'ouverture du menu`);
    assert.match(navMobile, />Choisir un format</, `${nom} doit nommer clairement le premier groupe`);
    assert.match(navMobile, /href="formations\.html#comparatif"[^>]*>Comparer tous les formats</, `${nom} doit donner un accès direct au comparatif`);
    assert.equal((navMobile.match(/mobile-nav__format-icon/g) || []).length, 7, `${nom} doit illustrer les sept formats`);
    assert.match(navMobile, /href="cours-fiches\.html"[^>]*><span[^>]*>🎓<\/span><span>Cours complets<\/span>/, `${nom} doit illustrer les cours complets`);
    assert.match(navMobile, /mobile-nav__format--featured[^>]*href="formations\.html"[^>]*><span[^>]*>📄<\/span><span>Fiches complètes<\/span>/, `${nom} doit mettre en avant les fiches complètes`);
    assert.match(navMobile, /href="revisions\.html"[^>]*><span[^>]*>📜<\/span><span>Fiches d’arrêt et citations<\/span>/, `${nom} doit conserver les fiches d'arrêt et les citations sur mobile`);
    assert.match(navMobile, /mobile-nav__top-link[^>]*href="cours-particuliers\.html"/, `${nom} doit garder les cours en accès direct`);
    assert.match(navMobile, /mobile-nav__stage[^>]*data-stage-link/, `${nom} doit garder le stage en accès direct`);
    assert.match(navMobile, />Ressources</, `${nom} doit proposer Ressources sur mobile`);
    assert.match(navMobile, />À propos</, `${nom} doit proposer À propos sur mobile`);
  }
});

test('les contrôles tactiles de la navigation mobile gardent une hauteur suffisante', () => {
  const css = fs.readFileSync(path.join(racine, 'assets', 'style.css'), 'utf8');

  assert.match(css, /\.mobile-nav__subnav a\s*\{[^}]*min-height:\s*44px/s);
  assert.doesNotMatch(css, /\.site-header__cta \.btn--primary::before\s*\{[^}]*content:\s*["']Fiches["']/s);
});
