const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const cleSelection = "tjd_kit_partiels_selection";
const catalogue = readFileSync(join(__dirname, "../assets/kit-partiels/catalogue.js"), "utf8");
const composer = readFileSync(join(__dirname, "../assets/kit-partiels/composer.js"), "utf8");

function ouvrirKit(sessionStorage, recherche = "", ancienHTML = false) {
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
  const paiements = { actif: "1" };
  for (const valeur of ["1", "2"]) {
    paiements[valeur] = {
      name: "paiement",
      value: valeur,
      set checked(etat) { if (etat) paiements.actif = valeur; },
    };
    champs.set(`input[name="paiement"][value="${valeur}"]`, paiements[valeur]);
  }
  const commandes = [];
  let traiterChangement;
  let traiterSoumission;
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
  const form = {
    querySelector(selecteur) {
      if (selecteur === 'input[name="niveau"]:checked') return radios[radios.actif];
      if (selecteur === 'input[name="paiement"]:checked') return paiements[paiements.actif];
      if (!champs.has(selecteur)) champs.set(selecteur, element());
      return champs.get(selecteur);
    },
    addEventListener(type, traiter) {
      if (type === "change") traiterChangement = traiter;
      if (type === "submit") traiterSoumission = traiter;
    },
  };
  form.querySelector("#kit-matiere-info").hidden = true;
  const listeMatieres = form.querySelector("#matieres");
  if (!ancienHTML) listeMatieres.dataset.kitComplet = "false";
  listeMatieres.querySelectorAll = () => listeMatieres.children.map((label) => label.children[0]);
  Object.defineProperty(listeMatieres, "offsetParent", {
    get: () => listeMatieres.dataset.kitComplet === "true" ? null : form,
  });
  const resume = form.querySelector("#selection");
  resume.querySelector = (selecteur) => selecteur === ".selection-retirer"
    ? resume.children[0]?.children?.[0]?.children[1] : null;
  const document = {
    get activeElement() { return champActif; },
    querySelector: () => form,
    querySelectorAll: (selecteur) => [form.querySelector(selecteur)],
    createElement: element,
    createTextNode: (texte) => ({ textContent: texte }),
  };
  const location = { href: `https://trajectoiredroit.com/kit-partiels.html${recherche}#composer` };
  const window = {
    sessionStorage,
    location,
    tjdAcheter(id, cta) { commandes.push({ id, echeances: cta.dataset.tjdEcheances }); },
    history: {
      replaceState(_etat, _titre, url) { location.href = String(url); },
    },
  };
  vm.runInNewContext(catalogue, { window });
  vm.runInNewContext(composer, { window, document, URL });

  return {
    get url() { return new URL(location.href); },
    get niveau() { return radios.actif; },
    get matieres() { return listeMatieres.querySelectorAll().filter((input) => input.checked).map((input) => input.value); },
    get listeRepliee() { return listeMatieres.dataset.kitComplet === "true"; },
    get compteur() { return champs.get("#compteur").textContent; },
    get paiement() { return paiements.actif; },
    get remplacement() { return !champs.get("#kit-remplacement").hidden; },
    get detailPaiementVisible() { return !champs.get("#detail-paiement").hidden; },
    get montants() {
      return ["[data-kit-prix]", "[data-kit-echeance]", "[data-kit-total-echeances]"]
        .map((selecteur) => champs.get(selecteur).textContent.replace(/\s+/g, " "));
    },
    get pack() { return champs.get("#duo-partiels").hidden ? null : champs.get("#duo-partiels-lien").href; },
    get avertissement() { return !champs.get("#kit-matiere-info").hidden; },
    get commander() { return !champs.get("#commander").disabled; },
    get champActif() { return champActif?.value ?? champActif?.attributs["aria-label"]; },
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
      input.focus();
      input.checked = etat;
      traiterChangement({ target: input });
    },
    matiereBloquee(code) {
      return listeMatieres.querySelectorAll().find((input) => input.value === code).disabled;
    },
    choisirPaiement(valeur) {
      paiements[valeur].checked = true;
      traiterChangement({ target: paiements[valeur] });
    },
    soumettre() {
      traiterSoumission({ preventDefault() {} });
      return commandes.at(-1);
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
    ["l2", ["contrats", "administratif-s1", "penal-unifie-s1"]],
    ["l3", ["travail", "societes", "contrats-speciaux"]],
  ]) {
    const session = stockage();
    const kit = ouvrirKit(session);
    kit.choisirNiveau(niveau);
    matieres.forEach((code) => kit.choisirMatiere(code));
    kit.choisirPaiement("2");

    const valeurs = JSON.parse(session.getItem(cleSelection));
    assert.deepEqual(valeurs.choixParNiveau[niveau], matieres);
    assert.equal(valeurs.niveau, niveau);
    assert.equal(valeurs.paiement, "2");
    const retour = ouvrirKit(session);
    assert.equal(retour.niveau, niveau);
    assert.deepEqual(retour.matieres, matieres);
    assert.equal(retour.compteur, "3 sur 3");
    assert.equal(retour.commander, true);
    assert.equal(retour.paiement, "2");
    assert.equal(retour.detailPaiementVisible, true);
  }
});

test("affiche le détail des échéances uniquement après avoir choisi le paiement en deux fois", () => {
  const session = stockage();
  session.setItem(cleSelection, JSON.stringify({ niveau: "l2", codes: ["contrats"] }));
  const kit = ouvrirKit(session);
  assert.deepEqual(kit.matieres, ["contrats"]);
  assert.deepEqual(kit.montants, ["69 €", "34,50 €", "69 €"]);
  assert.equal(kit.detailPaiementVisible, false);
  kit.choisirPaiement("2");
  assert.equal(ouvrirKit(session).detailPaiementVisible, true);
  kit.choisirPaiement("1");
  assert.equal(ouvrirKit(session).detailPaiementVisible, false);
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
  ["contrats", "administratif-s1", "penal-unifie-s1"].forEach((code) => kit.choisirMatiere(code));
  kit.choisirPaiement("2");

  const retirer = kit.boutonsRetirer.find((bouton) => bouton.attributs["aria-label"] === "Retirer Droit pénal général (S1)");
  assert.ok(retirer);
  assert.equal(retirer.type, "button");
  assert.equal(retirer.textContent, "Retirer");
  retirer.clic();

  assert.equal(kit.champActif, "penal-unifie-s1");
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

test("garde les deux semestres et écarte les codes périmés, les vrais doublons et les choix en trop", () => {
  const session = stockage();
  session.setItem(cleSelection, JSON.stringify({
    niveau: "l2",
    codes: ["civil-obsolete", "societes", null, "administratif-s1", "administratif-s1", "administratif-s2", "contrats", "penal", "biens"],
  }));

  const kit = ouvrirKit(session);
  assert.deepEqual(kit.matieres, ["contrats", "administratif-s1", "administratif-s2"]);
  assert.equal(kit.compteur, "3 sur 3");
});

test("compte chaque semestre comme un choix et transmet le bon kit même quand la sélection part du S2", () => {
  const session = stockage();
  const kit = ouvrirKit(session);
  kit.choisirMatiere("administratif-s2");
  assert.equal(kit.matiereBloquee("administratif-s1"), false);
  kit.choisirMatiere("administratif-s1");
  assert.equal(kit.compteur, "2 sur 3");
  assert.equal(kit.pack, null);
  assert.equal(kit.soumettre(), undefined);

  kit.choisirMatiere("contrats");
  assert.equal(kit.compteur, "3 sur 3");
  assert.equal(kit.commander, true);
  assert.equal(kit.matiereBloquee("penal-unifie-s1"), true);
  const id = "pack-kit-partiels-l2--administratif-s1--administratif-s2--contrats";
  assert.deepEqual(kit.soumettre(), { id, echeances: undefined });
  kit.choisirPaiement("2");
  assert.deepEqual(kit.soumettre(), { id, echeances: "2" });

  const retour = ouvrirKit(session);
  assert.deepEqual(retour.matieres, ["contrats", "administratif-s1", "administratif-s2"]);
  const retirerS2 = retour.boutonsRetirer.find((bouton) => bouton.attributs["aria-label"] === "Retirer Droit administratif (S2)");
  assert.ok(retirerS2);
  retirerS2.clic();
  assert.deepEqual(ouvrirKit(session).matieres, ["contrats", "administratif-s1"]);
  assert.equal(retour.matiereBloquee("penal-unifie-s1"), false);
  assert.equal(retour.commander, false);
});

test("présente une seule liste à trois choix sur mobile et place le focus sur le récapitulatif", () => {
  const session = stockage();
  const kit = ouvrirKit(session);
  const matieres = ["contrats", "administratif-s1", "administratif-s2"];
  matieres.slice(0, 2).forEach((code) => kit.choisirMatiere(code));
  assert.equal(kit.listeRepliee, false);
  assert.equal(kit.pack, "packs-partiels.html#pack-partiel-l2-s1");

  kit.choisirMatiere("administratif-s2");
  assert.equal(kit.listeRepliee, true);
  assert.equal(kit.champActif, "Retirer Droit des contrats (S1)");
  assert.equal(kit.matiereBloquee("penal-unifie-s1"), true);
  assert.deepEqual(kit.matieres, matieres);
  assert.equal(kit.commander, true);

  kit.boutonsRetirer.find((bouton) => bouton.attributs["aria-label"] === "Retirer Droit administratif (S2)").clic();
  assert.equal(kit.listeRepliee, false);
  assert.equal(kit.champActif, "administratif-s2");
  assert.equal(kit.matiereBloquee("penal-unifie-s1"), false);
  assert.equal(kit.commander, false);
  kit.choisirMatiere("penal-unifie-s1");
  assert.equal(kit.listeRepliee, true);
  assert.equal(ouvrirKit(session).listeRepliee, true);
});

test("garde la liste complète lorsqu’une ancienne page charge le nouveau script", () => {
  const kit = ouvrirKit(stockage(), "", true);
  ["contrats", "administratif-s1", "administratif-s2"].forEach((code) => kit.choisirMatiere(code));
  assert.equal(kit.listeRepliee, false);
  assert.equal(kit.commander, true);
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

test("les liens du Kit gardent l’année de chaque panneau de l’encart Partiels", () => {
  const script = readFileSync(join(__dirname, "../assets/js/offre-partiels.js"), "utf8");
  const panneaux = ["l1", "l2", "l3", "l4", "l2"].map((annee, index) => {
    const lien = {
      href: index === 4 ? "kit-partiels.html?matiere=administratif-s2#composer" : "kit-partiels.html#composer",
      setAttribute(nom, valeur) { this[nom] = valeur; },
    };
    return {
      lien,
      getAttribute: () => annee,
      querySelector(selecteur) {
        return selecteur === '.offre-partiels__kit a[href="kit-partiels.html#composer"]'
          && lien.href === "kit-partiels.html#composer" ? lien : null;
      },
    };
  });
  const encart = {
    getAttribute: () => "l2",
    querySelectorAll: (selecteur) => selecteur === ".offre-partiels__panneau" ? panneaux : [],
  };
  const document = { readyState: "complete", querySelectorAll: () => [encart] };
  vm.runInNewContext(script, { document, window: {} });
  assert.deepEqual(panneaux.map((panneau) => panneau.lien.href), [
    "kit-partiels.html?niveau=l1#composer", "kit-partiels.html?niveau=l2#composer",
    "kit-partiels.html?niveau=l3#composer", "kit-partiels.html#composer",
    "kit-partiels.html?matiere=administratif-s2#composer",
  ]);
});

test("ouvre un nouveau Kit sans matière dans l’année du lien de l’encart", () => {
  for (const niveau of ["l1", "l2", "l3"]) {
    const session = stockage();
    const kit = ouvrirKit(session, `?source=encart&niveau=${niveau}`);
    assert.equal(kit.niveau, niveau);
    assert.deepEqual(kit.matieres, []);
    assert.equal(kit.paiement, "1");
    assert.equal(kit.url.searchParams.get("source"), "encart");
    assert.equal(kit.url.hash, "#composer");
    assert.equal(ouvrirKit(session, kit.url.search).niveau, niveau);
  }
  const session = stockage();
  session.setItem(cleSelection, "{");
  assert.equal(ouvrirKit(session, "?niveau=l3").niveau, "l3");
  assert.equal(ouvrirKit(session, "?niveau=l4").niveau, "l2");
});

test("l’année de l’encart laisse intacts les matières, le niveau et le paiement du Kit commencé", () => {
  const session = stockage();
  const brouillon = JSON.stringify({
    niveau: "l2", choixParNiveau: { l1: ["constitutionnel-s1"], l2: ["administratif-s2"], l3: ["travail"] }, paiement: "2",
  });
  session.setItem(cleSelection, brouillon);
  const kit = ouvrirKit(session, "?niveau=l3");
  assert.equal(kit.niveau, "l2");
  assert.deepEqual(kit.matieres, ["administratif-s2"]);
  assert.equal(kit.paiement, "2");
  assert.equal(session.getItem(cleSelection), brouillon);
  kit.choisirNiveau("l1");
  assert.deepEqual(kit.matieres, ["constitutionnel-s1"]);
  kit.choisirNiveau("l3");
  assert.deepEqual(kit.matieres, ["travail"]);
});

test("un lien explicite de droit administratif conserve le semestre demandé", () => {
  for (const code of ["administratif-s1", "administratif-s2"]) {
    const kit = ouvrirKit(stockage(), `?niveau=l3&matiere=${code}`);
    assert.equal(kit.niveau, "l2");
    assert.deepEqual(kit.matieres, [code]);
    assert.equal(kit.url.searchParams.has("matiere"), false);
  }
});

test("présélectionne la matière du guide et conserve le retrait après rechargement", () => {
  const session = stockage();
  const kit = ouvrirKit(session, "?source=guide&matiere=administratif-s1");

  assert.deepEqual(kit.matieres, ["administratif-s1"]);
  assert.equal(kit.niveau, "l2");
  assert.equal(kit.compteur, "1 sur 3");
  assert.equal(kit.url.search, "?source=guide");
  assert.equal(kit.url.hash, "#composer");
  kit.choisirMatiere("administratif-s1", false);

  assert.deepEqual(ouvrirKit(session, kit.url.search).matieres, []);
});

test("présélectionne le S1 depuis le guide quand le S2 est déjà coché", () => {
  const session = stockage();
  session.setItem(cleSelection, JSON.stringify({ niveau: "l2", codes: ["administratif-s2"] }));
  const kit = ouvrirKit(session, "?matiere=administratif-s1");

  assert.deepEqual(kit.matieres, ["administratif-s1", "administratif-s2"]);
  assert.equal(kit.compteur, "2 sur 3");
  assert.equal(kit.avertissement, false);
  assert.deepEqual(ouvrirKit(session).matieres, ["administratif-s1", "administratif-s2"]);
});

test("conserve les matières cochées quand la matière du guide est incompatible", () => {
  for (const [niveau, codes] of [
    ["l1", ["constitutionnel-s1"]],
    ["l2", ["contrats", "penal-unifie-s1", "biens"]],
  ]) {
    const session = stockage();
    session.setItem(cleSelection, JSON.stringify({ niveau, codes }));

    const kit = ouvrirKit(session, "?matiere=administratif-s1");

    assert.equal(kit.niveau, niveau);
    assert.deepEqual(kit.matieres, codes);
    assert.equal(kit.avertissement, true);
    assert.equal(kit.url.search, "");
  }
});

test("garde des choix indépendants pour chaque année et le paiement pendant les allers-retours", () => {
  const session = stockage();
  const kit = ouvrirKit(session);
  const l2 = ["contrats", "administratif-s1", "administratif-s2"];
  l2.forEach((code) => kit.choisirMatiere(code));
  kit.choisirPaiement("2");
  kit.choisirNiveau("l1");
  assert.deepEqual(kit.matieres, []);
  assert.equal(kit.paiement, "2");
  const l1 = ["constitutionnel-s1", "constitutionnel-s2"];
  l1.forEach((code) => kit.choisirMatiere(code));
  kit.choisirNiveau("l2");
  assert.deepEqual(kit.matieres, l2);
  assert.equal(kit.remplacement, true);
  const retour = ouvrirKit(session);
  assert.equal(retour.paiement, "2");
  assert.deepEqual(retour.soumettre(), {
    id: "pack-kit-partiels-l2--administratif-s1--administratif-s2--contrats", echeances: "2",
  });
  retour.choisirNiveau("l1");
  assert.deepEqual(retour.matieres, l1);
  assert.equal(retour.remplacement, false);
  retour.choisirPaiement("1");
  retour.choisirNiveau("l2");
  assert.equal(ouvrirKit(session).soumettre().echeances, undefined);
});

test("nettoie les brouillons périmés sans mélanger leurs années ni rejouer un mauvais paiement", () => {
  const session = stockage();
  session.setItem(cleSelection, JSON.stringify({
    niveau: "l2",
    choixParNiveau: {
      l1: ["constitutionnel-s1", "constitutionnel-s1", "administratif-s2", "constitutionnel-s2"],
      l2: ["ancien-code", null, "administratif-s1", "administratif-s2", "contrats", "penal"],
      l3: "societes",
      l4: ["penal"],
    },
    paiement: "3",
  }));
  const kit = ouvrirKit(session);
  assert.deepEqual(kit.matieres, ["contrats", "administratif-s1", "administratif-s2"]);
  assert.equal(kit.paiement, "1");
  assert.equal(kit.soumettre().echeances, undefined);
  kit.choisirNiveau("l1");
  assert.deepEqual(kit.matieres, ["constitutionnel-s1", "constitutionnel-s2"]);
  kit.choisirNiveau("l3");
  assert.deepEqual(kit.matieres, []);
});

test("le lien du guide ouvre le brouillon cible déjà rempli et demande de modifier les choix", () => {
  const session = stockage();
  const codes = ["contrats", "penal-unifie-s1", "biens"];
  session.setItem(cleSelection, JSON.stringify({
    niveau: "l1", choixParNiveau: { l1: [], l2: codes }, paiement: "2",
  }));
  const kit = ouvrirKit(session, "?matiere=administratif-s2");
  assert.equal(kit.avertissement, true);
  assert.equal(kit.niveau, "l2");
  assert.equal(kit.paiement, "2");
  assert.deepEqual(kit.matieres, codes);
  assert.deepEqual(ouvrirKit(session).matieres, codes);
});

test("un ancien brouillon et un ancien lien de pénal reprennent les deux semestres avec la fiche actuelle", () => {
  const session = stockage();
  session.setItem(cleSelection, JSON.stringify({
    niveau: "l2", choixParNiveau: { l2: ["contrats", "penal"] }, paiement: "2",
  }));
  const kit = ouvrirKit(session, "?matiere=penal-general-s2");
  assert.deepEqual(kit.matieres, ["contrats", "penal-unifie-s1", "penal-unifie-s2"]);
  assert.deepEqual(kit.soumettre(), {
    id: "pack-kit-partiels-l2--contrats--penal-unifie-s1--penal-unifie-s2", echeances: "2",
  });
});

test("retirer le dernier choix donne le focus à sa propre case", () => {
  const kit = ouvrirKit(stockage());
  ["contrats", "penal-unifie-s1", "biens"].forEach((code) => kit.choisirMatiere(code));
  assert.equal(kit.remplacement, true);
  const retirer = kit.boutonsRetirer.find((bouton) => bouton.attributs["aria-label"].startsWith("Retirer Droit des biens"));
  assert.ok(retirer);
  retirer.clic();
  assert.equal(kit.champActif, "biens");
  assert.equal(kit.remplacement, false);
});
