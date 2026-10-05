/* Mesure des exemples publics. Aucun changement du contenu ou du paiement. */
(function () {
  'use strict';

  var dejaMesure = Object.create(null);

  function estTestInterne() {
    if (!/^(www\.)?trajectoiredroit\.com$/.test(window.location.hostname)) return true;
    if (window.location.protocol !== 'https:') return true;
    try {
      var valeur = new URLSearchParams(window.location.search).get('tjd_test');
      if (valeur === '1') return true;
      if (valeur === '0') return false;
      if (window.tjdTestInterne) return true;
      return localStorage.getItem('tjd_internal_test') === '1';
    } catch (_) {
      return !!window.tjdTestInterne;
    }
  }

  function mesurer(id, action) {
    var cle = id + ':' + action;
    if (estTestInterne() || dejaMesure[cle]) return;
    dejaMesure[cle] = true;
    // Chaque outil peut échouer sans affecter les interactions de la page.
    try {
      if (window._paq && typeof window._paq.push === 'function') {
        window._paq.push(['trackEvent', 'Demonstration', action, id]);
      }
    } catch (_) {}
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', action === 'ExempleVisible' ? 'demo_view' : 'demo_action', {
          demo_id: id, demo_action: action, page_path: window.location.pathname
        });
      }
    } catch (_) {}
  }

  function interaction(id, action) {
    // Une action sur l'exemple établit aussi son exposition, même sans observer.
    mesurer(id, 'ExempleVisible');
    mesurer(id, action);
  }

  function initialiser() {
    if (estTestInterne()) return;
    var exemples = [
      { id: 'clarte_intro', bloc: document.getElementById('extrait-fiche-intro'), produit: 'fiche-intro-droit-l1' },
      { id: 'memorisation_intro', bloc: document.getElementById('exemple-flashcards-qcm'), produit: 'flashcards-qcm-intro-droit-l1' },
      { id: 'methode_loyaute', bloc: document.getElementById('exemple-loyaute-preuve') }
    ].filter(function (exemple) { return !!exemple.bloc; });
    var reperes = [];
    exemples.forEach(function (exemple) {
      var repere = exemple.bloc.querySelector('[data-extrait-source], [data-corrige-source]');
      if (repere) reperes.push({ element: repere, id: exemple.id });
      exemple.bloc.addEventListener('click', function (event) {
        var cible = event.target.closest && event.target.closest('button, a');
        if (!cible || !exemple.bloc.contains(cible) || cible.disabled) return;
        if (exemple.produit && cible.getAttribute('data-tjd-produit') === exemple.produit) {
          interaction(exemple.id, 'ClicAcheter');
        } else if (cible.hasAttribute('data-apercu')) {
          interaction(exemple.id, 'ApercuFiche');
        } else if (cible.hasAttribute('data-demonstration-cta')) {
          interaction(exemple.id, 'ProgrammeStage');
        }
      }, true);
    });

    [ ['demo-flashcard-reponse', 'ReponseFlashcard'], ['demo-qcm-corrige', 'CorrigeQcm'] ].forEach(function (ligne) {
      var detail = document.getElementById(ligne[0]);
      if (detail) detail.addEventListener('toggle', function () {
        if (detail.open) interaction('memorisation_intro', ligne[1]);
      });
    });
    var memo = document.getElementById('exemple-flashcards-qcm');
    if (memo) memo.addEventListener('change', function (event) {
      var cible = event.target;
      if (cible.name === 'demo-memorisation-intro' && cible.checked) {
        interaction('memorisation_intro', 'ChoixQcm');
      }
    });
    var entree = document.getElementById('essai-memorisation-intro');
    if (entree) entree.addEventListener('click', function (event) {
      var lien = event.target.closest && event.target.closest('a');
      if (lien && entree.contains(lien) && lien.getAttribute('href') === 'flashcards-qcm.html#exemple-flashcards-qcm') {
        mesurer('quiz_intro', 'VersMemorisation');
      }
    }, true);

    if (typeof window.IntersectionObserver !== 'function') return;
    var observer = new window.IntersectionObserver(function (entrees) {
      if (document.hidden) return;
      entrees.forEach(function (entree) {
        if (!entree.isIntersecting || entree.intersectionRatio < 0.5) return;
        var repere = reperes.find(function (item) { return item.element === entree.target; });
        if (repere) mesurer(repere.id, 'ExempleVisible');
      });
    }, { threshold: 0.5 });
    reperes.forEach(function (repere) { observer.observe(repere.element); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      observer.disconnect();
      reperes.forEach(function (repere) { observer.observe(repere.element); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiser);
  else initialiser();
})();
