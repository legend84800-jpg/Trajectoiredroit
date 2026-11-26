/* ----- CARROUSEL D'APERÇU PRODUIT (accueil et aperçus des partiels) -----
   Le swipe tactile est natif (scroll-snap CSS) : ce script gère seulement
   les boutons, les points et la position de la page visible. */
(function () {
  function initCarousel(root) {
    var track = root.querySelector('.product-carousel__viewport');
    var slides = Array.prototype.slice.call(root.querySelectorAll('.product-carousel__slide'));
    var dots = Array.prototype.slice.call(root.querySelectorAll('.product-carousel__dot'));
    if (!track || !slides.length) return;

    var prevBtn = root.querySelector('[data-carousel-prev]');
    var nextBtn = root.querySelector('[data-carousel-next]');
    var position = root.querySelector('[data-carousel-position]');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var current = -1;
    var last = slides.length - 1;

    function isRtl() {
      return getComputedStyle(track).direction === 'rtl';
    }

    function goTo(index) {
      if (index < 0 || index > last || index === current) return;
      var slideWidth = slides[0].getBoundingClientRect().width;
      track.scrollTo({
        left: index * slideWidth * (isRtl() ? -1 : 1),
        behavior: reduceMotion.matches ? 'instant' : 'smooth'
      });
    }

    function updateActivePage() {
      var slideWidth = slides[0].getBoundingClientRect().width;
      if (!slideWidth) return;
      var index = Math.min(last, Math.round(Math.abs(track.scrollLeft) / slideWidth));
      if (index === current) return;
      current = index;

      dots.forEach(function (dot, dotIndex) {
        var active = dotIndex === current;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      if (prevBtn) prevBtn.setAttribute('aria-disabled', String(current === 0));
      if (nextBtn) nextBtn.setAttribute('aria-disabled', String(current === last));
      if (position) {
        var label = (current + 1) + ' sur ' + slides.length;
        if (position.textContent !== label) position.textContent = label;
      }
    }

    function turnPage(step) {
      updateActivePage();
      goTo(current + step);
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { turnPage(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { turnPage(1); });
    dots.forEach(function (dot, index) { dot.addEventListener('click', function () { goTo(index); }); });
    track.addEventListener('scroll', updateActivePage, { passive: true });
    track.addEventListener('keydown', function (event) {
      if (track.scrollWidth <= track.clientWidth) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      var index;
      if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = last;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        updateActivePage();
        var step = event.key === 'ArrowRight' ? 1 : -1;
        index = current + (isRtl() ? -step : step);
      } else return;
      event.preventDefault();
      goTo(index);
    });
    root.setAttribute('data-carousel-ready', '');
    if (track.hasAttribute('data-carousel-focus')) {
      function updateFocus() {
        track.tabIndex = track.scrollWidth > track.clientWidth ? 0 : -1;
        updateActivePage();
      }
      window.addEventListener('resize', updateFocus, { passive: true });
      updateFocus();
    }
    updateActivePage();
  }
  function init() {
    document.querySelectorAll('[data-product-carousel]').forEach(initCarousel);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
