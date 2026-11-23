const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const produits = require("../api/_produits");

const racine = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(racine, "quiz-orienteur.html"), "utf8");
const catalogue = fs.readFileSync(path.join(racine, "formations.html"), "utf8");
const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1])
  .find(source => source.includes("var MATIERES"));

function quiz() {
  const elements = new Map();
  function element() {
    return {
      enfants: [],
      listeners: {},
      style: {},
      addEventListener(nom, callback) { this.listeners[nom] = callback; },
      appendChild(enfant) { this.enfants.push(enfant); },
      set innerHTML(value) { this.html = value; this.enfants = []; },
      get innerHTML() { return this.html || ""; },
    };
  }
  function getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  const document = { getElementById, createElement: element };
  const contexte = { document, window: { scrollTo() {} } };
  vm.runInNewContext(script, contexte);

  function choisir(reponse) {
    const option = getElementById("optionsBox").enfants.find(bouton => bouton.textContent === reponse);
    assert.ok(option, reponse);
    option.listeners.click();
  }
  function allerAuxObjectifs(niveau, matiere, echeance) {
    getElementById("startBtn").listeners.click();
    for (const reponse of [niveau, matiere, echeance]) choisir(reponse);
  }

  return {
    matieres: contexte.MATIERES,
    objectifs(niveau, matiere) {
      allerAuxObjectifs(niveau, matiere, "Moins de 2 semaines");
      return getElementById("optionsBox").enfants.map(bouton => bouton.textContent);
    },
    repondre(niveau, matiere, objectif, echeance = "Moins de 2 semaines") {
      allerAuxObjectifs(niveau, matiere, echeance);
      choisir(objectif);
      return {
        titre: getElementById("resultTitle").textContent,
        conseil: getElementById("resultLead").textContent,
        cta: getElementById("ctaMain").innerHTML,
        complement: getElementById("ctaSecondary").innerHTML,
      };
    },
  };
}

test("chaque matière du quiz renvoie à des supports disponibles", () => {
  for (const matiere of Object.values(quiz().matieres).flat()) {
    const fiche = produits[matiere.fiche];
    assert.ok(fiche && !fiche.venteSuspendue, matiere.fiche);

    const suffixe = matiere.fiche.match(/^fiche-(.+)$/);
    const idFlashcards = suffixe && "flashcards-qcm-" + suffixe[1];
    const flashcards = idFlashcards && produits[idFlashcards];
    if (flashcards && !flashcards.venteSuspendue) {
      assert.equal(matiere.fc, idFlashcards, matiere.nom);
      continue;
    }

    if (matiere.ficheCatalogue) {
      const carte = catalogue.match(new RegExp('<article id="' + matiere.fiche + '"[^>]*>([\\s\\S]*?)</article>'));
      assert.ok(carte, matiere.fiche);
      assert.equal(matiere.ficheCatalogue.titre, fiche.nom);
      assert.ok(carte[1].includes('<h3 class="product__title">' + matiere.nom + '</h3>'), matiere.nom);
      assert.ok(carte[1].includes('<p class="product__desc">' + matiere.ficheCatalogue.description + '</p>'), matiere.nom);
      continue;
    }

    assert.equal(matiere.fc, undefined, matiere.nom);
    if (matiere.casPratiques) {
      const id = matiere.casPratiques.id;
      const casCorriges = produits[id];
      assert.ok(casCorriges && !casCorriges.venteSuspendue, id);
      const page = fs.readFileSync(path.join(racine, "cas-pratiques-corriges.html"), "utf8");
      assert.equal(page.split('id="recueils-cas-pratiques"').length, 2);
      assert.ok(page.includes(`<option value="${id}"`), id);
      continue;
    }

    const [page, ancre] = matiere.guide.split("#");
    assert.equal(ancre, "teste-toi");
    const guide = fs.readFileSync(path.join(racine, page), "utf8");
    const questions = guide.match(/<section[^>]*id="teste-toi"[^>]*>([\s\S]*?)<\/section>/);
    assert.ok(questions, matiere.guide);
    assert.equal((questions[1].match(/<details\b/g) || []).length, 4, matiere.guide);
  }
});

test("le nombre affiché correspond aux matières distinctes du quiz", () => {
  const distinctes = new Set(Object.values(quiz().matieres).flat().map(matiere => matiere.nom));
  assert.match(html, new RegExp('>' + distinctes.size + '</div><div[^>]+>matières couvertes'));
});

for (const [nom, ancre] of [
  ["Finances publiques", "cours-fiche-finances-publiques-l2-s1"],
  ["Philosophie du droit", "cours-fiche-philo-droit-l2-s1"],
]) {
  const matiere = nom + " (S1)";
  const comprendre = "Comprendre et apprendre tout le cours";
  const methode = "Revoir la méthode des exercices plutôt que le contenu";
  const aide = "Je bloque sur un point précis, j'ai besoin d'aide individuelle";
  test(nom + " propose seulement la fiche, les méthodes et l’aide individuelle", () => {
    assert.deepEqual(quiz().objectifs("L2", matiere), [comprendre, methode, aide]);
    assert.ok(quiz().repondre("L2", matiere, methode).cta.includes('href="methodologie-juridique.html"'));
    assert.ok(quiz().repondre("L2", matiere, aide).cta.includes('href="cours-particuliers.html#reserver"'));

    for (const echeance of ["Moins de 2 semaines", "Je commence tout juste le semestre"]) {
      const resultat = quiz().repondre("L2", matiere, comprendre, echeance);
      assert.equal(resultat.titre, produits[ancre].nom);
      assert.ok(resultat.cta.includes('href="formations.html#' + ancre + '"'));
      assert.match(resultat.cta, /Voir la fiche du S1/);
      assert.doesNotMatch(resultat.cta, /data-tjd-produit|Acheter|€/);
      assert.equal(resultat.complement, "");
    }
  });
}

const cas = [
  ["L1", "Histoire des institutions (S2)", "histoire-des-institutions-l1.html#teste-toi"],
  ["L3", "Procédure pénale", "procedure-penale-l3.html#teste-toi"],
];
for (const [niveau, matiere, guide] of cas) {
  test(matiere + " permet de réviser gratuitement sans proposer de flashcards indisponibles", () => {
    const revision = quiz().repondre(niveau, matiere, "Réviser vite en testant ce que je retiens");
    assert.equal(revision.titre, "Quatre questions pour te tester");
    assert.ok(revision.cta.includes('href="' + guide + '"'));
    assert.doesNotMatch(revision.cta, /data-tjd-produit|Acheter/);

    const comprendre = quiz().repondre(niveau, matiere, "Comprendre et apprendre tout le cours");
    assert.match(comprendre.cta, /data-tjd-produit="fiche-/);
    assert.equal(comprendre.complement, "");
  });
}

test("en histoire des institutions, le quiz recommande les dates et les textes du cours", () => {
  const resultat = quiz().repondre("L1", "Histoire des institutions (S2)", "Retenir les dates et les textes clés");
  assert.equal(resultat.titre, "Les dates et les textes clés du S2");
  assert.match(resultat.cta, /href="histoire-des-institutions-l1\.html#reperes"/);
  assert.match(resultat.cta, /Voir les textes et dates à retenir/);

  const guide = fs.readFileSync(path.join(racine, "histoire-des-institutions-l1.html"), "utf8");
  assert.equal(guide.split('id="reperes"').length, 2);

  const arrets = quiz().repondre("L2", "Droit administratif (S2)", "Connaître les arrêts par cœur");
  assert.match(arrets.cta, /href="revisions\.html"/);
});

test("une matière qui a des flashcards garde le bouton d’achat et le conseil avant l’examen", () => {
  const matiere = "Droit administratif (S2)";
  const revision = quiz().repondre("L2", matiere, "Réviser vite en testant ce que je retiens");
  assert.match(revision.cta, /data-tjd-produit="flashcards-qcm-da-l2-s2"/);
  assert.match(revision.cta, /Acheter les flashcards · 9,99 €/);

  const comprendre = quiz().repondre("L2", matiere, "Comprendre et apprendre tout le cours");
  assert.match(comprendre.cta, /data-tjd-produit="fiche-da-l2-s2"/);
  assert.ok(comprendre.complement.includes('href="flashcards-qcm.html#flashcards-qcm-da-l2-s2"'));
});

const societesS2 = "Droit des sociétés (S2)";
const lienCasSocietesS2 = "cas-pratiques-corriges.html?matiere=cas-pratique-societes-l3-s2#recueils-cas-pratiques";

test("le quiz distingue les fiches de droit des sociétés des deux semestres", () => {
  const objectif = "Comprendre et apprendre tout le cours";
  const s2 = quiz().repondre("L3", societesS2, objectif);
  assert.match(s2.cta, /data-tjd-produit="fiche-societes-l3-s2"/);
  assert.equal(s2.complement, `Pour préparer ton partiel, tu peux ensuite traiter <a href="${lienCasSocietesS2}">les cas pratiques corrigés du S2</a>.`);

  const s1 = quiz().repondre("L3", "Droit des sociétés (S1)", objectif);
  assert.match(s1.cta, /data-tjd-produit="fiche-societes-l3-s1"/);
  assert.ok(s1.complement.includes('href="flashcards-qcm.html#flashcards-qcm-societes-l3-s1"'));
});

test("le quiz propose les cas pratiques corrigés du S2 pour réviser ou s’entraîner", () => {
  for (const objectif of [
    "Réviser vite en testant ce que je retiens",
    "Avoir plus de 15/20 en cas pratique et en commentaire",
  ]) {
    const resultat = quiz().repondre("L3", societesS2, objectif);
    assert.equal(resultat.titre, "Les cas pratiques corrigés du S2");
    assert.equal(resultat.conseil, "Les 12 cas pratiques et les 4 sujets de partiel sont tous corrigés. Traite d’abord un énoncé. Ensuite, compare ton raisonnement avec le corrigé.");
    assert.ok(resultat.cta.includes(`href="${lienCasSocietesS2}"`));
    assert.match(resultat.cta, /Voir les cas pratiques corrigés/);
    assert.doesNotMatch(resultat.cta, /data-tjd-produit|Acheter/);
  }
});

test("pour les arrêts de droit des sociétés du S2, le quiz renvoie à la fiche du semestre", () => {
  const resultat = quiz().repondre("L3", societesS2, "Connaître les arrêts par cœur");
  const formations = fs.readFileSync(path.join(racine, "formations.html"), "utf8");
  assert.equal(formations.split('id="fiche-societes-l3-s2"').length, 2);
  assert.equal(resultat.titre, "Les arrêts dans la fiche du S2");
  assert.equal(resultat.conseil, "La fiche présente les décisions avec les règles du cours qu’elles illustrent.");
  assert.match(resultat.cta, /href="formations\.html#fiche-societes-l3-s2"/);
  assert.match(resultat.cta, /Voir la fiche du S2/);
});

test("les conseils du quiz ouvrent une offre précise qui existe sur le site", () => {
  const objectif = "Comprendre et apprendre tout le cours";
  const flashcards = fs.readFileSync(path.join(racine, "flashcards-qcm.html"), "utf8");
  const formations = fs.readFileSync(path.join(racine, "formations.html"), "utf8");

  for (const [niveau, matieres] of Object.entries(quiz().matieres)) {
    for (const matiere of matieres) {
      const nom = matiere.nom + (matiere.sem ? ` (${matiere.sem})` : "");
      if (matiere.fc) {
        const { complement } = quiz().repondre(niveau, nom, objectif);
        assert.ok(complement.includes(`href="flashcards-qcm.html#${matiere.fc}"`), nom);
        assert.equal(flashcards.split(`id="${matiere.fc}"`).length, 2, nom);
      }
    }

    const premiereMatiere = matieres[0];
    const nom = `${premiereMatiere.nom} (${premiereMatiere.sem})`;
    const { complement } = quiz().repondre(niveau, nom, objectif, "Je commence tout juste le semestre");
    const pack = `pack-${niveau.toLowerCase()}`;
    assert.ok(complement.includes(`href="formations.html#${pack}"`), niveau);
    assert.equal(formations.split(`id="${pack}"`).length, 2, niveau);
  }
});
