const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const cleSelection = "tjd_kit_partiels_selection";
const catalogue = readFileSync(join(__dirname, "../assets/kit-partiels/catalogue.js"), "utf8");
const composer = readFileSync(join(__dirname, "../assets/kit-partiels/composer.js"), "utf8");

function ouvrirKit(sessionStorage) {
  let champActif;
  const element = () => ({
    children: [],
    dataset: {},
    attributs: {},
    append(...enfants) { this.children.push(...enfants); },
    replaceChildren(...enfants) { this.children = enfants; },
    setAttribute(nom, valeur) { this.attributs[nom] = valeur; },
    addEventListener(type, traiter) { if (type === "click") this.clic = traiter; },
    focus() { champActif = this; },
  });
  const champs = new Map();
  const radios = {};
  const paiement = { name: "paiement", value: "1" };
  let traiterChangement;
  for (const valeur of ["l1", "l2", "l3"]) {
    radios[valeur] = {
      name: "niveau",
      value: valeur,
      get checked() { return radios.actif === valeur; },
      set checked(etat) { if (etat) radios.actif = valeur; },
    };
    champs.set(`input[name="niveau"][value="${valeur}"]`, radios[valeur]);
  }
  radios.actif = "l2";
  champs.set('input[name="paiement"]:checked', paiement);
  const form = {
    querySelector(selecteur) {
      if (selecteur === 'input[name="niveau"]:checked') return radios[radios.actif];
      if (!champs.has(selecteur)) champs.set(selecteur, element());
      return champs.get(selecteur);
    },
    addEventListener(type, traiter) {
      if (type === "change") traiterChangement = traiter;
    },
  };
  const listeMatieres = form.querySelector("#matieres");
  listeMatieres.querySelectorAll = () => listeMatieres.children.map((label) => label.children[0]);
  listeMatieres.querySelector = (selecteur) => {
    assert.equal(selecteur, "input:not(:checked):not(:disabled)");
    return listeMatieres.querySelectorAll().find((input) => !input.checked && !input.disabled);
  };
  const document = {
    querySelector: () => form,
    querySelectorAll: () => [],
    createElement: element,
    createTextNode: (texte) => ({ textContent: texte }),
  };
  const window = { sessionStorage };
  vm.runInNewContext(catalogue, { window });
  vm.runInNewContext(composer, { window, document });

  return {
    get niveau() { return radios.actif; },
    get matieres() { return listeMatieres.querySelectorAll().filter((input) => input.checked).map((input) => input.value); },
    get compteur() { return champs.get("#compteur").textContent; },
    get paiement() { return paiement.value; },
    get pack() { return champs.get("#duo-partiels").hidden ? null : champs.get("#duo-partiels-lien").href; },
    get commander() { return !champs.get("#commander").disabled; },
    get champActif() { return champActif?.value; },
    get boutonsRetirer() {
      return (champs.get("#selection").children[0]?.children || []).map((li) => li.children[1]);
    },
    choisirNiveau(valeur) {
      radios[valeur].checked = true;
      traiterChangement({ target: radios[valeur] });
    },
    choisirMatiere(code, etat = true) {
      const input = listeMatieres.querySelectorAll().find((item) => item.value === code);
      assert.ok(input && !input.disabled);
      input.checked = etat;
      traiterChangement({ target: input });
    },
    choisirPaiement(valeur) {
      paiement.value = valeur;
      traiterChangement({ target: paiement });
    },
  };
}

function stockage() {
  const valeurs = new Map();
  return {
    getItem(cle) { return valeurs.get(cle) ?? null; },
    setItem(cle, valeur) { valeurs.set(cle, valeur); },
  };
}

test("retrouve le niveau et les matières après rechargement dans le même onglet", () => {
  for (const [niveau, matieres] of [
    ["l1", ["constitutionnel-s1", "intro-droit", "histoire-du-droit"]],
    ["l2", ["contrats", "administratif-s1", "penal"]],
    ["l3", ["travail", "societes", "contrats-speciaux"]],
  ]) {
    const session = stockage();
    const kit = ouvrirKit(session);
    kit.choisirNiveau(niveau);
    matieres.forEach((code) => kit.choisirMatiere(code));
    kit.choisirPaiement("2");

    assert.deepEqual(JSON.parse(session.getItem(cleSelection)), { niveau, codes: matieres });
    const retour = ouvrirKit(session);
    assert.equal(retour.niveau, niveau);
    assert.deepEqual(retour.matieres, matieres);
    assert.equal(retour.compteur, "3 sur 3");
    assert.equal(retour.commander, true);
    assert.equal(retour.paiement, "1");
  }
});

test("retrouve le duo à comparer et conserve le retrait d’une matière", () => {
  const session = stockage();
  const kit = ouvrirKit(session);
  kit.choisirMatiere("contrats");
  kit.choisirMatiere("administratif-s1");

  const retour = ouvrirKit(session);
  assert.equal(retour.pack, "packs-partiels.html#pack-partiel-l2-s1");
  assert.equal(retour.commander, false);
  retour.choisirMatiere("contrats", false);
  assert.deepEqual(ouvrirKit(session).matieres, ["administratif-s1"]);

  retour.choisirNiveau("l3");
  const nouveauNiveau = ouvrirKit(session);
  assert.equal(nouveauNiveau.niveau, "l3");
  assert.equal(nouveauNiveau.compteur, "0 sur 3");
});

test("retire une matière depuis le récapitulatif et place le focus dans les choix", () => {
  const session = stockage();
  const kit = ouvrirKit(session);
  ["contrats", "administratif-s1", "penal"].forEach((code) => kit.choisirMatiere(code));
  kit.choisirPaiement("2");

  const retirer = kit.boutonsRetirer.find((bouton) => bouton.attributs["aria-label"] === "Retirer Droit pénal (S1)");
  assert.ok(retirer);
  assert.equal(retirer.type, "button");
  assert.equal(retirer.textContent, "Retirer");
  retirer.clic();

  assert.equal(kit.champActif, "penal");
  assert.equal(kit.compteur, "2 sur 3");
  assert.equal(kit.commander, false);
  assert.equal(kit.paiement, "2");
  assert.equal(kit.pack, "packs-partiels.html#pack-partiel-l2-s1");
  assert.deepEqual(ouvrirKit(session).matieres, ["contrats", "administratif-s1"]);

  kit.choisirMatiere("biens");
  assert.equal(kit.commander, true);
  assert.equal(kit.pack, null);
  assert.deepEqual(ouvrirKit(session).matieres, ["contrats", "administratif-s1", "biens"]);

  const retirerAdministratif = kit.boutonsRetirer.find((bouton) => bouton.attributs["aria-label"] === "Retirer Droit administratif (S1)");
  assert.ok(retirerAdministratif);
  retirerAdministratif.clic();
  kit.choisirMatiere("administratif-s2");
  assert.deepEqual(ouvrirKit(session).matieres, ["contrats", "administratif-s2", "biens"]);
});

test("écarte les codes périmés, les doublons de discipline et les choix en trop", () => {
  const session = stockage();
  session.setItem(cleSelection, JSON.stringify({
    niveau: "l2",
    codes: ["civil-obsolete", "societes", null, "administratif-s1", "administratif-s2", "contrats", "contrats", "penal", "biens"],
  }));

  const kit = ouvrirKit(session);
  assert.deepEqual(kit.matieres, ["contrats", "administratif-s1", "penal"]);
  assert.equal(kit.compteur, "3 sur 3");
});

test("ouvre une sélection vide en L2 lorsque le stockage est invalide ou indisponible", () => {
  const bloquer = () => { throw new Error("Stockage indisponible"); };
  const invalide = stockage();
  for (const valeur of [null, "{invalide", '{"niveau":"__proto__","codes":[]}', '{"niveau":"l1","codes":null}']) {
    invalide.setItem(cleSelection, valeur);
    const kit = ouvrirKit(invalide);
    assert.equal(kit.niveau, "l2");
    assert.deepEqual(kit.matieres, []);
  }
  const kit = ouvrirKit({ getItem: bloquer, setItem: bloquer });
  assert.equal(kit.niveau, "l2");
  kit.choisirMatiere("contrats");
  assert.deepEqual(kit.matieres, ["contrats"]);
});
