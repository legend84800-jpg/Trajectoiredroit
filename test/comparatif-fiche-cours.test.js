const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { COMPARAISON_DOL } = require('../scripts/catalogue-presentations');
const root = path.resolve(__dirname, '..');
const pages = ['formations.html', 'droit-des-contrats-l2.html'];

for (const page of pages) {
  test(`${page} montre l’extrait de la fiche avec son prix`, () => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/id="extrait-fiche-contrats"/g) || []).length, 1);
    assert.match(html, /assets\/comparatif-fiche-cours\.css\?v=20261002/);
    for (const extrait of COMPARAISON_DOL) {
      const file = extrait.image;
      assert.ok(fs.existsSync(path.join(root, file)));
      const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
      assert.equal(sha, extrait.sha256Image, `${page}, image issue du PDF R2 vérifié`);
      const fichier = file.replace(/[.?]/g, (c) => `\\${c}`);
      // Extraits refaits sur les PDF républiés le 15/11/2026 : la taille suit l'image, au format A4.
      const dims = html.match(new RegExp(`src="${fichier}(?:\\?v=[0-9]+)?" width="([0-9]+)" height="([0-9]+)" loading="lazy" decoding="async"`));
      assert.ok(dims, `${page}, balise de l'extrait ${file}`);
      const ratio = Number(dims[2]) / Number(dims[1]);
      assert.ok(ratio > 1.40 && ratio < 1.43, `${page}, extrait au format A4 (${dims[1]}x${dims[2]})`);
      assert.match(html, new RegExp(`href="${fichier}(\\?v=[0-9]+)?" target="_blank" rel="noopener"`));
      assert.ok(html.includes(`${extrait.total} pages au total, extrait p. ${extrait.pagePDF} du PDF`));
    }
    const prixComparateur = [...html.matchAll(/format-comparison__price">([^<]+)/g)].map(m => m[1]);
    assert.deepEqual(prixComparateur, ["14,99 €"]);
    assert.doesNotMatch(html, /\bcours complet|cours-fiches\.html/i);
  });
}

test('les styles du comparatif sont isolés et gardent les couleurs du PDF', () => {
  const css = fs.readFileSync(path.join(root, 'assets/comparatif-fiche-cours.css'), 'utf8');
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.format-comparison__paper--fiche img \{ transform: translateY\(-25%\); \}/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(?:^|[\s;])filter\s*:/);
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const selector of rules.matchAll(/([^{}]+)\{/g)) {
    const value = selector[1].trim();
    assert.ok(value.startsWith('.format-comparison') || value === '@media (max-width: 650px)', value);
  }
});

test('les métadonnées reprennent la fiche livrée et republiée en novembre', () => {
  assert.deepEqual(COMPARAISON_DOL.map((e) => [e.produit, e.total, e.pagePDF]), [
    ['fiche-contrats-l2-s1', 183, 81],
  ]);
  assert.equal(COMPARAISON_DOL[0].sha256PDF, '9ead53d18be7d4cb7757d1a3c3696fc471c0e4202336d79e9528e84df2bbf538');
});

test('le lien catalogue ouvre les fiches vendues', () => {
  const catalogue = fs.readFileSync(path.join(root, pages[0]), 'utf8');
  assert.match(catalogue, /class="format-comparison__catalogue" href="#a-l-unite"/);
  const matiere = fs.readFileSync(path.join(root, pages[1]), 'utf8');
  assert.match(matiere, /data-tjd-produit="fiche-contrats-l2-s1"/);
});
