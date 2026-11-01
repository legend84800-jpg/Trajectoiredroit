/* Mesure les aperçus de ce cours dans le suivi Matomo existant. */
(function () {
  var produit = 'cours-images-contrats-l2-s1';

  function mesurer(action) {
    if (window.tjdTestInterne || !window._paq) return;
    try { window._paq.push(['trackEvent', 'Produit', action, produit]); }
    catch (_) { /* La consultation du cours reste indépendante de la mesure. */ }
  }

  document.addEventListener('click', function (event) {
    if (!event.target || typeof event.target.closest !== 'function') return;
    var bouton = event.target.closest('[data-apercu]');
    var modal = document.getElementById('apercuModal');
    if (bouton && modal && modal.classList.contains('open')) {
      mesurer('ApercuCoursOuvert');
    } else if (event.target.closest('#apercuModal .apercu-page')) {
      mesurer('PageApercuAgrandie');
    }
  });
})();
