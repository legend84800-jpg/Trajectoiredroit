/* Recherche texte libre sur les grilles de produits.
   Cible un input [data-filtre-recherche="#idGrille"] et filtre les .card--product de cette grille
   sur leur texte complet (titre, niveau, description), insensible aux accents et à la casse. */
(function () {
  function normaliser(texte) {
    return texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  document.querySelectorAll('[data-filtre-recherche]').forEach(function (input) {
    var grille = document.querySelector(input.getAttribute('data-filtre-recherche'));
    if (!grille) return;
    var cards = Array.from(grille.querySelectorAll('.card--product'));
    var onglets = Array.from(document.querySelectorAll('[data-niveau-onglet]'));
    var etatRecherche = document.createElement('div');
    etatRecherche.className = 'text-center';
    etatRecherche.style.cssText = 'grid-column:1/-1; color:var(--muted); margin:12px 0';
    var messageVide = document.createElement('p');
    messageVide.setAttribute('role', 'status');
    messageVide.textContent = 'Aucune fiche ne correspond à cette recherche.';
    var suggestion = document.createElement('button');
    suggestion.type = 'button';
    suggestion.className = 'btn btn--outline';
    etatRecherche.append(messageVide, suggestion);
    grille.prepend(etatRecherche);
    var ongletSuggere = null;
    function carteVisible(carte) {
      return !carte.hidden && !carte.classList.contains('hors-niveau');
    }

    function appliquerRecherche() {
      var terme = normaliser(input.value.trim());
      // Si la grille a aussi des chips de filtre (niveau/matière), main.js expose une fonction
      // qui combine recherche + chips dans un seul état, pour ne pas se marcher dessus sur `hidden`.
      if (typeof window.tjdAppliquerFiltreRecherche === 'function') {
        window.tjdAppliquerFiltreRecherche(terme);
      } else {
        cards.forEach(function (card) {
          card.hidden = !(!terme || normaliser(card.textContent).indexOf(terme) !== -1);
        });
      }
      var visible = cards.some(carteVisible);
      var correspondances = visible || !terme ? [] : cards.filter(function (carte) { return !carte.hidden; });
      var niveauxTrouves = onglets.filter(function (onglet) {
        var niveau = onglet.getAttribute('data-niveau-onglet');
        return correspondances.some(function (carte) {
          return (carte.getAttribute('data-niveau') || '').split(',').includes(niveau);
        });
      });
      ongletSuggere = niveauxTrouves.length === 1 ? niveauxTrouves[0] : niveauxTrouves.length > 1
        ? onglets.find(function (onglet) { return onglet.getAttribute('data-niveau-onglet') === 'TOUT'; }) : null;
      var texte = '';
      if (ongletSuggere) {
        var niveau = ongletSuggere.getAttribute('data-niveau-onglet');
        texte = niveau === 'TOUT' ? 'Voir les résultats dans toutes les années'
          : (correspondances.length === 1 ? 'Voir le résultat en ' : 'Voir les résultats en ') + niveau;
      }
      etatRecherche.hidden = visible;
      suggestion.hidden = !ongletSuggere;
      suggestion.style.display = ongletSuggere ? '' : 'none';
      suggestion.textContent = texte;
      messageVide.hidden = !!ongletSuggere;
    }

    input.addEventListener('input', appliquerRecherche);
    suggestion.addEventListener('click', function () {
      if (!ongletSuggere) return;
      ongletSuggere.click();
      var cible = cards.find(carteVisible);
      if (cible) {
        if (cible.getAttribute('tabindex') === null) cible.setAttribute('tabindex', '-1');
        cible.focus();
      }
    });
    appliquerRecherche();
  });
})();
