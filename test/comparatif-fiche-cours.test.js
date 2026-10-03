const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = ['formations.html', 'droit-des-contrats-l2.html'];

for (const page of pages) {
  test(`${page} montre les deux extraits réels avec leurs pages et prix`, () => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/id="fiche-ou-cours"/g) || []).length, 1);
    assert.match(html, /assets\/comparatif-fiche-cours\.css\?v=20261002/);
    for (const format of ['fiche', 'cours']) {
      const file = `assets/apercus/comparatif-dol-${format}-20261002.png`;
      assert.ok(fs.existsSync(path.join(root, file)));
      assert.ok(html.includes(`src="${file}" width="1203" height="1700" loading="lazy" decoding="async"`));
      assert.ok(html.includes(`href="${file}" target="_blank" rel="noopener"`));
    }
    assert.ok(html.includes('157 pages au total, extrait p. 67'));
    assert.ok(html.includes('273 pages au total, extrait p. 119'));
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

test('les liens catalogue et les boutons du cours restent accessibles', () => {
  const catalogue = fs.readFileSync(path.join(root, pages[0]), 'utf8');
  assert.match(catalogue, /class="format-comparison__catalogue" href="#a-l-unite"/);
  assert.match(catalogue, /class="format-comparison__catalogue" href="cours-fiches.html"/);
  const matiere = fs.readFileSync(path.join(root, pages[1]), 'utf8');
  assert.match(matiere, /data-apercu-cta="cours-fiche-contrats-l2-s1"/);
  assert.match(matiere, /data-tjd-produit="cours-fiche-contrats-l2-s1">Acheter · 19,99 €/);
});
