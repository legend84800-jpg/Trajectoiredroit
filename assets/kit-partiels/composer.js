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

  const choix = form.querySelector("#matieres");
  const resume = form.querySelector("#selection");
  const compteur = form.querySelector("#compteur");
  const modifier = form.querySelector("#kit-modifier");
  const remplacement = form.querySelector("#kit-remplacement");
  const detail = form.querySelector("#detail-paiement");
  const cta = form.querySelector("#commander");
  const comparaisonPack = form.querySelector("#duo-partiels");
  const valeurPack = form.querySelector("#duo-partiels-prix");
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
  document.querySelectorAll("[data-kit-total-echeances]").forEach((element) => {
    element.textContent = euros(2 * echeance);
  });

  let niveau = form.querySelector('input[name="niveau"]:checked').value;
  const choixParNiveau = new Map(Object.keys(catalogue.niveaux).map((niveau) => [niveau, new Set()]));
  let codes = choixParNiveau.get(niveau);
  let modificationOuverte = false;
  const cleSelection = "tjd_kit_partiels_selection";

  function activerNiveau(nouveauNiveau) {
    const radio = form.querySelector(`input[name="niveau"][value="${nouveauNiveau}"]`);
    if (!radio || !choixParNiveau.has(nouveauNiveau)) return;
    niveau = nouveauNiveau;
    codes = choixParNiveau.get(niveau);
    modificationOuverte = false;
    radio.checked = true;
  }

  function codeActuel(code) {
    if (code === "penal") return "penal-unifie-s1";
    if (code === "penal-general-s2") return "penal-unifie-s2";
    return code;
  }

  function importerCodes(niveau, valeurs) {
    if (!Array.isArray(valeurs)) return;
    const choixSauvegardes = choixParNiveau.get(niveau);
    const codesValides = new Set(catalogue.niveaux[niveau].map((matiere) => matiere.code));
    for (const valeur of valeurs) {
      const code = codeActuel(valeur);
      if (codesValides.has(code)) choixSauvegardes.add(code);
      if (choixSauvegardes.size === nombre) break;
    }
  }

  function paiementChoisi() {
    return form.querySelector('input[name="paiement"]:checked').value;
  }

  function restaurerSelection() {
    let selection;
    try {
      selection = JSON.parse(window.sessionStorage.getItem(cleSelection));
    } catch (_) {
      return false;
    }
    if (!selection || !choixParNiveau.has(selection.niveau)) return false;

    const brouillons = selection.choixParNiveau;
    if (brouillons && typeof brouillons === "object" && !Array.isArray(brouillons)) {
      for (const annee of choixParNiveau.keys()) {
        if (Object.hasOwn(brouillons, annee)) importerCodes(annee, brouillons[annee]);
      }
    } else if (Array.isArray(selection.codes)) {
      importerCodes(selection.niveau, selection.codes);
    } else {
      return false;
    }
    activerNiveau(selection.niveau);

    if (selection.paiement === "1" || selection.paiement === "2") {
      const option = form.querySelector(`input[name="paiement"][value="${selection.paiement}"]`);
      if (option) option.checked = true;
    }
    return true;
  }

  function enregistrerSelection() {
    try {
      const brouillons = Object.fromEntries([...choixParNiveau].map(([niveau, choixAnnee]) => [niveau, [...choixAnnee]]));
      window.sessionStorage.setItem(cleSelection, JSON.stringify({
        niveau, choixParNiveau: brouillons, paiement: paiementChoisi(),
      }));
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
        [...choix.querySelectorAll("input")].find((input) => input.value === matiere.code)?.focus();
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
    const pret = matieres.length === nombre;
    const deuxFois = paiementChoisi() === "2";
    if (!pret) modificationOuverte = false;

    for (const input of choix.querySelectorAll("input")) {
      input.checked = codes.has(input.value);
      input.disabled = !input.checked && pret;
    }
    choix.dataset.kitCompact = String(Boolean(modifier) && pret && !modificationOuverte);

    compteur.textContent = `${matieres.length} sur ${nombre}`;
    if (remplacement) remplacement.hidden = !pret;
    resume.replaceChildren(matieres.length
      ? listeSelection(matieres)
      : document.createTextNode("Tes matières apparaîtront ici."));
    const pack = packsPartiels.get([...codes].sort().join("+"));
    const prixPack = catalogue.prixPacks?.[pack];
    const packDisponible = Number.isInteger(prixPack);
    comparaisonPack.hidden = !packDisponible;
    if (packDisponible) {
      valeurPack.textContent = euros(prixPack);
      descriptionPack.textContent = niveau === "l1"
        ? "Le Pack comprend des dissertations corrigées en droit constitutionnel. Il comprend aussi des cas pratiques corrigés et des majeures préparées en introduction au droit."
        : "Le Pack comprend aussi des cas pratiques corrigés et des majeures préparées pour les deux matières.";
      lienPack.href = `packs-partiels.html#${pack}`;
    }
    detail.hidden = !deuxFois;
    cta.disabled = !pret;
    cta.textContent = pret ? "Passer au paiement" : "Coche trois cases";
  }

  modifier?.addEventListener("click", () => {
    modificationOuverte = true;
    rafraichir();
    [...choix.querySelectorAll("input")].find((input) => input.checked)?.focus();
  });

  form.addEventListener("change", (event) => {
    const champ = event.target;
    if (champ.name === "niveau") {
      activerNiveau(champ.value);
      afficherMatieres();
    } else if (champ.name === "matiere") {
      const codeValide = catalogue.niveaux[niveau].some((matiere) => matiere.code === champ.value);
      if (codeValide && champ.checked && codes.size < nombre) codes.add(champ.value);
      else if (!champ.checked) codes.delete(champ.value);
    } else if (champ.name !== "paiement") {
      return;
    }
    enregistrerSelection();
    rafraichir();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const matieres = matieresChoisies();
    if (matieres.length !== nombre) return;

    const deuxFois = paiementChoisi() === "2";
    const id = `pack-kit-partiels-${niveau}--${matieres.map((matiere) => matiere.code).sort().join("--")}`;
    if (deuxFois) cta.dataset.tjdEcheances = "2";
    else delete cta.dataset.tjdEcheances;
    window.tjdAcheter(id, cta);
  });

  function ajouterDepuisLeGuide(url) {
    const code = codeActuel(url.searchParams.get("matiere"));
    if (code === null) return;
    const niveauGuide = Object.keys(catalogue.niveaux).find((niveau) =>
      catalogue.niveaux[niveau].some((matiere) => matiere.code === code));
    if (!niveauGuide) return;
    const matiere = catalogue.niveaux[niveauGuide].find((matiere) => matiere.code === code);
    const peutOuvrir = !codes.size || niveau === niveauGuide;
    if (peutOuvrir) activerNiveau(niveauGuide);
    if (peutOuvrir && (codes.size < nombre || codes.has(code))) {
      codes.add(code);
    } else {
      const info = form.querySelector("#kit-matiere-info");
      info.textContent = `Pour ajouter la matière « ${nomComplet(matiere)} », il faut d’abord modifier les choix déjà cochés.`;
      info.hidden = false;
    }
    if (peutOuvrir) enregistrerSelection();
    url.searchParams.delete("matiere");
    window.history.replaceState(window.history.state, "", url);
  }

  const selectionRestauree = restaurerSelection();
  const url = new URL(window.location.href);
  const niveauLien = url.searchParams.get("niveau");
  if (!selectionRestauree && choixParNiveau.has(niveauLien)) activerNiveau(niveauLien);
  ajouterDepuisLeGuide(url);
  afficherMatieres();
  rafraichir();
})();
