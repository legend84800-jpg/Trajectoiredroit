(() => {
  "use strict";
  const form = document.querySelector("#config");
  if (!form) return;

  const catalogue = window.catalogueKit;
  const euros = (centimes) => (centimes / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: centimes % 100 ? 2 : 0,
  });
  const montant = catalogue.prix;
  const echeance = Math.floor(montant / 2);
  const nombre = catalogue.nombreMatieres;
  const toutes = Object.values(catalogue.niveaux).flat();
  const memePrix = toutes.every((matiere) => matiere.prixSepare === toutes[0].prixSepare);

  const choix = form.querySelector("#matieres");
  const resume = form.querySelector("#selection");
  const compteur = form.querySelector("#compteur");
  const comparaison = form.querySelector("#comparaison");
  const valeurSeparee = form.querySelector("#prix-separe");
  const detail = form.querySelector("#detail-paiement");
  const cta = form.querySelector("#commander");
  const comparaisonPack = form.querySelector("#duo-partiels");
  const descriptionPack = form.querySelector("#duo-partiels-description");
  const lienPack = form.querySelector("#duo-partiels-lien");

  const packsPartiels = new Map([
    ["constitutionnel-s1+intro-droit", "pack-partiel-l1-s1"],
    ["administratif-s1+contrats", "pack-partiel-l2-s1"],
    ["societes+travail", "pack-partiel-l3-travail-societes"],
    ["contrats-speciaux+travail", "pack-partiel-l3-travail-contrats-speciaux"],
    ["contrats-speciaux+societes", "pack-partiel-l3-societes-contrats-speciaux"],
  ]);
  document.querySelectorAll("[data-kit-prix]").forEach((element) => {
    element.textContent = euros(montant);
  });
  document.querySelectorAll("[data-kit-echeance]").forEach((element) => {
    element.textContent = euros(echeance);
  });

  let niveau = form.querySelector('input[name="niveau"]:checked').value;
  let codes = new Set();
  const cleSelection = "tjd_kit_partiels_selection";

  function restaurerSelection() {
    let selection;
    try {
      selection = JSON.parse(window.sessionStorage.getItem(cleSelection));
    } catch (_) {
      return;
    }
    if (!selection || typeof selection.niveau !== "string" ||
        !Object.hasOwn(catalogue.niveaux, selection.niveau) || !Array.isArray(selection.codes)) return;

    const boutonNiveau = form.querySelector(`input[name="niveau"][value="${selection.niveau}"]`);
    if (!boutonNiveau) return;
    niveau = selection.niveau;
    boutonNiveau.checked = true;

    const disciplines = new Set();
    for (const code of selection.codes) {
      const matiere = catalogue.niveaux[niveau].find((item) => item.code === code);
      if (!matiere || disciplines.has(matiere.discipline)) continue;
      codes.add(code);
      disciplines.add(matiere.discipline);
      if (codes.size === nombre) break;
    }
  }

  function enregistrerSelection() {
    try {
      window.sessionStorage.setItem(cleSelection, JSON.stringify({ niveau, codes: [...codes] }));
    } catch (_) {
      // Le formulaire reste utilisable lorsque le navigateur bloque le stockage.
    }
  }

  function nomComplet(matiere) {
    return matiere.semestre ? `${matiere.nom} (${matiere.semestre})` : matiere.nom;
  }

  function listeSelection(matieres) {
    const ul = document.createElement("ul");
    ul.setAttribute("role", "list");
    for (const matiere of matieres) {
      const li = document.createElement("li");
      const nom = document.createElement("span");
      nom.textContent = nomComplet(matiere);
      const retirer = document.createElement("button");
      retirer.type = "button";
      retirer.className = "selection-retirer";
      retirer.textContent = "Retirer";
      retirer.setAttribute("aria-label", `Retirer ${nom.textContent}`);
      retirer.addEventListener("click", () => {
        codes.delete(matiere.code);
        enregistrerSelection();
        rafraichir();
        choix.querySelector("input:not(:checked):not(:disabled)")?.focus();
      });
      li.append(nom, retirer);
      ul.append(li);
    }
    return ul;
  }

  function matieresChoisies() {
    return catalogue.niveaux[niveau].filter((matiere) => codes.has(matiere.code));
  }

  function afficherMatieres() {
    choix.replaceChildren();
    for (const matiere of catalogue.niveaux[niveau]) {
      const label = document.createElement("label");
      label.className = "matter-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "matiere";
      input.value = matiere.code;

      const titre = document.createElement("span");
      titre.className = "matter-name";
      titre.textContent = matiere.nom;
      const format = document.createElement("small");
      format.className = "format-etiquette";
      format.dataset.tonFormat = matiere.tonFormat;
      format.textContent = matiere.formatApplication;
      titre.append(format);

      const semestre = document.createElement("span");
      semestre.className = "semestre";
      semestre.textContent = matiere.semestre;
      semestre.hidden = !matiere.semestre;
      label.append(input, titre, semestre);
      choix.append(label);
    }
  }

  function rafraichir() {
    const matieres = matieresChoisies();
    const disciplines = new Set(matieres.map((matiere) => matiere.discipline));
    const pret = matieres.length === nombre;
    const deuxFois = form.querySelector('input[name="paiement"]:checked').value === "2";

    for (const input of choix.querySelectorAll("input")) {
      const matiere = catalogue.niveaux[niveau].find((item) => item.code === input.value);
      input.checked = codes.has(matiere.code);
      input.disabled = !input.checked && (pret || disciplines.has(matiere.discipline));
    }

    compteur.textContent = `${matieres.length} sur ${nombre}`;
    resume.replaceChildren(matieres.length
      ? listeSelection(matieres)
      : document.createTextNode("Tes matières apparaîtront ici."));
    const pack = packsPartiels.get([...codes].sort().join("+"));
    comparaisonPack.hidden = !pack;
    if (pack) {
      descriptionPack.textContent = niveau === "l1"
        ? "Le Pack comprend des dissertations corrigées en droit constitutionnel. Il comprend aussi des cas pratiques corrigés et des majeures préparées en introduction au droit."
        : "Le Pack comprend aussi des cas pratiques corrigés et des majeures préparées pour les deux matières.";
      lienPack.href = `packs-partiels.html#${pack}`;
    }
    comparaison.hidden = !pret && !memePrix;
    if (!comparaison.hidden) {
      const total = pret
        ? matieres.reduce((somme, matiere) => somme + matiere.prixSepare, 0)
        : toutes[0].prixSepare * nombre;
      valeurSeparee.textContent = euros(total);
    }
    detail.textContent = deuxFois
      ? `${euros(echeance)} aujourd’hui et ${euros(echeance)} dans un mois. Total ${euros(montant)}.`
      : `${euros(montant)} aujourd’hui.`;
    cta.disabled = !pret;
    cta.textContent = pret ? "Passer au paiement" : "Choisis trois matières";
  }

  form.addEventListener("change", (event) => {
    if (event.target.name === "niveau") {
      niveau = event.target.value;
      codes = new Set();
      afficherMatieres();
      enregistrerSelection();
    } else if (event.target.name === "matiere") {
      if (event.target.checked) codes.add(event.target.value);
      else codes.delete(event.target.value);
      enregistrerSelection();
    }
    rafraichir();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const matieres = matieresChoisies();
    if (matieres.length !== nombre) return;

    const deuxFois = form.querySelector('input[name="paiement"]:checked').value === "2";
    const id = `pack-kit-partiels-${niveau}--${matieres.map((matiere) => matiere.code).sort().join("--")}`;
    if (deuxFois) cta.dataset.tjdEcheances = "2";
    else delete cta.dataset.tjdEcheances;
    window.tjdAcheter(id, cta);
  });

  restaurerSelection();
  afficherMatieres();
  rafraichir();
})();
