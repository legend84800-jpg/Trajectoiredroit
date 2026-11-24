const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { MATIERES } = require("../scripts/mapping-matieres");
const { libelleApercu, presentationPackMatiere } = require("../scripts/libelles-offres");
const { synchroniser, verifierPrix, presentationPack } = require("../scripts/synchroniser-presentations-catalogue");
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
  // 262 depuis le 22/10/2026 : douze aperçus de la fiche Contrats L2 S1 ont
  // laissé place à ceux du cours en images, testé jusqu'au 13/11/2026.
  // 223 depuis le 15/11/2026 : les 47 fiches d'arrêt passées au commentaire corrigé à
  // 4,99 € (audit CTA, C3, D4 et F2) n'affichent plus les aperçus de la fiche complète.
  assert.ok(controles >= 180);
  assert.equal(libelleApercu("produit-inconnu"), null);
});

test("les quatorze packs matière distinguent contenu livré et formats séparés", () => {
  for (const [slug, matiere] of Object.entries(MATIERES).filter(([,m]) => m.packMatiere)) {
    const html = fs.readFileSync(path.join(ROOT, `${slug}.html`), "utf8");
    const { description } = presentationPackMatiere(matiere);
    // Depuis le 10/10/2026, le pack est présenté dans le bloc d'offre principal
    // (offre-matiere), avec son prix barré et la liste de ce qu'il contient.
    const option = html.match(/<div class="offre-matiere__option offre-matiere__option--pack">[\s\S]*?<\/div>/)?.[0] || "";
    assert.ok(option.includes(`data-tjd-produit="${matiere.packMatiere.id}"`), slug);
    assert.match(option, /<s>[0-9]+,[0-9]{2} €<\/s>/, slug);
    assert.match(option, /offre-matiere__contenu/, slug);
    assert.ok(description.includes("s'achètent à part"));
    const fichiers = PRODUITS[matiere.packMatiere.id].blobs;
    assert.ok(fichiers.every((url) => !/\/(cours-|maj-)/.test(url)), slug);
    assert.match(description, fichiers.some((u) => /dissertation-/.test(u)) ? /dissertations corrigées/ : /cas pratique/);
    if (slug === "droit-des-societes-l3") assert.match(description, /QCM de S1/);
  }
});

test("les sept listes annuelles repliées correspondent aux fichiers réellement livrés", () => {
  let controles = 0;
  for (const fichier of ["formations.html", "majeures-preparees.html"]) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    for (const [bloc, id] of html.matchAll(/<details\b[^>]*data-pack-inclus="([^"]+)"[^>]*>[\s\S]*?<\/details>/g)) {
      assert.doesNotMatch(bloc.split(">")[0], /\bopen\b/);
      const attendus = PRODUITS[id].blobs.map((url) => url.split("/").pop())
        .filter((f) => /\.pdf$/.test(f) && !/-plan|-cartesmentales|-exercice/.test(f)).map((f) => f.slice(0, -4));
      const annonces = [...bloc.matchAll(/data-produit-inclus="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(annonces, attendus, `${fichier}, ${id}`);
      assert.ok(bloc.includes(`Voir les ${attendus.length} `), id);
      controles++;
    }
  }
  assert.equal(controles, 7);
});

test("les présentations générées restent à jour avec le catalogue de livraison", () => {
  for (const fichier of ["index.html", "formations.html"]) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    assert.ok(synchroniser(html, fichier) === html, `${fichier}, présentation à régénérer`);
    assert.deepEqual(verifierPrix(html, fichier), [], fichier);
  }
  const licence = presentationPack("pack-complet");
  assert.equal(licence.nombre, 22);
  assert.equal(licence.totalPdf, 63);
  assert.equal(licence.totalUnite, 43978);
  assert.equal(licence.economie, 59);
  assert.match(licence.description, /cartes mentales de 19 fiches/);
  const l2 = presentationPack("pack-l2");
  assert.equal(l2.nombre, 8);
  assert.equal(l2.totalPdf, 22);
  assert.equal(l2.cartes, 6);
  assert.equal(l2.totalUnite, 15992);
  assert.equal(l2.economie, 51);
});

test("le nombre de fiches des packs annuels se régénère sur l’accueil", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const marque = /(<li data-nombre-fiches-packs-annuels>)[^<]+(<\/li>)/;
  assert.match(html, marque);
  const ancienneValeur = html.replace(marque, (_, debut, fin) => `${debut}99 fiches en L1, 99 en L2 et 99 en L3${fin}`);
  assert.notEqual(ancienneValeur, html);
  assert.equal(synchroniser(ancienneValeur, "index.html"), html);
});

test("les guides par matière de l’accueil ouvrent une section de lecture existante", () => {
  const accueil = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const bloc = accueil.match(/<div class="flex guides-matieres"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  const liens = [...bloc.matchAll(/href="([^"#]+)(?:#([^"]+))?"/g)];
  assert.ok(liens.length > 2);
  for (const [, fichier, ancre] of liens) {
    if (["fiche-arrets.html", "quiz-methode.html"].includes(fichier)) continue;
    assert.ok(ancre === "programme" || ancre === "conditions", fichier);
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    assert.match(html, new RegExp(`<section\\b[^>]*\\bid="${ancre}"[^>]*>`), fichier);
  }
});

test("les cartes de guides du catalogue ouvrent directement le programme", () => {
  const catalogue = fs.readFileSync(path.join(ROOT, "formations.html"), "utf8");
  const guides = catalogue.match(/<section\b[^>]*\bid="guides"[^>]*>([\s\S]*?)<\/section>/)?.[1] || "";
  const cartes = [...guides.matchAll(/<a\b[^>]*href="([^"#]+)(?:#([^"]+))?"[^>]*>[\s\S]*?Lire le guide[\s\S]*?<\/a>/g)];
  assert.ok(cartes.length > 2);
  for (const [, fichier, ancre] of cartes) {
    assert.equal(ancre, "programme", fichier);
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    assert.match(html, /<section\b[^>]*\bid="programme"[^>]*>/, fichier);
  }
});

test("le comparatif et la rubrique Vidéos et podcasts mènent à chaque matière avec un extrait et une offre active", () => {
  const accueil = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const choix = accueil.match(/<details class="compare-podcasts">[\s\S]*?<\/details>/)?.[0] || "";
  const liens = [...choix.matchAll(/href="([^"#]+)#[^"]+"/g)].map(([, fichier]) => fichier);
  const matieres = fs.readdirSync(ROOT).filter((fichier) => {
    if (!fichier.endsWith(".html")) return false;
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    const offre = html.match(/<section\b[^>]*\bid="podcasts-videos"[^>]*>[\s\S]*?<\/section>/)?.[0];
    if (!offre || !offre.includes("<audio ") || !offre.includes("<video ")) return false;
    return [...offre.matchAll(/data-tjd-produit="(audio-video-[^"]+)"/g)]
      .some(([, id]) => PRODUITS[id] && !PRODUITS[id].venteSuspendue);
  });
  assert.ok(matieres.length > 0);
  assert.deepEqual(liens.sort(), matieres.sort());
  const page = fs.readFileSync(path.join(ROOT, "podcasts-videos.html"), "utf8");
  const catalogue = page.match(/<!-- catalogue:audio-video:start -->[\s\S]*?<!-- catalogue:audio-video:end -->/)?.[0] || "";
  const liensCatalogue = [...catalogue.matchAll(/href="([^"#]+)#podcasts-videos"/g)].map(([, fichier]) => fichier);
  assert.deepEqual(liensCatalogue.sort(), matieres);
  assert.equal([...choix.matchAll(/href="[^"#]+#podcasts-videos"/g)].length, matieres.length);
  assert.ok(choix.includes('href="droit-des-contrats-l2.html#podcasts-videos"'));
});

test("le contrôle signale un montant de bouton différent du prix réellement encaissé", () => {
  const html = '<button data-tjd-produit="pack-l1">Acheter le pack · 0,01 €</button>';
  assert.equal(verifierPrix(html, "exemple.html").length, 1);
});

test("le contrôle lit le montant de chaque échéance et conserve le plein prix pour un achat comptant", () => {
  const html = fs.readFileSync(path.join(ROOT, "pack-ultra.html"), "utf8");
  assert.deepEqual(verifierPrix(html, "pack-ultra.html"), []);
  const id = "pack-ultra-l1-s1-revision";
  const erreurs = (libelle, attribut = "") => verifierPrix(`<button data-tjd-produit="${id}" ${attribut}>${libelle}</button>`, "pack-ultra.html");
  assert.deepEqual(erreurs("Acheter · 199 €"), []);
  assert.equal(erreurs("Acheter · 99,50 €").length, 1);
  assert.equal(erreurs("3 × 66,34 €", 'data-tjd-echeances="3"').length, 1);
  assert.equal(erreurs("199 €", 'data-tjd-echeances="4"').length, 1);
});

test("le pack annuel retiré garde les cours et annexes des achats passés", () => {
  const pack = PRODUITS["pack-cours-complets-l2"];
  assert.equal(pack.venteSuspendue, true);
  assert.equal(pack.blobs.filter((f) => /cartesmentales\.pdf$/.test(f)).length, 7);
  assert.equal(pack.blobs.filter((f) => /-plan\.pdf$/.test(f)).length, 9);
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
      const unit = cartes && id !== "pack-flashcards-qcm-l3" ? "séries" : cartes ? "matières" : "PDF";
      assert.ok(carte.includes(`<span>${principaux.length} ${unit}</span>`), `${fichier}, ${id}`);
    }
  }
});

test("les libellés d'achat et d'aperçu nomment le type de PDF", () => {
  const pages = fs.readdirSync(ROOT).filter((fichier) => fichier.endsWith(".html"));
  for (const fichier of pages) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    assert.doesNotMatch(html, /(?:>|\b)Acheter le recueil\b|Voir un aperçu du recueil|>Acheter la fiche(?=\s*[·<])|>Recueil\s*·/i, fichier);
  }
  const societes = fs.readFileSync(path.join(ROOT, "sujets-droit-des-societes-l3.html"), "utf8");
  assert.match(societes, /data-tjd-produit="cas-pratique-societes-l3">Acheter les cas pratiques corrigés · 19,99 €</);
  assert.match(societes, /data-tjd-produit="fiche-societes-l3-s1">Acheter la fiche complète · 19,99 €</);
});

test("l'usage en TD vient du retour de Julien sans délai de résolution promis", () => {
  const html = fs.readFileSync(path.join(ROOT, "majeures-preparees.html"), "utf8");
  // Phrase reprise le 14/11/2026 (c66843de), même retour de Julien.
  assert.match(html, /De nombreux élèves me disent qu'ils s'en servent aussi pendant le semestre, pour préparer leurs TD\./);
  assert.match(html, /Il reste alors à vérifier, une par une, si chaque condition est remplie par les faits de l'énoncé/);
  assert.doesNotMatch(html, /en deux secondes|en 2 secondes/);
});

test("chaque bouton d’achat ou d’aperçu du site renvoie à une offre en vente", () => {
  for (const fichier of fs.readdirSync(ROOT).filter((nom) => nom.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(ROOT, fichier), "utf8");
    assert.doesNotMatch(html, /\bcours-fiches\.html|\bcours complets?\b/i, fichier);
    for (const [, id] of html.matchAll(/data-(?:tjd-produit|apercu-cta)="([a-z0-9-]+)"/g)) {
      if (PRODUITS[id]) assert.ok(!PRODUITS[id].venteSuspendue, `${fichier}, ${id}`);
    }
  }
});
