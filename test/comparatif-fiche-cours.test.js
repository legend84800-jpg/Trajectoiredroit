const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { COMPARAISON_DOL } = require('../scripts/catalogue-presentations');
const root = path.resolve(__dirname, '..');
const pages = ['formations.html', 'droit-des-contrats-l2.html'];

for (const page of pages) {
  test(`${page} montre les deux extraits réels avec leurs pages et prix`, () => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/id="fiche-ou-cours"/g) || []).length, 1);
    assert.match(html, /assets\/comparatif-fiche-cours\.css\?v=20261002/);
    for (const extrait of COMPARAISON_DOL) {
      const file = extrait.image;
      assert.ok(fs.existsSync(path.join(root, file)));
      const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
      assert.equal(sha, extrait.sha256Image, `${page}, image issue du PDF R2 vérifié`);
      const fichier = file.replace(/[.?]/g, (c) => `\\${c}`);
      assert.match(html, new RegExp(`src="${fichier}(\\?v=[0-9]+)?" width="1203" height="1700" loading="lazy" decoding="async"`));
      assert.match(html, new RegExp(`href="${fichier}(\\?v=[0-9]+)?" target="_blank" rel="noopener"`));
      assert.ok(html.includes(`${extrait.total} pages au total, extrait p. ${extrait.pagePDF} du PDF`));
    }
    assert.match(html, /format-comparison__price">14,99 €/);
    assert.match(html, /format-comparison__price">19,99 €/);
    assert.ok(html.includes("le cours complet s'achète à part"));
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

test('les métadonnées reprennent les deux PDF livrés et lus sur R2 le 29 octobre', () => {
  // get_object authentifié, objets modifiés à 03:45:38 et 03:46:08 UTC.
  // Les anciennes compilations locales de 171 et 274 pages ne sont plus vendues.
  assert.deepEqual(COMPARAISON_DOL.map((e) => [e.produit, e.total, e.pagePDF]), [
    ['fiche-contrats-l2-s1', 202, 88],
    ['cours-fiche-contrats-l2-s1', 275, 113],
  ]);
  assert.equal(COMPARAISON_DOL[0].sha256PDF, '22ae131343e6e1d1898600a1c303d9d09cbfd04bb6690c556968a8c07bfd3c21');
  assert.equal(COMPARAISON_DOL[1].sha256PDF, 'a5c6cd7fab7f0481b0113adc197a3d0a9fdebbe2db7894111d998243379bc18a');
});

test('les liens catalogue et les boutons du cours restent accessibles', () => {
  const catalogue = fs.readFileSync(path.join(root, pages[0]), 'utf8');
  assert.match(catalogue, /class="format-comparison__catalogue" href="#a-l-unite"/);
  assert.match(catalogue, /class="format-comparison__catalogue" href="cours-fiches.html"/);
  const matiere = fs.readFileSync(path.join(root, pages[1]), 'utf8');
  assert.match(matiere, /data-apercu-cta="cours-fiche-contrats-l2-s1"/);
  assert.match(matiere, /data-tjd-produit="cours-fiche-contrats-l2-s1">Acheter · 19,99 €/);
});
