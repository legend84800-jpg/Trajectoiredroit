/* Isole les tests internes des statistiques commerciales du site. */
(function () {
  var interne = false;
  try {
    var valeur = new URLSearchParams(window.location.search).get('tjd_test');
    if (valeur === '1') localStorage.setItem('tjd_internal_test', '1');
    if (valeur === '0') localStorage.removeItem('tjd_internal_test');
    interne = localStorage.getItem('tjd_internal_test') === '1';
  } catch (_) {
    interne = false;
  }
  window.tjdTestInterne = interne;
})();
