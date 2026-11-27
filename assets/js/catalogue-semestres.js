/* Regroupe les deux fiches d'une même matière sans recréer leurs actions. */
(function () {
  function creerGroupe(cartes, titre, apresChoix) {
    var groupe = document.createElement('div');
    groupe.className = 'catalogue-semestres';
    cartes[0].article.before(groupe);

    var choix = document.createElement('div');
    choix.className = 'catalogue-semestres__choix';
    choix.setAttribute('role', 'radiogroup');
    choix.setAttribute('aria-label', titre + ' · Semestre');

    var disponibles = new Set();
    var selection = null;
    cartes.forEach(function (carte) {
      carte.titre.textContent = titre;
      groupe.append(carte.article);

      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = cartes[0].article.id + '-semestre';
      radio.id = carte.article.id + '-choix-semestre';
      radio.setAttribute('aria-controls', carte.article.id);
      carte.radio = radio;

      var label = document.createElement('label');
      label.htmlFor = radio.id;
      label.textContent = 'S' + carte.semestre;
      choix.append(radio, label);
      radio.addEventListener('change', function () {
        var garderFocus = choix.contains(document.activeElement);
        afficher(disponibles, carte.article);
        if (garderFocus) radio.focus({ preventScroll: true });
        if (apresChoix) apresChoix(carte.article);
      });
    });

    function afficher(articlesDisponibles, preference) {
      disponibles = articlesDisponibles;
      if (disponibles.has(preference)) selection = preference;
      if (!disponibles.has(selection)) {
        selection = cartes.find(function (carte) { return disponibles.has(carte.article); })?.article || null;
      }
      groupe.hidden = !selection;
      var active = cartes.find(function (carte) { return carte.article === selection; });
      if (active && choix.previousElementSibling !== active.titre) active.titre.after(choix);
      cartes.forEach(function (carte) {
        carte.article.hidden = carte.article !== selection;
        carte.radio.disabled = !disponibles.has(carte.article);
        carte.radio.checked = carte.article === selection;
      });
    }

    var articles = cartes.map(function (carte) { return carte.article; });
    afficher(new Set(articles));
    return {
      element: groupe,
      articles: articles,
      actif: function () { return selection; },
      afficher: afficher
    };
  }

  function initialiser(grille, apresChoix) {
    var paires = new Map();
    grille.querySelectorAll(':scope > article[data-catalogue-paire]').forEach(function (article) {
      var titre = article.querySelector('.product__title');
      if (!titre || !article.id) return;
      var libelle = titre.textContent.trim();
      var suffixe = libelle.match(/\s+(?:\(S([12])\)|S([12]))$/);
      var semestre = article.dataset.catalogueSemestre || suffixe?.[1] || suffixe?.[2];
      if (semestre !== '1' && semestre !== '2') return;
      var cle = article.dataset.cataloguePaire;
      if (!paires.has(cle)) paires.set(cle, []);
      paires.get(cle).push({
        article: article,
        titre: titre,
        matiere: suffixe ? libelle.slice(0, suffixe.index) : libelle,
        semestre: semestre
      });
    });

    var groupes = new Map();
    paires.forEach(function (paire) {
      if (paire.length !== 2 || paire[0].matiere !== paire[1].matiere || paire[0].semestre === paire[1].semestre) return;
      paire.sort(function (a, b) { return a.semestre.localeCompare(b.semestre); });
      var groupe = creerGroupe(paire, paire[0].matiere, apresChoix);
      groupe.articles.forEach(function (article) { groupes.set(article, groupe); });
    });
    return groupes;
  }

  window.tjdCartesSemestres = initialiser;

  function initialiserHorsCatalogue() {
    var groupes = new Map();
    document.querySelectorAll('[data-tjd-cartes-semestres]').forEach(function (grille) {
      initialiser(grille, function (article) {
        var ancre = document.getElementById(window.location.hash.slice(1));
        if (groupes.get(ancre) === groupes.get(article)) {
          window.history.replaceState(window.history.state, '', '#' + article.id);
        }
      }).forEach(function (groupe, article) { groupes.set(article, groupe); });
    });
    if (!groupes.size) return;
    function ouvrirAncre(produitInitial) {
      var ancre = document.getElementById(window.location.hash.slice(1));
      var article = groupes.has(ancre) ? ancre
        : document.getElementById(produitInitial || '');
      var groupe = groupes.get(article);
      if (!groupe) return;
      groupe.afficher(new Set(groupe.articles), article);
      if (article === ancre) groupe.element.scrollIntoView({ block: 'start' });
    }
    ouvrirAncre(new URLSearchParams(window.location.search).get('produit'));
    window.addEventListener('hashchange', function () { ouvrirAncre(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiserHorsCatalogue);
  else initialiserHorsCatalogue();
})();
