(() => {
  "use strict";

  const cible = [
    "[data-tjd-produit]", "[data-tjd-prix-recueil]", ".product__price",
    ".pricing__price--blue", ".pricing__price--green", ".compare-needs__price",
    ".megamenu__pack-tile-price", ".offre-matiere__prix", ".offre-partiels__montant",
    ".format-comparison__price", ".article-produit-inline__meta strong", "#titre-recueils",
    ".article-pack-ligne__texte", ".offre-matiere__contenu li > span:last-child", ".offre-partiels__kit",
    ".offre-matiere__bump", ".offre-matiere__meta a.btn", ".l2-price > strong",
    ".ultra-card__price", ".ultra-card__payment", ".cim-prix > strong",
    ".sticky-cta-bar:has([data-tjd-produit]) .sticky-cta-bar__text > *",
    "#apercuPrice", ".duo-partiels__prix", "[data-kit-prix]", "[data-kit-echeance]",
    "#detail-paiement", "#prix-separe", "td.prix", "td.prix + td", "[data-echeances-libelle]",
    ".ph-amount", ".plan > .price", "#choixDetail", "[data-recharge]",
  ].join(",");
  const contexteMensuel = ".ph-amount, .plan > .price, .compare-needs__price, #choixDetail";
  const exemple = ".tjd-prix-remise";
  const sourcesIgnorees = "script, style, option, del, s, .product__price-old, .tjd-prix-remise";
  const montant = /\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d{1,2})?[ \u00a0\u202f]*€/g;
  const uniteMensuelle = /^\s*(?:\/|par)\s*mois\b/i;
  const devise = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  const deviseEntiere = new Intl.NumberFormat("fr-FR", {
    style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
  const centimes = (texte) => Math.round(Number(texte.replace(/[^\d,.]/g, "").replace(",", ".")) * 100);
  const euros = (valeur) => (valeur % 100 ? devise : deviseEntiere).format(valeur / 100);

  function texteAvantRemise(element) {
    if (!element.querySelector(exemple)) return element.textContent;
    const copie = element.cloneNode(true);
    for (const prix of copie.querySelectorAll(exemple)) prix.replaceWith(prix.dataset.prixOrigine);
    return copie.textContent;
  }

  // Les libellés d'achat doivent conserver le montant nominal pour le panier
  // et pour restaurer le bouton après une tentative de paiement.
  window.tjdTexteAvantRemise = texteAvantRemise;
  const chargement = window.tjdDonneesSaison ||= fetch("/assets/data/saison.json", { cache: "no-cache" })
    .then((reponse) => reponse.ok ? reponse.json() : null)
    .catch(() => null);

  function paire(original, avant, apres, mensuel = false) {
    const groupe = document.createElement("span");
    groupe.className = "tjd-prix-remise";
    groupe.dataset.prixOrigine = original;
    const ancien = document.createElement("del");
    ancien.textContent = euros(avant);
    ancien.setAttribute("aria-hidden", "true");
    const nouveau = document.createElement("strong");
    nouveau.textContent = euros(apres);
    nouveau.setAttribute("aria-hidden", "true");

    const lecteur = document.createElement("span");
    lecteur.className = "tjd-prix-lecteur";
    lecteur.textContent = "Prix avant remise " + euros(avant) + ", prix réduit " + euros(apres);
    groupe.append(ancien, " ", nouveau, lecteur);
    if (mensuel) {
      const suite = document.createElement("span");
      suite.className = "tjd-prix-mensuel";
      suite.textContent = " le premier mois, puis " + euros(avant) + " par mois";
      groupe.append(suite);
    }
    return groupe;
  }

  function demarrer(offre, catalogue) {
    const fin = Date.parse(offre.fin);
    const textesAccessibles = new Map();
    const reduire = (base) => base - Math.round(base * offre.taux / 100);
    const trouve = (element) => {
      const prix = element && texteAvantRemise(element).match(montant);
      return prix?.length ? centimes(prix[0]) : null;
    };

    function remplacerEtiquette(element, avant, apres) {
      const etiquette = element?.getAttribute("aria-label");
      if (!etiquette || textesAccessibles.get(element)?.nouvelle === etiquette) return;
      const match = [...etiquette.matchAll(montant)].find((prix) => centimes(prix[0]) === avant);
      if (!match) return;
      const apresPrix = etiquette.slice(match.index + match[0].length);
      const suite = element.classList.contains("megamenu__pack-tile") ? "" : apresPrix;
      const nouvelle = etiquette.slice(0, match.index) + "prix avant remise " + euros(avant)
        + ", prix réduit " + euros(apres) + suite;
      textesAccessibles.set(element, { etiquette, nouvelle });
      element.setAttribute("aria-label", nouvelle);
    }

    function montantsEcheance(element, base, index) {
      if (element.matches(".ultra-card__payment, td.prix + td")) {
        const paiement = element.matches("td") ? element.previousElementSibling :
          element.parentElement.querySelector(".ultra-card__price");
        return Math.floor(reduire(trouve(paiement) ?? base * 3) / 3);
      }
      if (element.matches("[data-echeances-libelle]")) {
        const nombre = Number(element.dataset.echeancesLibelle);
        const total = Number(document.querySelector("#offrirPack")?.selectedOptions[0]?.dataset.prix);
        if (nombre > 1 && total > 0) return Math.floor(reduire(total) / nombre);
      }
      const kitDeuxFois = element.matches("#detail-paiement") && document.querySelector("#payer-deux-fois")?.checked;
      if (element.matches("[data-kit-echeance]") || kitDeuxFois ||
          (element.matches("[data-kit-prix]") && element.closest("details"))) {
        const total = window.catalogueKit?.prix ?? trouve(document.querySelector(".price-main [data-kit-prix]"));
        if (total > 0) {
          const echeance = Math.floor(reduire(total) / 2);
          const afficheTotal = element.matches("[data-kit-prix]") || (kitDeuxFois && index === 2);
          return afficheTotal ? 2 * echeance : echeance;
        }
      }
      return reduire(base);
    }

    function prixAchat(element, affiche) {
      const id = element.dataset.tjdProduit;
      const prix = catalogue?.[id];
      if (!prix) return affiche;
      const ajout = element.dataset.tjdBumpCheckbox;
      const supplement = ajout && document.getElementById(ajout)?.checked ? catalogue[element.dataset.tjdBump] : 0;
      const nombre = Number(element.dataset.tjdEcheances);
      return nombre > 1 ? Math.floor(prix / nombre) : prix + (supplement || 0);
    }

    function retirer(element) {
      for (const prix of element.querySelectorAll(exemple)) prix.replaceWith(prix.dataset.prixOrigine);
    }

    function rendre(element) {
      const id = element.dataset.tjdProduit;
      if (id && (id === "stage-methode" || (catalogue && !catalogue[id]))) return;
      const mensuel = element.matches(contexteMensuel) && (
        element.matches(".ph-amount, .plan > .price") ||
        /€\s*(?:\/|par)\s*mois\b/i.test(texteAvantRemise(element))
      );
      if (mensuel && (element.closest("[data-tjd-portalis-abonne]") ||
          (element.id === "choixDetail" && /à payer/i.test(texteAvantRemise(element))))) {
        retirer(element);
        return;
      }

      if (element.hasAttribute("data-tjd-prix-recueil")) {
        if (element.querySelector(exemple)) return;
        const base = Number(element.dataset.tjdPrixRecueil);
        if (base > 0) element.replaceChildren(paire(element.textContent, base, reduire(base)));
        return;
      }

      const textes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(noeud) {
          const parent = noeud.parentElement;
          if (!noeud.data.includes("€") || parent.closest(sourcesIgnorees)) return NodeFilter.FILTER_REJECT;
          return parent.closest(cible) === element ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      let index = 0;
      const selection = [];
      for (let noeud = textes.nextNode(); noeud; noeud = textes.nextNode()) selection.push(noeud);
      for (const noeud of selection) {
        const texte = noeud.data;
        let curseur = 0;
        const fragments = [];
        for (const prix of texte.matchAll(montant)) {
          const nominal = prixAchat(element, centimes(prix[0]));
          if (nominal <= 0) continue;
          const n = Number(element.dataset.tjdEcheances);
          const prixFinal = n > 1 && catalogue?.[id] ? Math.floor(reduire(catalogue[id]) / n) :
            montantsEcheance(element, nominal, index);
          const debut = prix.index;
          const finMontant = debut + prix[0].length;
          const suffixe = mensuel ? texte.slice(finMontant).match(uniteMensuelle)?.[0] || "" : "";
          const finPrix = finMontant + suffixe.length;
          const libelle = texte.slice(curseur, debut);
          const avantPrix = id ? libelle.replace(/\s*·\s*$/, "") : libelle;
          fragments.push(avantPrix, paire(texte.slice(curseur + avantPrix.length, finPrix), nominal, prixFinal, mensuel));
          curseur = finPrix;
          const lien = element.matches(".megamenu__pack-tile-price") ? element.closest(".megamenu__pack-tile") : element;
          remplacerEtiquette(lien, centimes(prix[0]), prixFinal);
          index += 1;
        }
        if (fragments.length) noeud.replaceWith(...fragments, texte.slice(curseur));
      }
    }

    function rendrePanier() {
      const total = document.getElementById("tjdPanierTotalMontant");
      if (!total) return;
      const lignes = [...document.querySelectorAll("[data-tjd-prix-ligne]")];
      if (!lignes.length) {
        retirer(total);
        return;
      }
      const valeurs = lignes.map((ligne) => catalogue?.[ligne.dataset.tjdPrixLigne] ?? trouve(ligne));
      if (valeurs.some((valeur) => !valeur)) return;
      const base = valeurs.reduce((somme, valeur) => somme + valeur, 0);
      const apres = reduire(base);
      const prixIndividuels = valeurs.map(reduire);
      // Stripe arrondit sur le total et peut répartir un centime différemment.
      // Dans ce cas, le total porte seul le détail de la remise.
      if (prixIndividuels.reduce((somme, valeur) => somme + valeur, 0) === apres) {
        lignes.forEach((ligne, i) => {
          if (!ligne.querySelector(exemple)) {
            ligne.replaceChildren(paire(ligne.textContent, valeurs[i], prixIndividuels[i]));
          }
        });
      }
      if (!total.querySelector(exemple)) total.replaceChildren(paire(total.textContent, base, apres));
    }

    function ajouterCibles(element, liste) {
      if (element.matches(cible)) liste.add(element);
      for (const descendant of element.querySelectorAll(cible)) liste.add(descendant);
    }

    function actualiser(changements) {
      if (Date.now() >= fin) return terminer();
      const liste = new Set();
      let panier = false;
      for (const changement of changements) {
        const element = changement.target.nodeType === Node.ELEMENT_NODE ?
          changement.target : changement.target.parentElement;
        if (!element || element.closest(exemple)) continue;
        if (element.closest("#tjdPanierBackdrop")) panier = true;
        const parent = element.closest(cible);
        if (parent) liste.add(parent);
        if (changement.type === "attributes") ajouterCibles(element, liste);
        for (const noeud of changement.addedNodes) {
          if (noeud.nodeType === Node.ELEMENT_NODE && !noeud.matches(exemple)) ajouterCibles(noeud, liste);
        }
      }
      for (const element of liste) {
        if (element.isConnected) rendre(element);
      }
      if (panier) rendrePanier();
    }

    const observateur = new MutationObserver(actualiser);
    function terminer() {
      observateur.disconnect();
      retirer(document.body);
      for (const [element, { etiquette, nouvelle }] of textesAccessibles) {
        if (element.getAttribute("aria-label") === nouvelle) element.setAttribute("aria-label", etiquette);
      }
      window.removeEventListener("pageshow", verifierEcheance);
    }
    function verifierEcheance() {
      if (Date.now() >= fin) terminer();
    }

    for (const element of document.querySelectorAll(cible)) rendre(element);
    rendrePanier();
    observateur.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["data-tjd-portalis-abonne"],
    });
    window.addEventListener("pageshow", verifierEcheance);
    setTimeout(verifierEcheance, Math.max(0, fin - Date.now()));
  }

  chargement.then((donnees) => {
    const offre = donnees?.offre_partiels;
    if (!offre || !Number.isFinite(offre.taux) || offre.taux <= 0 || offre.taux >= 100) return;
    const maintenant = Date.now();
    if (Date.parse(offre.debut) <= maintenant && maintenant < Date.parse(offre.fin)) {
      demarrer(offre, donnees.prix_catalogue);
    }
  });
})();
