const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { DEFINITIONS, referenceVente } = require("../api/_packs-ultra");

const ROOT = path.resolve(__dirname, "..");

// F4 (audit CTA du 15/11/2026) : un produit daté ajouté au catalogue change le contenu d'un
// Pack Ultra. Ce test vérifie que le nombre de ressources affiché partout suit le contenu réel.
// En cas d'échec : mettre à jour « attendus » dans api/_packs-ultra.js, lancer
// node scripts/synchroniser-prix-formats.js --write, puis remplacer « N ressources » du pack.
test("le nombre de ressources affiché pour chaque Pack Ultra correspond à son contenu", () => {
  const attendus = {};
  for (const [id, d] of Object.entries(DEFINITIONS)) {
    if (d.venteSuspendue) continue;
    const n = PRODUITS[referenceVente(id)].inclus.length;
    const [, niveau, semestre] = id.match(/pack-ultra-(l[123])-s([12])/);
    attendus[`${niveau.toUpperCase()} semestre ${semestre}`] = n;
  }
  let controles = 0;
  for (const fichier of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    for (const m of html.matchAll(/Le Pack Ultra (L[123] semestre [12]), (\d+) ressources/g)) {
      if (!(m[1] in attendus)) continue;
      assert.equal(Number(m[2]), attendus[m[1]], `${fichier}, ${m[1]}`);
      controles++;
    }
  }
  assert.ok(controles > 1000);
});
