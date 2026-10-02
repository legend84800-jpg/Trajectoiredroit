const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { MATIERES } = require("../scripts/mapping-matieres");
const { libelleApercu, presentationPackMatiere } = require("../scripts/libelles-offres");
const ROOT = path.join(__dirname, "..");

test("un même produit garde le même titre précis dans tous les aperçus", () => {
  let controles = 0;
  for (const fichier of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    for (const [tag] of html.matchAll(/<button\b[^>]*\bdata-apercu-title="[^"]*"[^>]*>/g)) {
      const id = tag.match(/data-apercu-cta="([^"]+)"/)?.[1];
      const attendu = libelleApercu(id);
      if (!attendu) continue;
      assert.equal(tag.match(/data-apercu-title="([^"]+)"/)[1], attendu, `${fichier}, ${id}`);
      assert.match(attendu, / · L[123](?: S[12])? · (Fiche complète|Cours complet|Majeures préparées)$/);
      controles++;
    }
  }
  assert.ok(controles >= 271);
  assert.equal(libelleApercu("produit-inconnu"), null);
});

test("les quatorze packs matière distinguent contenu livré et formats séparés", () => {
  for (const [slug, matiere] of Object.entries(MATIERES).filter(([,m]) => m.packMatiere)) {
    const html = fs.readFileSync(path.join(ROOT, `${slug}.html`), "utf8");
    const { titre, description } = presentationPackMatiere(matiere);
    assert.ok(html.includes(`<h3 style="margin-top:0">${titre}</h3>`), slug);
    assert.ok(html.includes(description), slug);
    assert.ok(description.includes("s'achètent à part"));
    const fichiers = PRODUITS[matiere.packMatiere.id].blobs;
    assert.ok(fichiers.every((url) => !/\/(cours-|maj-)/.test(url)), slug);
    assert.match(description, fichiers.some((u) => /dissertation-/.test(u)) ? /dissertations corrigées/ : /cas pratique/);
    if (slug === "droit-des-societes-l3") assert.match(description, /QCM de S1/);
  }
});

test("les neuf listes annuelles repliées correspondent aux fichiers réellement livrés", () => {
  let controles = 0;
  for (const fichier of ["formations.html", "cours-fiches.html", "majeures-preparees.html"]) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    for (const [bloc, id] of html.matchAll(/<details\b[^>]*data-pack-inclus="([^"]+)"[^>]*>[\s\S]*?<\/details>/g)) {
      assert.doesNotMatch(bloc.split(">")[0], /\bopen\b/);
      const attendus = PRODUITS[id].blobs.map((url) => url.split("/").pop())
        .filter((f) => /\.pdf$/.test(f) && !/-plan|-cartesmentales/.test(f)).map((f) => f.slice(0, -4));
      const annonces = [...bloc.matchAll(/data-produit-inclus="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(annonces, attendus, `${fichier}, ${id}`);
      assert.ok(bloc.includes(`Voir les ${attendus.length} `), id);
      controles++;
    }
  }
  assert.equal(controles, 9);
});

test("le pack Cours L2 annonce neuf cours et les annexes effectivement livrées", () => {
  const html = fs.readFileSync(path.join(ROOT, "cours-fiches.html"), "utf8");
  const carte = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].find(([s]) => s.includes('data-tjd-produit="pack-cours-complets-l2"'))[0];
  assert.match(carte, /<span>9 cours<\/span>/);
  assert.equal(PRODUITS["pack-cours-complets-l2"].nom, "Pack Cours L2 (8 cours L2 + Droit pénal général L1 S2)");
  assert.match(carte, /finances publiques et la philosophie du droit ont leur plan seul/);
  assert.ok(PRODUITS["pack-cours-complets-l2"].blobs.filter((f) => /cartesmentales\.pdf$/.test(f)).length === 7);
});

test("les packs de corrigés et de révision comptent des documents plutôt que des matières distinctes", () => {
  for (const fichier of ["revisions.html", "corriges.html", "cas-pratiques-corriges.html", "flashcards-qcm.html"]) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    for (const [carte] of html.matchAll(/<article\b[\s\S]*?<\/article>/g)) {
      const id = carte.match(/data-tjd-produit="(pack-[^"]+)"/)?.[1];
      if (!id || !/pack-(fiches-arret|commentaires-arret|cas-pratiques|flashcards-qcm)/.test(id)) continue;
      const noms = PRODUITS[id].blobs.map((u) => u.split("/").pop());
      const cartes = id.startsWith("pack-flashcards-qcm");
      const principaux = noms.filter((f) => cartes ? /-flashcards\.pdf$/.test(f) : /\.pdf$/.test(f) && !/-plan|-cartesmentales|-textes-des-arrets/.test(f));
      const unit = cartes && id !== "pack-flashcards-qcm-l3" ? "séries" : cartes ? "matières" : "recueils";
      assert.ok(carte.includes(`<span>${principaux.length} ${unit}</span>`), `${fichier}, ${id}`);
    }
  }
});

test("l'usage en TD vient du retour de Julien sans délai de résolution promis", () => {
  const html = fs.readFileSync(path.join(ROOT, "majeures-preparees.html"), "utf8");
  assert.match(html, /De nombreux élèves me disent qu'ils utilisent les majeures préparées en parallèle des TD\./);
  assert.match(html, /conditions une par une aux faits de l'énoncé pour vérifier si chacune est remplie/);
  assert.doesNotMatch(html, /en deux secondes|en 2 secondes/);
});
