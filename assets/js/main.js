/* =========================================================
   TrajectoireDroit — main.js
   Initialisations communes à toutes les pages.
   ========================================================= */

/* ----- SKIP LINK (accessibilité clavier) -----
   Injecté en JS car le site n'a pas de gabarit HTML partagé : chaque
   page reçoit le lien sans qu'il faille éditer 75 fichiers un par un. */
(function () {
  var main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main-content';
  var skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = '#' + main.id;
  skip.textContent = 'Aller au contenu';
  document.body.insertBefore(skip, document.body.firstChild);
})();

/* ----- DARK MODE -----
   Le script anti-flash dans <head> applique déjà le thème au plus tôt.
   Ce bloc gère le bouton toggle une fois le DOM prêt.                   */
(function () {
  var THEME_KEY = 'tjd-theme';
  var html = document.documentElement;

  function currentTheme() {
    return html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }
    localStorage.setItem(THEME_KEY, theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F1A2E' : '#1A2851');
    // Swap logo header : logo-tjd.svg (fond clair) ↔ logo-tjd-light.svg (fond sombre)
    var headerLogo = document.querySelector('.site-header .logo__img');
    if (headerLogo) {
      var src = headerLogo.getAttribute('src') || '';
      if (theme === 'dark' && src.indexOf('logo-tjd-light.svg') === -1) {
        headerLogo.setAttribute('src', src.replace('logo-tjd.svg', 'logo-tjd-light.svg'));
      } else if (theme !== 'dark') {
        headerLogo.setAttribute('src', src.replace('logo-tjd-light.svg', 'logo-tjd.svg'));
      }
    }
  }

  function setIcon(btn) {
    if (!btn) return;
    var dark = currentTheme() === 'dark';
    btn.setAttribute('aria-label', dark ? 'Mode clair' : 'Mode sombre');
    /* soleil en dark, lune en light */
    btn.innerHTML = dark
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (btn) {
      setIcon(btn);
      btn.addEventListener('click', function () {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
        setIcon(btn);
      });
    }
    // Synchronise le logo header avec le thème initial (lu depuis localStorage par l'anti-flash script)
    var headerLogo = document.querySelector('.site-header .logo__img');
    if (headerLogo && currentTheme() === 'dark') {
      var src = headerLogo.getAttribute('src') || '';
      if (src.indexOf('logo-tjd-light.svg') === -1) {
        headerLogo.setAttribute('src', src.replace('logo-tjd.svg', 'logo-tjd-light.svg'));
      }
    }
  });
})();

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

  // ----- 7b. Mega-menu / dropdown accessibilité -----
  var navItems = document.querySelectorAll('.primary-nav .has-dropdown');
  navItems.forEach(function (item) {
    var link = item.querySelector('.nav-item__link');
    if (!link) return;
    // Click sur chevron ou link → toggle open (utile tablette touch)
    link.addEventListener('click', function (e) {
      // Si écran tactile (pas de hover capable), on toggle au lieu de naviguer immédiatement
      var hasHover = window.matchMedia('(hover: hover)').matches;
      if (!hasHover && !item.classList.contains('open')) {
        e.preventDefault();
        // ferme les autres
        navItems.forEach(function (other) {
          if (other !== item) other.classList.remove('open');
          var otherLink = other.querySelector('.nav-item__link');
          if (otherLink) otherLink.setAttribute('aria-expanded', 'false');
        });
        item.classList.add('open');
        link.setAttribute('aria-expanded', 'true');
      }
    });
    // Sur desktop : sync aria-expanded au hover
    item.addEventListener('mouseenter', function () { link.setAttribute('aria-expanded', 'true'); });
    item.addEventListener('mouseleave', function () { link.setAttribute('aria-expanded', 'false'); item.classList.remove('open'); });
  });
  // Click extérieur ferme tous les dropdowns
  document.addEventListener('click', function (e) {
    if (e.target.closest('.has-dropdown')) return;
    navItems.forEach(function (item) {
      item.classList.remove('open');
      var link = item.querySelector('.nav-item__link');
      if (link) link.setAttribute('aria-expanded', 'false');
    });
  });
  // Escape ferme tous les dropdowns
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      navItems.forEach(function (item) {
        item.classList.remove('open');
        var link = item.querySelector('.nav-item__link');
        if (link) link.setAttribute('aria-expanded', 'false');
      });
    }
  });

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

  // ----- 9. Newsletter : inscription envoyée vers Brevo (remplace Formspree) -----
  // Intercepte les formulaires dont l'action pointe vers Brevo (sibforms.com),
  // envoie l'email à la liste « Leads fiche gratuite », puis renvoie vers merci.html.
  // Garde le design existant : aucun markup n'est imposé, on lit juste le champ email.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.action || form.action.indexOf('sibforms.com') === -1) return;
    e.preventDefault();
    var emailInput = form.querySelector('input[type="email"], input[name="email"], input[name="EMAIL"]');
    var email = emailInput ? emailInput.value.trim() : '';
    if (!email) { if (emailInput) emailInput.focus(); return; }
    var btn = form.querySelector('button[type="submit"], button:not([type])');
    if (btn) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Inscription…'; }
    var fd = new FormData();
    fd.append('EMAIL', email);
    fd.append('email_address_check', '');
    fd.append('locale', 'fr');
    fd.append('html_type', 'simple');
    var url = form.action.split('?')[0] + '?isAjax=1';
    fetch(url, { method: 'POST', body: fd, mode: 'cors' })
      .then(function (r) { return r.json().catch(function () { return { success: true }; }); })
      .then(function (data) {
        if (data && data.success === false) {
          if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.label || 'S’inscrire'; }
          alert(data.message || 'Une erreur est survenue, réessaie dans un instant.');
          return;
        }
        window.location.href = '/merci.html';
      })
      .catch(function () { window.location.href = '/merci.html'; });
  }, true);

})();
