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
      // Extraits refaits sur les PDF républiés le 15/11/2026 : la taille suit l'image, au format A4.
      const dims = html.match(new RegExp(`src="${fichier}(?:\\?v=[0-9]+)?" width="([0-9]+)" height="([0-9]+)" loading="lazy" decoding="async"`));
      assert.ok(dims, `${page}, balise de l'extrait ${file}`);
      const ratio = Number(dims[2]) / Number(dims[1]);
      assert.ok(ratio > 1.40 && ratio < 1.43, `${page}, extrait au format A4 (${dims[1]}x${dims[2]})`);
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

test('les métadonnées reprennent les deux PDF livrés et républiés en novembre', () => {
  // PDF républiés le 14 et le 15/11/2026, recomptés sur R2 le 15/11 (205 et 289 pages).
  assert.deepEqual(COMPARAISON_DOL.map((e) => [e.produit, e.total, e.pagePDF]), [
    ['fiche-contrats-l2-s1', 205, 89],
    ['cours-fiche-contrats-l2-s1', 289, 116],
  ]);
  assert.equal(COMPARAISON_DOL[0].sha256PDF, 'a94eea5853a456fadfa4b76c1b5dbb090a4eb83c1f92c232b8afa162caff5105');
  assert.equal(COMPARAISON_DOL[1].sha256PDF, 'bf7d75469162e04f240e0667f7705a911e03a66e1677011ab0ace132c81a67bd');
});

test('les liens catalogue et les boutons du cours restent accessibles', () => {
  const catalogue = fs.readFileSync(path.join(root, pages[0]), 'utf8');
  assert.match(catalogue, /class="format-comparison__catalogue" href="#a-l-unite"/);
  assert.match(catalogue, /class="format-comparison__catalogue" href="cours-fiches.html"/);
  const matiere = fs.readFileSync(path.join(root, pages[1]), 'utf8');
  assert.match(matiere, /data-apercu-cta="cours-fiche-contrats-l2-s1"/);
  assert.match(matiere, /data-tjd-produit="cours-fiche-contrats-l2-s1">Acheter · 19,99 €/);
});
