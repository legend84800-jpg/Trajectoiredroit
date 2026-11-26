/* Recherche texte libre sur les grilles de produits.
   Cible un input [data-filtre-recherche="#idGrille"] et filtre les .card--product de cette grille
   sur leur texte complet (titre, niveau, description), insensible aux accents et à la casse. */
(function () {
  function normaliser(texte) {
    return texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\bsemestre\s+([12])\b/g, 's$1');
  }

  function semestresCarte(carte) {
    var meta = normaliser(carte.querySelector('.product__meta')?.textContent || '');
    var titre = normaliser(carte.querySelector('.product__title')?.textContent || '');
    return meta.match(/\bs[12]\b/g) || titre.match(/\bs[12]\b/g) || [];
  }

  function niveauxCarte(carte) {
    return (carte.getAttribute('data-niveau') || '').split(',');
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
      var niveauxDemandes = [];
      // Si la grille a aussi des chips de filtre (niveau/matière), main.js expose une fonction
      // qui combine recherche + chips dans un seul état, pour ne pas se marcher dessus sur `hidden`.
      if (typeof window.tjdAppliquerFiltreRecherche === 'function') {
        window.tjdAppliquerFiltreRecherche(terme);
      } else {
        var semestresDemandes = [];
        var mots = terme.replace(/\bl([123])s([12])\b/g, 'l$1 s$2')
          .replace(/\b(?:licence|l)[\s.-]*([123])\b/g, function (_, niveau) {
            niveauxDemandes.push('L' + niveau);
            return ' ';
          }).replace(/\b(?:semestre|s)[\s.-]*([12])\b/g, function (_, semestre) {
            semestresDemandes.push('s' + semestre);
            return ' ';
          }).match(/[\p{L}\p{N}]+/gu) || [];
        cards.forEach(function (card) {
          var contenu = normaliser(card.textContent);
          var semestres = semestresCarte(card);
          card.hidden = !(mots.every(function (mot) { return contenu.includes(mot); })
            && (!semestresDemandes.length || semestresDemandes.some(function (semestre) { return semestres.includes(semestre); }))
            && (!niveauxDemandes.length || niveauxDemandes.some(function (niveau) { return niveauxCarte(card).includes(niveau); })));
        });
      }
      var visible = cards.some(carteVisible);
      var correspondances = visible || !terme ? [] : cards.filter(function (carte) { return !carte.hidden; });
      var niveauxTrouves = onglets.filter(function (onglet) {
        var niveau = onglet.getAttribute('data-niveau-onglet');
        if (niveauxDemandes.length && !niveauxDemandes.includes(niveau)) return false;
        return correspondances.some(function (carte) {
          return niveauxCarte(carte).includes(niveau);
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
