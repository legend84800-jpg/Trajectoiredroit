/* =========================================================
   TrajectoireDroit — main.js
   Initialisations communes à toutes les pages.
   ========================================================= */
(function () {
  'use strict';

  // ----- 1. Année dynamique dans le footer -----
  var year = document.getElementById('footerYear');
  if (year) year.textContent = new Date().getFullYear();

  // ----- 2. Fade-in au scroll -----
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('appear');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.fade-in').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.fade-in').forEach(function (el) { el.classList.add('appear'); });
  }

  // ----- 3. Burger menu mobile -----
  var burger = document.getElementById('burgerBtn');
  var mobileNav = document.getElementById('mobileNav');
  if (burger && mobileNav) {
    burger.addEventListener('click', function () {
      var open = mobileNav.classList.toggle('open');
      mobileNav.hidden = !open;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.textContent = open ? '✕' : '☰';
      document.body.style.overflow = open ? 'hidden' : '';
    });
    // Fermer en cliquant sur un lien
    mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileNav.classList.remove('open');
        mobileNav.hidden = true;
        burger.setAttribute('aria-expanded', 'false');
        burger.textContent = '☰';
        document.body.style.overflow = '';
      });
    });
  }

  // ----- 4. Urgency banner : countdown + dismiss -----
  var banner = document.getElementById('urgencyBanner');
  if (banner && !sessionStorage.getItem('urgencyDismissed')) {
    banner.hidden = false;
    var deadline = banner.getAttribute('data-deadline');
    var countdown = document.getElementById('urgencyCountdown');
    if (deadline && countdown) {
      var target = new Date(deadline).getTime();
      var update = function () {
        var diff = target - Date.now();
        if (diff <= 0) {
          countdown.textContent = 'terminée';
          return;
        }
        var d = Math.floor(diff / 86400000);
        var h = Math.floor((diff / 3600000) % 24);
        var m = Math.floor((diff / 60000) % 60);
        countdown.textContent = d + 'j ' + h + 'h ' + m + 'm';
      };
      update();
      setInterval(update, 30000);
    }
    var closeBtn = banner.querySelector('[data-close-urgency]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        banner.hidden = true;
        sessionStorage.setItem('urgencyDismissed', '1');
      });
    }
  }

  // ----- 5. Exit-intent modal (desktop only, 1× par session, après engagement) -----
  // Conditions cumulées avant déclenchement :
  //   - desktop (>= 768px)
  //   - pas déjà vu cette session
  //   - >= 30 secondes sur la page
  //   - >= 25% scrollé (preuve d'engagement)
  //   - souris quitte par le haut OU 60 secondes sans interaction
  var modal = document.getElementById('exitModal');
  if (modal && window.matchMedia('(min-width: 768px)').matches && !sessionStorage.getItem('exitShown')) {
    var triggered = false;
    var pageLoadedAt = Date.now();
    var minTimeMs = 30000;   // 30 s minimum
    var minScroll = 0.25;    // 25 % de la page

    function hasEngaged() {
      var elapsed = Date.now() - pageLoadedAt;
      if (elapsed < minTimeMs) return false;
      var scrollRatio = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      return scrollRatio >= minScroll;
    }

    function fireModal() {
      if (triggered) return;
      triggered = true;
      modal.classList.add('open');
      sessionStorage.setItem('exitShown', '1');
    }

    function onMouseLeave(e) {
      if (e.clientY <= 0 && hasEngaged()) fireModal();
    }

    document.addEventListener('mouseleave', onMouseLeave);

    // Fallback : si l'utilisateur reste 60 sec sans bouger la souris vers le haut,
    // on déclenche quand même (en page de défilement par exemple)
    setTimeout(function () {
      if (!triggered && hasEngaged()) fireModal();
    }, 60000);

    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.hasAttribute('data-close-modal')) {
        modal.classList.remove('open');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') modal.classList.remove('open');
    });
  }

  // ----- 8. Compteurs animés (count-up) -----
  if ('IntersectionObserver' in window) {
    var counterIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var target = parseFloat(el.getAttribute('data-count-to'));
        if (isNaN(target)) return;
        var suffix = el.getAttribute('data-count-suffix') || '';
        var prefix = el.getAttribute('data-count-prefix') || '';
        var duration = 1400;
        var start = 0;
        var startTime = null;
        function tick(ts) {
          if (!startTime) startTime = ts;
          var p = Math.min(1, (ts - startTime) / duration);
          // ease-out cubic
          var eased = 1 - Math.pow(1 - p, 3);
          var v = start + (target - start) * eased;
          // formatage : entier si target est entier, sinon 1 décimale
          var displayed = Number.isInteger(target) ? Math.round(v) : v.toFixed(1);
          // séparateur milliers à la française
          if (Number.isInteger(target) && target >= 1000) {
            displayed = String(displayed).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
          }
          el.textContent = prefix + displayed + suffix;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        counterIo.unobserve(el);
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('[data-count-to]').forEach(function (el) { counterIo.observe(el); });
  }

  // ----- 6. Filtres catalogue (chips) -----
  var filtersRoot = document.querySelector('[data-filters]');
  if (filtersRoot) {
    var grid = document.querySelector('[data-filter-grid]');
    var state = { niveau: 'tous', matiere: 'tous' };
    filtersRoot.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var group = chip.getAttribute('data-group');
        var value = chip.getAttribute('data-value');
        state[group] = value;
        // Toggle active in same group
        filtersRoot.querySelectorAll('.filter-chip[data-group="' + group + '"]').forEach(function (c) {
          c.classList.toggle('active', c === chip);
        });
        if (!grid) return;
        grid.querySelectorAll('[data-niveau]').forEach(function (card) {
          var matchN = state.niveau === 'tous' || card.getAttribute('data-niveau').split(',').indexOf(state.niveau) !== -1;
          var matchM = state.matiere === 'tous' || card.getAttribute('data-matiere').split(',').indexOf(state.matiere) !== -1;
          card.hidden = !(matchN && matchM);
        });
      });
    });
  }

  // ----- 7. Savings calculator (Hassle Premium) -----
  var calc = document.querySelector('[data-calc]');
  if (calc) {
    var slider = calc.querySelector('input[type=range]');
    var hoursOut = calc.querySelector('[data-calc-hours]');
    var moneyOut = calc.querySelector('[data-calc-money]');
    var update = function () {
      var arrets = parseInt(slider.value, 10);
      var saved = arrets * 1.5; // 1h30 économisé par arrêt en moyenne
      var money = arrets * 6;   // 6€/arrêt valeur équivalente cours particulier
      if (hoursOut) hoursOut.textContent = saved.toFixed(0) + ' h';
      if (moneyOut) moneyOut.textContent = money + ' €';
    };
    if (slider) {
      slider.addEventListener('input', update);
      update();
    }
  }

})();
