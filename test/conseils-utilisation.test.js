const test = require("node:test");
const assert = require("node:assert/strict");
const PRODUITS = require("../api/_produits");
const { construireConseilUtilisation, PARAGRAPHES_MAJEURES } = require("../api/_conseils-utilisation");
const { construireEmailEtudiant, construireEmailParent } = require("../api/_cadeau");
const { envoyerEmail } = require("../api/stripe-webhook")._test;

const TEXTE = PARAGRAPHES_MAJEURES.join("\n\n");

test("les majeures seules et les packs qui en contiennent reçoivent le conseil", () => {
  const references = Object.keys(PRODUITS).filter((id) =>
    id.startsWith("maj-") || id.startsWith("pack-majeures-")
      || (PRODUITS[id].inclus || []).some((reference) => reference.startsWith("maj-"))
  );
  assert.ok(references.length > 20);
  for (const id of references) {
    const conseil = construireConseilUtilisation([PRODUITS[id]]);
    assert.equal(conseil.texte, TEXTE, id);
    assert.equal((conseil.html.match(/<p /g) || []).length, PARAGRAPHES_MAJEURES.length, id);
    for (const paragraphe of PARAGRAPHES_MAJEURES) assert.ok(conseil.html.includes(paragraphe), id);
  }
});

test("les autres formats et les packs sans majeures conservent un email sans ce conseil", () => {
  for (const id of ["fiche-intro-droit-l1", "flashcards-qcm-intro-droit-l1", "pack-matiere-intro-droit-l1", "stage-methode"]) {
    assert.ok(PRODUITS[id], id);
    assert.deepEqual(construireConseilUtilisation([PRODUITS[id]]), { html: "", texte: "" }, id);
  }
  assert.deepEqual(construireConseilUtilisation([]), { html: "", texte: "" });
});

test("un panier avec plusieurs majeures reçoit le conseil une seule fois", () => {
  const conseil = construireConseilUtilisation([
    PRODUITS["fiche-intro-droit-l1"], PRODUITS["maj-intro-droit-l1"], PRODUITS["maj-personnes-l1"],
  ]);
  assert.equal(conseil.texte, TEXTE);
  assert.equal(conseil.html.split(PARAGRAPHES_MAJEURES[0]).length - 1, 1);
});

test("l'email Brevo place le même conseil après l'accès aux fichiers, en HTML et en texte", async () => {
  const ancienFetch = global.fetch;
  const appels = [];
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    appels.push(JSON.parse(options.body));
    return { ok: true };
  };
  try {
    for (const id of ["maj-intro-droit-l1", "pack-majeures-l2", "pack-ultra-l1-s1", "fiche-intro-droit-l1"]) {
      const produit = PRODUITS[id];
      const liens = produit.inclus ? [] : [{ nom: produit.nom, url: "https://example.invalid/download" }];
      await envoyerEmail("etudiant@example.invalid", [produit], liens, "cle_factice", null);
      const payload = appels.at(-1);
      const conseil = construireConseilUtilisation([produit]);
      assert.equal(payload.to[0].email, "etudiant@example.invalid");
      assert.equal(payload.subject, `Ton achat : ${produit.nom}`);
      if (!conseil.texte) {
        assert.ok(!payload.htmlContent.includes(PARAGRAPHES_MAJEURES[0]));
        assert.ok(!payload.textContent.includes(TEXTE));
        continue;
      }
      assert.equal(payload.htmlContent.split(PARAGRAPHES_MAJEURES[0]).length - 1, 1);
      assert.equal(payload.textContent.split(TEXTE).length - 1, 1);
      assert.ok(payload.htmlContent.includes(conseil.html));
      const repereAcces = produit.inclus ? "Accéder à mon Pack Ultra</a>" : "Télécharger " + produit.nom;
      assert.ok(payload.htmlContent.indexOf(PARAGRAPHES_MAJEURES[0]) > payload.htmlContent.indexOf(repereAcces));
      const repereTexte = produit.inclus ? "https://trajectoiredroit.com/mon-compte.html" : "https://example.invalid/download";
      assert.ok(payload.textContent.indexOf(TEXTE) > payload.textContent.indexOf(repereTexte));
      assert.match(conseil.html, /margin:24px 0 24px/);
      assert.match(conseil.html, /margin:0 0 24px/);
    }
  } finally {
    global.fetch = ancienFetch;
  }
});

test("le conseil va à l'étudiant recevant un cadeau, et la confirmation du parent reste distincte", () => {
  const cadeau = { email: "etudiant@example.invalid", prenom: "Camille", message: "Bon travail !" };
  const produits = [PRODUITS["pack-ultra-l1-s1"]];
  const etudiant = construireEmailEtudiant({ cadeau, nomOffrant: "Parent", produits, liens: [] });
  assert.ok(etudiant.html.includes(construireConseilUtilisation(produits).html));
  assert.ok(etudiant.texte.includes(TEXTE));
  assert.ok(etudiant.html.indexOf(PARAGRAPHES_MAJEURES[0]) > etudiant.html.indexOf("Accéder à mon Pack Ultra</a>"));
  const parent = construireEmailParent({ cadeau, produits, metadata: {}, montantCentimes: 23900 });
  assert.ok(!parent.html.includes(PARAGRAPHES_MAJEURES[0]));
  assert.ok(!parent.texte.includes(TEXTE));
});
