const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lead = require('../api/lead');
const produits = require('../api/_produits');
const fiches = require('../api/_fiches-arrets.json');
const exercices = require('../api/_corriges-exercices.json');
const { CORRIGES_OFFERTS } = lead;

const racine = path.join(__dirname, '..');

test('chaque fiche d’arrêt offerte renvoie vers sa page, son PDF et un produit vendu', () => {
  assert.ok(Object.keys(fiches).length >= 90);
  for (const [slug, fiche] of Object.entries(fiches)) {
    assert.ok(fs.existsSync(path.join(racine, fiche.page)), fiche.page);
    assert.ok(produits[fiche.produit], fiche.produit);
    assert.match(fiche.pdf, /^https:\/\/pub-[0-9a-f]+\.r2\.dev\/tjd\/fiche-arret\/.+\.pdf$/);
    const a = lead.attributsFiche(slug);
    assert.equal(a.SOURCE, 'fiche-arret');
    for (const [cle, valeur] of Object.entries(a)) assert.ok(valeur && !/undefined/.test(valeur), cle);
    const url = new URL(a.FICHE_URL);
    assert.equal(url.pathname, '/' + fiche.page);
    assert.equal(url.hash, '#offre-matiere');
    const page = fs.readFileSync(path.join(racine, fiche.page), 'utf8');
    assert.ok(page.includes('id="offre-matiere"'), fiche.page + ' sans ancre #offre-matiere');
    const email = lead.construireEmailFiche(a);
    assert.ok(email.texte.includes(a.FICHE_PDF));
    assert.doesNotMatch(email.texte, /[—–]/);
  }
});

test('chaque carte du premier écran vise un PDF que /api/lead sait livrer', () => {
  const pages = fs.readdirSync(racine).filter(f => f.endsWith('.html'));
  let cartes = 0;
  for (const page of pages) {
    const html = fs.readFileSync(path.join(racine, page), 'utf8');
    const blocs = [...html.matchAll(/<div data-tjd-pdf-offert="([a-z]+)"(?: data-id="([^"]*)")?[^>]*><\/div>/g)];
    if (!blocs.length) continue;
    assert.equal(blocs.length, 1, page + ' porte plusieurs cartes');
    assert.match(html, /<script src="\/assets\/js\/pdf-offert\.js\?v=[0-9a-f]{8}" defer><\/script>/, page);
    const [, type, id] = blocs[0];
    if (type === 'fiche') assert.ok(fiches[id], page + ' : fiche ' + id);
    else if (type === 'exercice') assert.ok(exercices[id], page + ' : exercice ' + id);
    else if (type === 'matiere') assert.ok(!id || CORRIGES_OFFERTS[id], page + ' : matière ' + id);
    else assert.fail(page + ' : type inconnu ' + type);
    assert.doesNotMatch(blocs[0][0], /[—–]/, page);
    cartes += 1;
  }
  assert.ok(cartes >= 120, cartes + ' cartes seulement');
});
