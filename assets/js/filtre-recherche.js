/* Recherche texte libre sur les grilles de produits (formations, cours-fiches, majeures-preparees).
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
    var messageVide = document.createElement('p');
    messageVide.className = 'text-center';
    messageVide.style.cssText = 'display:none; color:var(--muted); margin:24px 0';
    messageVide.textContent = 'Aucune fiche ne correspond à cette recherche.';
    grille.appendChild(messageVide);

    input.addEventListener('input', function () {
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
      var nbVisibles = cards.filter(function (card) { return !card.hidden; }).length;
      messageVide.style.display = nbVisibles === 0 ? '' : 'none';
    });
  });
})();
