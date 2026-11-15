const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { generer } = require("../scripts/generer-reco-merci");
const PRODUITS = require("../api/_produits");

const ROOT = path.resolve(__dirname, "..");

test("la table de recommandation de la page merci est à jour et ne vise que des produits vendus", () => {
  const fichier = fs.readFileSync(path.join(ROOT, "assets/js/merci-reco-data.js"), "utf8");
  assert.equal(fichier, generer(), "lancer node scripts/generer-reco-merci.js");
  const pages = JSON.parse(fichier.match(/pages:(\{.*?\}),produits/)[1]);
  assert.ok(Object.keys(pages).length >= 250);
  for (const [page, id] of Object.entries(pages)) {
    assert.ok(fs.existsSync(path.join(ROOT, `${page}.html`)), page);
    assert.ok(PRODUITS[id], `${page} : ${id}`);
  }
  for (const lecteur of ["merci.html", "quiz-methode.html"]) {
    const html = fs.readFileSync(path.join(ROOT, lecteur), "utf8");
    assert.match(html, /<script src="assets\/js\/merci-reco-data\.js\?v=[0-9a-f]{8}" defer><\/script>/, lecteur);
  }
});
