/* C30 pilotage CEO 2026-11-06 : la couverture de l'encadré d'offre recevait des clics morts
   (14 sur 21 sur sujets-droit-constitutionnel-l1, Atelier Comportement). Un clic sur la couverture
   amène aux boutons d'achat de la même carte et met en avant le bouton recommandé,
   sans ouvrir le paiement. */
(function () {
  if (typeof document === 'undefined' || !document.head) return;
  var style = document.createElement('style');
  style.textContent = '.conversion-offer__visual img{cursor:pointer}' +
    '@keyframes tjdCouvertureCible{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}50%{box-shadow:0 0 0 6px rgba(37,99,235,.35)}}' +
    '.tjd-couverture-cible{animation:tjdCouvertureCible .9s ease-in-out 2}';
  document.head.appendChild(style);
  document.addEventListener('click', function (e) {
    var img = e.target && e.target.closest && e.target.closest('.conversion-offer__visual img');
    if (!img) return;
    var carte = img.closest('.conversion-offer__card') || img.closest('section');
    if (!carte) return;
    var bouton = carte.querySelector('.btn--recommended[data-tjd-produit]') || carte.querySelector('[data-tjd-produit]') || carte.querySelector('.btn--primary');
    if (!bouton) return;
    bouton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    bouton.classList.remove('tjd-couverture-cible');
    void bouton.offsetWidth;
    bouton.classList.add('tjd-couverture-cible');
    try { bouton.focus({ preventScroll: true }); } catch (err) {}
    if (window._paq) window._paq.push(['trackEvent', 'Offre', 'CouvertureCliquee', location.pathname]);
  });
})();
