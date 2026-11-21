const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const produits = require("../api/_produits");

const racine = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(racine, "quiz-orienteur.html"), "utf8");
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

  return {
    matieres: contexte.MATIERES,
    repondre(niveau, matiere, objectif, echeance = "Moins de 2 semaines") {
      getElementById("startBtn").listeners.click();
      for (const reponse of [niveau, matiere, echeance, objectif]) {
        const option = getElementById("optionsBox").enfants.find(bouton => bouton.textContent === reponse);
        assert.ok(option, reponse);
        option.listeners.click();
      }
      return {
        titre: getElementById("resultTitle").textContent,
        cta: getElementById("ctaMain").innerHTML,
        complement: getElementById("ctaSecondary").innerHTML,
      };
    },
  };
}

test("chaque matière du quiz renvoie aux flashcards disponibles ou aux questions du guide", () => {
  for (const matiere of Object.values(quiz().matieres).flat()) {
    const fiche = produits[matiere.fiche];
    assert.ok(fiche && !fiche.venteSuspendue, matiere.fiche);

    const idFlashcards = matiere.fiche.replace(/^fiche-/, "flashcards-qcm-");
    const flashcards = produits[idFlashcards];
    if (flashcards && !flashcards.venteSuspendue) {
      assert.equal(matiere.fc, idFlashcards, matiere.nom);
      continue;
    }

    assert.equal(matiere.fc, undefined, matiere.nom);
    const [page, ancre] = matiere.guide.split("#");
    assert.equal(ancre, "teste-toi");
    const guide = fs.readFileSync(path.join(racine, page), "utf8");
    const questions = guide.match(/<section[^>]*id="teste-toi"[^>]*>([\s\S]*?)<\/section>/);
    assert.ok(questions, matiere.guide);
    assert.equal((questions[1].match(/<details\b/g) || []).length, 4, matiere.guide);
  }
});

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

test("une matière qui a des flashcards garde le bouton d’achat et le conseil avant l’examen", () => {
  const matiere = "Droit administratif (S2)";
  const revision = quiz().repondre("L2", matiere, "Réviser vite en testant ce que je retiens");
  assert.match(revision.cta, /data-tjd-produit="flashcards-qcm-da-l2-s2"/);
  assert.match(revision.cta, /Acheter les flashcards · 9,99 €/);

  const comprendre = quiz().repondre("L2", matiere, "Comprendre et apprendre tout le cours");
  assert.match(comprendre.cta, /data-tjd-produit="fiche-da-l2-s2"/);
  assert.ok(comprendre.complement.includes('href="flashcards-qcm.html#flashcards-qcm-da-l2-s2"'));
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
