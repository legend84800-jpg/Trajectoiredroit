const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const produits = require("../api/_produits");

const racine = join(__dirname, "..");
const page = (fichier) => readFileSync(join(racine, fichier), "utf8");
const cartes = Array.from(page("packs-partiels.html").matchAll(/<article\b[^>]*id="(pack-partiel-[^"]+)"[^>]*>[\s\S]*?<\/article>/g));

function contenuParMatiere(carte) {
  return Array.from(carte.matchAll(/<div class="partiels-supports__matiere">([\s\S]*?)<\/div>/g), ([, bloc]) => ({
    extrait: bloc.match(/href="(assets\/apercus\/[^"]+\.webp)"/)?.[1],
    libelles: Array.from(bloc.matchAll(/<li>([^<]+)<\/li>/g), ([, texte]) => texte),
  }));
}

test("les cinq packs fixes montrent la composition et le nombre de fichiers réellement livrés", () => {
  const idsAttendus = Object.keys(produits).filter((id) => id.startsWith("pack-partiel-"));
  assert.deepEqual(cartes.map(([, id]) => id).sort(), idsAttendus.sort());

  for (const [carte, id] of cartes) {
    const { blobs, prix } = produits[id];
    const noms = blobs.map((fichier) => fichier.split("/").at(-1));
    const pdf = noms.filter((fichier) => fichier.endsWith(".pdf")).length;
    const anki = noms.filter((fichier) => fichier.endsWith(".apkg")).length;
    const panneau = carte.match(/<details class="partiels-supports">([\s\S]*?)<\/details>/)?.[1];
    assert.ok(panneau?.includes(`${pdf} PDF et ${anki} fichiers Anki`), id);
    assert.doesNotMatch(panneau, /<(?:form|select|input|button)\b/);
    assert.match(carte, new RegExp(`</details>\\s*<button[^>]+data-tjd-produit="${id}">Acheter le pack · ${(prix / 100).toFixed(2).replace(".", ",")} €`));
    const matieres = contenuParMatiere(panneau);
    assert.equal(matieres.length, 2, id);
    const fiches = matieres.map(({ extrait }) => extrait?.split("/").at(-2) + ".pdf");
    const fichesLivrees = noms.filter((fichier) => fichier.startsWith("fiche-") && !/-(?:plan|cartesmentales)\.pdf$/.test(fichier));
    assert.deepEqual(fiches.sort(), fichesLivrees.sort(), id);
    for (const { libelles, extrait } of matieres) {
      assert.ok(libelles.includes("Fiche complète avec son plan et ses cartes mentales"), id);
      assert.ok(libelles.includes("Flashcards et QCM en PDF"), id);
      assert.ok(libelles.includes("Flashcards pour Anki"), id);
      const constitutionnel = extrait.includes("/fiche-constit-l1-s1/");
      assert.equal(libelles.includes("Dissertations corrigées"), constitutionnel, id);
      assert.equal(libelles.includes("Cas pratiques corrigés"), !constitutionnel, id);
      assert.equal(libelles.includes("Majeures préparées avec leur plan"), !constitutionnel, id);
      assert.equal(libelles.length, constitutionnel ? 4 : 5, id);
    }
    assert.equal(matieres.filter(({ libelles }) => libelles.includes("Cas pratiques corrigés")).length, noms.filter((fichier) => fichier.startsWith("cas-pratique-")).length, id);
    assert.equal(matieres.filter(({ libelles }) => libelles.includes("Majeures préparées avec leur plan")).length, noms.filter((fichier) => /^maj-.+-plan\.pdf$/.test(fichier)).length, id);
  }
});

test("les aperçus des packs réemploient les images publiques des fiches correspondantes", () => {
  const formations = page("formations.html");
  for (const [carte, id] of cartes) {
    const liens = Array.from(carte.matchAll(/<a\b[^>]+href="([^"]+)"[^>]*>/g), ([, href]) => href);
    assert.deepEqual(liens, contenuParMatiere(carte).map(({ extrait }) => extrait), id);
    for (const extrait of liens) {
      const matiere = extrait.split("/").at(-2);
      const boutonCatalogue = formations.match(new RegExp(`<button\\b[^>]*data-apercu-cta="${matiere}"[^>]*>`))?.[0];
      assert.ok(boutonCatalogue?.includes(`"${extrait}"`), extrait);
      assert.ok(existsSync(join(racine, extrait)), extrait);
    }
  }
});
