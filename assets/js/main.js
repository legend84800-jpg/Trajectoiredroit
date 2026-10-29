/* =========================================================
   TrajectoireDroit — main.js
   Initialisations communes à toutes les pages.
   ========================================================= */

/* ----- ATTRIBUTION : landing page, referrer et UTM -----
   Capturés à la première page vue de la session, pour que chaque vente et
   chaque lead puissent être reliés à la page et à la source qui les ont
   amenés (voir achat.js et api/create-checkout.js pour la suite).
   sessionStorage meurt avec l'onglet : une arrivée avec UTM est donc aussi
   gardée 30 jours en localStorage (dernier contact gagne), puis recopiée en
   sessionStorage à la première page d'une session suivante sans UTM, pour
   qu'un achat différé reste attribué au réseau qui a amené le visiteur. */
(function () {
  var CLES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  var CLE_LOCALE = 'tjd_attribution';
  var DUREE_MAX = 30 * 24 * 60 * 60 * 1000;

  function lire(nom, cle) {
    try { return window[nom].getItem(cle); } catch (e) { return null; }
  }
  function ecrire(nom, cle, val) {
    try {
      if (val) window[nom].setItem(cle, val);
      else window[nom].removeItem(cle);
    } catch (e) {}
  }
  function remplirSession(contact) {
    ecrire('sessionStorage', 'tjd_landing_page', contact.landing_page || '/');
    ecrire('sessionStorage', 'tjd_referrer', contact.referrer || '');
    CLES_UTM.forEach(function (cle) {
      ecrire('sessionStorage', 'tjd_' + cle, contact[cle] || '');
    });
  }

  var params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
  var contact = {
    landing_page: window.location.pathname.replace(/^\//, '') || '/',
    referrer: (document.referrer || '').slice(0, 200)
  };
  var porteUtm = false;
  CLES_UTM.forEach(function (cle) {
    var val = params.get(cle);
    if (val) { contact[cle] = val.slice(0, 100); porteUtm = true; }
  });

  // Arrivée avec UTM : nouveau contact, il remplace l'ancien dans l'onglet
  // comme dans la mémoire de 30 jours.
  if (porteUtm) {
    remplirSession(contact);
    contact.ts = Date.now();
    try { ecrire('localStorage', CLE_LOCALE, JSON.stringify(contact)); } catch (e) {}
    return;
  }

  if (lire('sessionStorage', 'tjd_landing_page')) return;

  // Nouvelle session sans UTM : on reprend le dernier contact UTM s'il date
  // de moins de 30 jours, sinon on garde la page et le referrer du moment.
  var memorise = null;
  try { memorise = JSON.parse(lire('localStorage', CLE_LOCALE) || 'null'); } catch (e) {}
  if (memorise && typeof memorise.ts === 'number' && Date.now() - memorise.ts < DUREE_MAX) {
    remplirSession(memorise);
    return;
  }
  remplirSession(contact);
})();

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

/* Fenêtres superposées. Le clavier reste dans la fenêtre ouverte, puis revient
   au bouton qui l'a ouverte. Les aperçus agrandis conservent leur fenêtre parente. */
window.tjdDialogues = (function () {
  var pile = [];
  function controles(noeud) {
    return Array.prototype.filter.call(noeud.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'), function (el) {
      return !el.disabled && el.getAttribute('tabindex') !== '-1' && !el.hidden && el.getClientRects().length > 0;
    });
  }
  function ouvrir(noeud, premier, declencheur) {
    if (pile.some(function (etat) { return etat.noeud === noeud; })) return;
    var etat = { noeud: noeud, retour: declencheur || document.activeElement, overflow: document.body.style.overflow, inert: noeud.inert, cache: noeud.getAttribute('aria-hidden'), voisins: [] };
    noeud.inert = false; noeud.removeAttribute('aria-hidden');
    Array.prototype.forEach.call(document.body.children, function (voisin) {
      if (voisin === noeud || voisin.contains(noeud)) return;
      etat.voisins.push({ noeud: voisin, inert: voisin.inert, cache: voisin.getAttribute('aria-hidden') });
      voisin.inert = true;
      voisin.setAttribute('aria-hidden', 'true');
    });
    pile.push(etat);
    noeud.classList.add('open');
    document.body.style.overflow = 'hidden';
    (premier || controles(noeud)[0] || noeud).focus();
    document.dispatchEvent(new CustomEvent('tjd:dialogue'));
  }
  function fermer(noeud) {
    var position = pile.findIndex(function (etat) { return etat.noeud === noeud; });
    if (position < 0) return;
    while (pile.length > position) {
      var etat = pile.pop();
      etat.noeud.classList.remove('open');
      etat.noeud.inert = etat.inert;
      if (etat.cache === null) etat.noeud.removeAttribute('aria-hidden');
      else etat.noeud.setAttribute('aria-hidden', etat.cache);
      etat.voisins.forEach(function (voisin) {
        voisin.noeud.inert = voisin.inert;
        if (voisin.cache === null) voisin.noeud.removeAttribute('aria-hidden');
        else voisin.noeud.setAttribute('aria-hidden', voisin.cache);
      });
      document.body.style.overflow = etat.overflow;
      if (etat.retour && etat.retour.isConnected) etat.retour.focus();
    }
    document.dispatchEvent(new CustomEvent('tjd:dialogue'));
  }
  document.addEventListener('keydown', function (e) {
    var etat = pile[pile.length - 1];
    if (!etat) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      fermer(etat.noeud);
    } else if (e.key === 'Tab') {
      var liste = controles(etat.noeud);
      var premier = liste[0], dernier = liste[liste.length - 1];
      if (!premier) { e.preventDefault(); etat.noeud.focus(); return; }
      if (e.shiftKey && (document.activeElement === premier || !etat.noeud.contains(document.activeElement))) {
        e.preventDefault(); dernier.focus();
      } else if (!e.shiftKey && (document.activeElement === dernier || !etat.noeud.contains(document.activeElement))) {
        e.preventDefault(); premier.focus();
      }
    }
  });
  document.addEventListener('focusin', function (e) {
    var etat = pile[pile.length - 1];
    if (etat && !etat.noeud.contains(e.target)) (controles(etat.noeud)[0] || etat.noeud).focus();
  });
  return { ouvrir: ouvrir, fermer: fermer, estOuvert: function () { return pile.length > 0; } };
})();

/* ----- RECHERCHE SITE-WIDE -----
   Le moteur et son index se chargent seulement à la première recherche. */
(function () {
  var chargement = null;
  function initialiser() {
    var host = document.querySelector('.site-header__cta');
    if (!host) return;
    var trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'search-trigger';
    trigger.setAttribute('aria-label', 'Rechercher sur le site');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    host.insertBefore(trigger, host.firstChild);
    function ouvrir() {
      if (window.tjdOuvrirRecherche) { window.tjdOuvrirRecherche(); return; }
      if (chargement) return;
      trigger.setAttribute('aria-busy', 'true');
      chargement = document.createElement('script');
      chargement.src = '/assets/js/recherche.js?v=ad9631be';
      chargement.onload = function () {
        trigger.removeAttribute('aria-busy');
        var erreur = document.querySelector('.search-load-error'); if (erreur) erreur.remove();
        if (window.tjdOuvrirRecherche) window.tjdOuvrirRecherche();
      };
      chargement.onerror = function () {
        trigger.removeAttribute('aria-busy'); chargement.remove(); chargement = null;
        var ancien = document.querySelector('.search-load-error');
        if (ancien) ancien.remove();
        var message = document.createElement('p'); message.className = 'search-load-error'; message.setAttribute('role', 'status');
        message.appendChild(document.createTextNode('La recherche est indisponible. '));
        var lien = document.createElement('a'); lien.href = '/formations.html'; lien.textContent = 'Ouvrir le catalogue';
        message.appendChild(lien); host.appendChild(message);
      };
      document.body.appendChild(chargement);
    }
    trigger.addEventListener('click', ouvrir);
    document.addEventListener('keydown', function (e) {
      var actif = document.activeElement;
      var tag = actif && actif.tagName;
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !window.tjdDialogues.estOuvert() && tag !== 'INPUT' && tag !== 'TEXTAREA' && !(actif && actif.isContentEditable)) {
        e.preventDefault(); ouvrir();
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiser);
  else initialiser();
})();

/* ----- APERÇU PDF (modale) -----
   Injecté une seule fois par page si au moins un déclencheur [data-apercu] existe
   (catalogue formations.html et pages matière individuelles). Le CTA de la modale
   porte data-tjd-produit : achat.js gère déjà le clic globalement, pas besoin de le refaire ici. */
(function () {
  function init() {
    var triggers = document.querySelectorAll('[data-apercu]');
    if (!triggers.length) return;
    if (document.getElementById('apercuModal')) return;

    var modal = document.createElement('div');
    modal.className = 'apercu-backdrop';
    modal.id = 'apercuModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'apercuTitle');
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML =
      '<div class="apercu-panel">' +
      '<div class="apercu-head">' +
      '<div><h3 id="apercuTitle"></h3><p id="apercuSub">Extraits réels de la fiche complète</p></div>' +
      '<button class="apercu-close" data-apercu-close aria-label="Fermer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5L19 19"/><path d="M19 5L5 19"/></svg></button>' +
      '</div>' +
      '<div class="apercu-imgs" id="apercuImgs"></div>' +
      '<p class="apercu-hint">Tu peux agrandir chaque page.</p>' +
      '<div class="apercu-foot">' +
      '<span class="price" id="apercuPrice"></span>' +
      '<a class="btn btn--primary" id="apercuCta" href="#" target="_blank" rel="noopener">Acheter la fiche</a>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);

    /* Visionneuse plein écran : la page s'affiche en grand et se parcourt en faisant glisser,
       pour que le texte soit lisible sur téléphone. */
    var viewer = document.createElement('div');
    viewer.className = 'apercu-zoom';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Page agrandie');
    viewer.setAttribute('tabindex', '-1');
    viewer.innerHTML =
      '<button class="apercu-zoom__close" aria-label="Fermer l’agrandissement"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 5L19 19"/><path d="M19 5L5 19"/></svg></button>' +
      '<div class="apercu-zoom__scroll"><img alt=""></div>' +
      '<p class="apercu-zoom__hint">Fais défiler l’image pour lire toute la page.</p>';
    document.body.appendChild(viewer);
    var viewerImg = viewer.querySelector('img');
    var viewerScroll = viewer.querySelector('.apercu-zoom__scroll');
    function openViewer(im, bouton) {
      viewerImg.src = im.src;
      viewerImg.alt = im.alt;
      viewer.classList.toggle('apercu-zoom--detail', im.getAttribute('data-detail') === '1');
      window.tjdDialogues.ouvrir(viewer, viewer.querySelector('.apercu-zoom__close'), bouton);
      viewerScroll.scrollTop = 0;
      viewerScroll.scrollLeft = 0;
      try { if (window.gtag) gtag('event', 'apercu_zoom', { image: im.src.split('/').pop() }); } catch (_) {}
    }
    function closeViewer() { window.tjdDialogues.fermer(viewer); }
    viewer.querySelector('.apercu-zoom__close').addEventListener('click', closeViewer);

    var imgsBox = document.getElementById('apercuImgs');
    imgsBox.addEventListener('click', function (e) {
      var bouton = e.target.closest('.apercu-page');
      if (bouton) openViewer(bouton.querySelector('img'), bouton);
    });

    function open(btn) {
      var imgs;
      try { imgs = JSON.parse(btn.getAttribute('data-apercu') || '[]'); } catch (e) { imgs = []; }
      document.getElementById('apercuTitle').textContent = btn.getAttribute('data-apercu-title') || 'Aperçu';
      document.getElementById('apercuSub').textContent = btn.getAttribute('data-apercu-sub') || 'Extraits réels de la fiche complète';
      var price = btn.getAttribute('data-apercu-price') || '';
      document.getElementById('apercuPrice').textContent = price;
      var cta = document.getElementById('apercuCta');
      var ctaVal = btn.getAttribute('data-apercu-cta') || '#';
      if (ctaVal && !ctaVal.startsWith('http')) {
        cta.href = '#';
        cta.setAttribute('data-tjd-produit', ctaVal);
      } else {
        cta.href = ctaVal;
        cta.removeAttribute('data-tjd-produit');
      }
      cta.textContent = price ? ('Acheter · ' + price) : 'Acheter la fiche';
      imgsBox.innerHTML = '';
      imgs.forEach(function (src, position) {
        var im = document.createElement('img');
        var detail = /-zoom\.(jpg|webp|png)$/.test(src);
        im.src = src; im.loading = 'lazy';
        im.alt = detail ? 'Gros plan sur une page' : 'Extrait ' + (position + 1) + ' du document';
        if (detail) im.setAttribute('data-detail', '1');
        var bouton = document.createElement('button'); bouton.type = 'button'; bouton.className = 'apercu-page';
        bouton.setAttribute('aria-label', 'Agrandir l’extrait ' + (position + 1));
        bouton.appendChild(im); imgsBox.appendChild(bouton);
      });
      imgsBox.scrollTop = 0;
      window.tjdDialogues.ouvrir(modal, modal.querySelector('.apercu-close'), btn);
      try { if (window.gtag) gtag('event', 'apercu_open', { matiere: btn.getAttribute('data-apercu-title') || '' }); } catch (_) {}
    }
    function close() { window.tjdDialogues.fermer(modal); }
    triggers.forEach(function (b) { b.addEventListener('click', function () { open(b); }); });
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-apercu-close]')) close();
    });

  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Sur téléphone, la barre basse laisse la place aux choix déjà visibles.
   Sa hauteur réelle réserve l'espace nécessaire lorsque les textes reviennent à la ligne. */
(function () {
  function initialiser() {
    var barres = Array.prototype.slice.call(document.querySelectorAll('.sticky-cta-bar, .sticky-cta'));
    if (!barres.length) return;
    var media = window.matchMedia('(max-width: 768px)');
    var visibles = new Set();
    var attente = false;
    function actualiser() {
      attente = false;
      var suspendre = media.matches && (visibles.size > 0 || window.tjdDialogues.estOuvert() ||
        !!document.querySelector('#mobileNav.open, #tjdPanierBackdrop.open, #exitModal.open, .cookie-banner--visible'));
      var hauteur = 0;
      barres.forEach(function (barre) {
        if (barre.classList.contains('tjd-sticky-suspended') !== suspendre) barre.classList.toggle('tjd-sticky-suspended', suspendre);
        if (getComputedStyle(barre).display !== 'none') hauteur = Math.max(hauteur, barre.getBoundingClientRect().height);
      });
      var valeur = Math.ceil(hauteur) + 'px';
      if (document.documentElement.style.getPropertyValue('--tjd-sticky-height') !== valeur) document.documentElement.style.setProperty('--tjd-sticky-height', valeur);
    }
    function programmer() {
      if (attente) return;
      attente = true;
      (window.requestAnimationFrame || function (fn) { setTimeout(fn, 16); })(actualiser);
    }
    var observation = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entrees) {
      entrees.forEach(function (entree) {
        if (entree.isIntersecting && (entree.target === bandeau || entree.intersectionRatio >= 0.5)) visibles.add(entree.target); else visibles.delete(entree.target);
      });
      programmer();
    }, { threshold: [0, 0.5] }) : null;
    var bandeau = null;
    function observerBandeau() {
      var nouveau = document.getElementById('urgencyBanner');
      if (nouveau === bandeau) return;
      if (bandeau) { if (observation) observation.unobserve(bandeau); visibles.delete(bandeau); }
      bandeau = nouveau;
      if (bandeau && observation) observation.observe(bandeau);
      programmer();
    }
    if (observation) {
      document.querySelectorAll('main [data-tjd-produit], .site-footer').forEach(function (element) {
        if (!element.closest('.sticky-cta-bar, .sticky-cta')) observation.observe(element);
      });
      observerBandeau();
    }
    if (typeof ResizeObserver === 'function') {
      var tailles = new ResizeObserver(programmer);
      barres.forEach(function (barre) { tailles.observe(barre); });
    }
    if (typeof MutationObserver === 'function') new MutationObserver(function (mutations) {
      if (mutations.some(function (mutation) {
        return mutation.target === document.body || (mutation.target.matches && mutation.target.matches('#mobileNav, #urgencyBanner, #tjdPanierBackdrop, #exitModal, .cookie-banner'));
      })) { observerBandeau(); programmer(); }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    document.addEventListener('tjd:dialogue', programmer);
    window.addEventListener('tjd:consent', programmer);
    window.addEventListener('resize', programmer, { passive: true });
    if (media.addEventListener) media.addEventListener('change', programmer);
    actualiser();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiser);
  else initialiser();
})();

/* ----- CARROUSEL D'APERÇU PRODUIT (page d'accueil) -----
   Le swipe tactile est natif (scroll-snap CSS) : ce script gère seulement
   les flèches, les dots et la synchronisation du dot actif au scroll. */
(function () {
  function initCarousel(root) {
    var track = root.querySelector('.product-carousel__viewport');
    var slides = Array.prototype.slice.call(root.querySelectorAll('.product-carousel__slide'));
    var dots = Array.prototype.slice.call(root.querySelectorAll('.product-carousel__dot'));
    if (!track || !slides.length) return;

    function goTo(i) {
      slides[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    function setActive(i) {
      dots.forEach(function (d, di) { d.classList.toggle('is-active', di === i); });
    }

    var prevBtn = root.querySelector('[data-carousel-prev]');
    var nextBtn = root.querySelector('[data-carousel-next]');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      var current = dots.findIndex(function (d) { return d.classList.contains('is-active'); });
      goTo(Math.max(0, current - 1));
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      var current = dots.findIndex(function (d) { return d.classList.contains('is-active'); });
      goTo(Math.min(slides.length - 1, current + 1));
    });
    dots.forEach(function (d, i) { d.addEventListener('click', function () { goTo(i); }); });

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActive(slides.indexOf(entry.target));
          }
        });
      }, { root: track, threshold: 0.6 });
      slides.forEach(function (s) { observer.observe(s); });
    }
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
  var BURGER_ICON = '<svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg#icon-menu"/></svg>';
  var CLOSE_ICON = '<svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg#icon-close"/></svg>';
  if (burger && mobileNav) {
    burger.addEventListener('click', function () {
      var open = mobileNav.classList.toggle('open');
      mobileNav.hidden = !open;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.innerHTML = open ? CLOSE_ICON : BURGER_ICON;
      document.body.style.overflow = open ? 'hidden' : '';
      // Le bandeau d'urgence pousse le header sous y=0 tant qu'on n'a pas scrollé :
      // on recale le panneau sur le vrai bas du header plutôt que sur --header-h fixe.
      if (open) {
        var headerEl = document.querySelector('.site-header');
        if (headerEl) mobileNav.style.top = headerEl.getBoundingClientRect().bottom + 'px';
      }
    });
    // Fermer en cliquant sur un lien
    mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileNav.classList.remove('open');
        mobileNav.hidden = true;
        burger.setAttribute('aria-expanded', 'false');
        burger.innerHTML = BURGER_ICON;
        document.body.style.overflow = '';
      });
    });
    // Recherche + thème masqués du header sous 1080px faute de place (voir style.css) :
    // les 2 actions rapides du menu mobile relaient les boutons desktop existants,
    // recherchés au clic (pas à l'init) pour ne pas dépendre de leur ordre de création.
    var mobileSearchBtn = mobileNav.querySelector('[data-mobile-search]');
    if (mobileSearchBtn) {
      mobileSearchBtn.addEventListener('click', function () {
        mobileNav.classList.remove('open');
        mobileNav.hidden = true;
        burger.setAttribute('aria-expanded', 'false');
        burger.innerHTML = BURGER_ICON;
        document.body.style.overflow = '';
        var trigger = document.querySelector('.search-trigger');
        if (trigger) setTimeout(function () { trigger.click(); }, 60);
      });
    }
    var mobileThemeBtn = mobileNav.querySelector('[data-mobile-theme]');
    if (mobileThemeBtn) {
      var mobileThemeLabel = mobileThemeBtn.querySelector('[data-mobile-theme-label]');
      var syncMobileThemeLabel = function () {
        if (mobileThemeLabel) {
          mobileThemeLabel.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Mode clair' : 'Mode sombre';
        }
      };
      syncMobileThemeLabel();
      mobileThemeBtn.addEventListener('click', function () {
        var toggle = document.getElementById('themeToggle');
        if (toggle) toggle.click();
        syncMobileThemeLabel();
      });
    }
  }

  // ----- 4. Bascule saisonnière : bandeau, zone haute de l'accueil, bouton collant -----
  // Tout le contenu vient d'un seul fichier, assets/data/saison.json, mis à jour
  // chaque lundi par la routine bascule-saisonniere-tjd selon la période de
  // l'année universitaire. Règle de sécurité : si le fichier manque, est mal
  // formé ou si sa période est terminée (date "fin" passée), rien ne change et
  // chaque page garde exactement son affichage codé en dur. Le compte à rebours
  // n'apparaît que si le fichier donne une vraie échéance ("compte_a_rebours_fin"),
  // jamais un faux compte à rebours qui repart à chaque visite.
  // Le fichier peut aussi porter une liste "periodes" écrite à l'avance : la page
  // affiche celle dont les dates (debut, fin) contiennent le jour, pour que la
  // bascule tombe à minuit et pas à l'heure où la routine tourne.
  // Les clics du bandeau et du bouton collant partent dans Matomo (catégorie
  // "saison", libellé = id de la période) pour mesurer ce que la période rapporte.
  (function () {
    if (!window.fetch || !window.JSON) return;
    var chemin = window.location.pathname;
    var page = chemin.split('/').pop() || 'index.html';
    var estAccueil = chemin === '/' || chemin === '/index.html';
    var nomPage = page.replace(/\.html$/, '');

    function pageDans(liste) {
      if (!liste || !liste.length) return false;
      for (var i = 0; i < liste.length; i++) {
        var cible = String(liste[i]).replace(/\.html$/, '');
        if (cible === 'accueil' || cible === 'index') { if (estAccueil) return true; }
        else if (cible.slice(-1) === '*') { if (nomPage.indexOf(cible.slice(0, -1)) === 0) return true; }
        else if (cible === nomPage) return true;
      }
      return false;
    }
    function texte(v) { return typeof v === 'string' && v.trim() ? v.trim() : null; }
    function lienSur(v) {
      var l = texte(v);
      return l && !/^\s*javascript:/i.test(l) ? l : null;
    }
    function el(tag, classe, contenu) {
      var n = document.createElement(tag);
      if (classe) n.className = classe;
      if (contenu) n.textContent = contenu;
      return n;
    }
    function lireSession(cle) { try { return sessionStorage.getItem(cle); } catch (e) { return null; } }
    function ecrireSession(cle) { try { sessionStorage.setItem(cle, '1'); } catch (e) {} }
    function suivreClic(lien, action, idPeriode) {
      lien.addEventListener('click', function () {
        if (window._paq) window._paq.push(['trackEvent', 'saison', action, idPeriode]);
      });
    }

    function bandeau(b, idPeriode) {
      var header = document.querySelector('.site-header');
      var lien = b && lienSur(b.lien);
      var fort = b && texte(b.etiquette_forte);
      if (!header || !lien || !fort || b.actif === false) return;
      if (pageDans(b.masquer_sur)) return;
      // Liste blanche facultative : si elle existe, le bandeau ne sort que sur ces pages
      // (depuis le 01/10/2026, accueil et pages méthode, pour laisser les pages de vente à la fiche).
      if (b.afficher_sur && b.afficher_sur.length && !pageDans(b.afficher_sur)) return;
      var cleFerme = 'saisonBandeauFerme:' + idPeriode;
      if (lireSession(cleFerme)) return;

      var echeance = texte(b.compte_a_rebours_fin) ? new Date(b.compte_a_rebours_fin).getTime() : NaN;
      var avecDecompte = !isNaN(echeance) && echeance > Date.now();

      var banner = el('div', 'urgency-banner');
      banner.id = 'urgencyBanner';
      var a = el('a', 'urgency-banner__link');
      a.href = lien;
      suivreClic(a, 'clic-bandeau', idPeriode);
      var dot = el('span', 'urgency-banner__dot');
      dot.setAttribute('aria-hidden', 'true');
      a.appendChild(dot);
      var label = el('span', 'urgency-banner__label');
      label.appendChild(el('span', 'urgency-banner__label-strong', fort));
      if (texte(b.etiquette)) label.appendChild(document.createTextNode(b.etiquette));
      a.appendChild(label);
      if (texte(b.puce)) a.appendChild(el('span', 'urgency-banner__chip', b.puce));
      var countdown = null;
      if (avecDecompte) {
        var groupe = el('span', 'urgency-banner__countdown-group');
        groupe.appendChild(el('span', 'urgency-banner__countdown-label', texte(b.compte_a_rebours_libelle) || 'Ferme dans'));
        countdown = el('span', 'urgency-banner__countdown');
        groupe.appendChild(countdown);
        a.appendChild(groupe);
      }
      var cta = el('span', 'urgency-banner__cta', (texte(b.bouton) || 'En savoir plus') + ' ');
      var fleche = el('span', 'urgency-banner__cta-arrow', '→');
      fleche.setAttribute('aria-hidden', 'true');
      cta.appendChild(fleche);
      a.appendChild(cta);
      banner.appendChild(a);
      var fermer = el('button', 'urgency-banner__close', '✕');
      fermer.type = 'button';
      fermer.setAttribute('aria-label', 'Fermer ce message');
      banner.appendChild(fermer);
      header.parentNode.insertBefore(banner, header);

      // Le bandeau s'insère après coup et décale tout le contenu vers le bas.
      // Si la page vient d'atterrir sur une ancre (ex : #fiches depuis un
      // article de blog), on recale une fois, sans animation, sur la cible réelle.
      if (window.location.hash) {
        var ancre = document.getElementById(window.location.hash.slice(1));
        if (ancre) {
          var root = document.documentElement;
          var scrollCssAvant = root.style.scrollBehavior;
          root.style.scrollBehavior = 'auto';
          ancre.scrollIntoView({ behavior: 'auto', block: 'start' });
          root.style.scrollBehavior = scrollCssAvant;
        }
      }

      var minuteur = null;
      if (countdown) {
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        var seg = function (n, unit) { return '<span class="urgency-banner__countdown-seg">' + n + '<small>' + unit + '</small></span>'; };
        var sep = '<span class="urgency-banner__countdown-sep">:</span>';
        var maj = function () {
          var diff = echeance - Date.now();
          if (diff <= 0) { clearInterval(minuteur); banner.remove(); return; }
          var d = Math.floor(diff / 86400000);
          var h = Math.floor((diff / 3600000) % 24);
          var m = Math.floor((diff / 60000) % 60);
          var s = Math.floor((diff / 1000) % 60);
          countdown.innerHTML = seg(d, 'j') + sep + seg(pad(h), 'h') + sep + seg(pad(m), 'min') + sep + seg(pad(s), 's');
        };
        maj();
        minuteur = setInterval(maj, 1000);
      }
      fermer.addEventListener('click', function () {
        if (minuteur) clearInterval(minuteur);
        banner.remove();
        ecrireSession(cleFerme);
      });
    }

    function zoneAccueil(h) {
      if (!estAccueil || !h) return;
      var titre = document.querySelector('[data-saison="hero-titre"]');
      if (titre && texte(h.titre)) titre.textContent = h.titre;

      var annonce = document.querySelector('[data-saison="hero-annonce"]');
      if (annonce && texte(h.annonce_texte)) {
        // Une seule ligne sous le titre : icône calendrier, phrase courte, puis le lien principal.
        annonce.textContent = '';
        var ligne = el('p', 'hero__saison-ligne');
        ligne.insertAdjacentHTML('beforeend', '<svg class="hero__saison-icone" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>');
        ligne.appendChild(el('span', null, h.annonce_texte + ' '));
        var liens = (h.annonce_liens || []).filter(function (l) { return l && texte(l.libelle) && lienSur(l.lien); });
        liens.forEach(function (l, i) {
          if (i > 0) ligne.appendChild(document.createTextNode(' '));
          var la = el('a', 'hero__saison-lien', l.libelle + ' →');
          la.href = l.lien;
          ligne.appendChild(la);
        });
        annonce.appendChild(ligne);
        annonce.hidden = false;
      }

      var bouton = document.querySelector('[data-saison="hero-bouton"]');
      if (bouton && h.bouton && texte(h.bouton.libelle) && lienSur(h.bouton.lien)) {
        bouton.textContent = h.bouton.libelle;
        bouton.href = h.bouton.lien;
      }
      var sous = document.querySelector('[data-saison="hero-texte"]');
      if (sous && texte(h.texte_sous_bouton)) sous.textContent = h.texte_sous_bouton;
      // Les mentions propres aux PDF n'ont pas de sens quand l'accueil pousse le stage en direct.
      var reassurance = document.querySelector('[data-saison="hero-reassurance"]');
      if (reassurance && h.masquer_reassurance_pdf === true) reassurance.hidden = true;
    }

    function boutonCollant(c, idPeriode) {
      if (!c || !pageDans(c.pages)) return;
      var barre = document.getElementById('stickyCta');
      if (!barre || !texte(c.titre) || !texte(c.libelle) || !lienSur(c.lien)) return;
      var fort = barre.querySelector('.sticky-cta-bar__text strong');
      var petit = barre.querySelector('.sticky-cta-bar__text small');
      var lien = barre.querySelector('a.btn');
      if (!fort || !lien) return;
      fort.textContent = c.titre;
      if (petit && texte(c.sous_titre)) petit.textContent = c.sous_titre;
      lien.textContent = c.libelle;
      lien.href = c.lien;
      suivreClic(lien, 'clic-bouton-collant', idPeriode);
    }

    fetch('/assets/data/saison.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('saison ' + r.status); return r.json(); })
      .then(function (s) {
        if (!s) return;
        // Une période vaut si elle a un id et une fin pas encore passée, et que son
        // début (facultatif) est atteint. Aucune période en cours : affichage par défaut.
        function enCours(p) {
          if (!p || !texte(p.id) || !texte(p.fin)) return false;
          var fin = new Date(p.fin + 'T23:59:59').getTime();
          var debut = texte(p.debut) ? new Date(p.debut + 'T00:00:00').getTime() : 0;
          var maintenant = Date.now();
          return !isNaN(fin) && !isNaN(debut) && maintenant >= debut && maintenant <= fin;
        }
        var choix = null;
        if (s.periodes && s.periodes.length) {
          for (var i = 0; i < s.periodes.length; i++) {
            var p = s.periodes[i];
            if (p && enCours(p.periode)) { choix = p; break; }
          }
        } else if (enCours(s.periode)) {
          choix = s;
        }
        if (!choix) return;
        var id = choix.periode.id;
        try { bandeau(choix.bandeau, id); } catch (e) {}
        try { zoneAccueil(choix.accueil); } catch (e) {}
        try { boutonCollant(choix.bouton_collant, id); } catch (e) {}
      })
      .catch(function () {});
  })();

  // ----- 5. Exit-intent modal (desktop + mobile, 1× par session, après engagement) -----
  // Conditions cumulées avant déclenchement :
  //   - pas déjà vu cette session
  //   - >= 30 secondes sur la page
  //   - >= 25% scrollé (preuve d'engagement)
  //   - desktop : souris quitte par le haut OU 60 secondes sans interaction
  //   - mobile (pas de mouseleave) : remontée rapide vers le haut (signal d'abandon,
  //     on referme l'onglet ou revient en arrière) OU 60 secondes sans interaction
  var modal = document.getElementById('exitModal');
  var exitShown = false;
  if (modal) {
    try { exitShown = Boolean(sessionStorage.getItem('exitShown')); } catch (_) {}
  }
  if (modal && !exitShown) {
    var triggered = false;
    var pageLoadedAt = Date.now();
    var minTimeMs = 15000;   // 15 s minimum (abaissé le 21/09/2026, C5 : 77% de rebond et 92s de session moyenne empêchaient le seuil de 30s de s'armer pour la majorité du trafic)
    var minScroll = 0.15;    // 15 % de la page (même raison que ci-dessus)
    var estMobile = !window.matchMedia('(min-width: 768px)').matches;

    function hasEngaged() {
      var elapsed = Date.now() - pageLoadedAt;
      if (elapsed < minTimeMs) return false;
      // Vague 4.10 : jamais deux sollicitations en même temps. Le cookie-banner
      // (z-index 900) passe au-dessus de la modale exit-intent (z-index 100) et
      // la rendait confuse si les deux étaient visibles ensemble.
      var banner = document.querySelector('.cookie-banner');
      if (banner && banner.classList.contains('cookie-banner--visible')) return false;
      // Chantier 5.12 (panier) : même logique, jamais l'exit-intent par-dessus le panier ouvert.
      var panierOuvert = document.getElementById('tjdPanierBackdrop');
      if (panierOuvert && panierOuvert.classList.contains('open')) return false;
      var scrollRatio = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      return scrollRatio >= minScroll;
    }

    function fireModal() {
      if (triggered) return;
      triggered = true;
      modal.classList.add('open');
      try { sessionStorage.setItem('exitShown', '1'); } catch (_) {}
    }

    function onMouseLeave(e) {
      if (e.clientY <= 0 && hasEngaged()) fireModal();
    }

    if (estMobile) {
      // Pas de mouseleave sur tactile : une remontée rapide et ample vers le haut
      // de l'écran est le signal le plus proche d'une intention de quitter la page.
      var dernierScrollY = window.scrollY;
      window.addEventListener('scroll', function () {
        var delta = dernierScrollY - window.scrollY;
        dernierScrollY = window.scrollY;
        if (delta > 150 && hasEngaged()) fireModal();
      }, { passive: true });
    } else {
      document.addEventListener('mouseleave', onMouseLeave);
    }

    // Fallback commun desktop/mobile : si le visiteur reste 60 sec sans déclencher
    // le signal ci-dessus, on affiche quand même la modale (page de lecture longue).
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
    // Sur desktop : sync aria-expanded au hover, avec un délai avant fermeture
    // (hover-intent). Sans ce délai, un mouvement de souris en diagonale vers
    // un élément éloigné du menu (ex. le pilier L3, le plus à droite) peut
    // sortir un instant de la zone survolée et fermer le menu avant le clic.
    item.addEventListener('mouseenter', function () {
      clearTimeout(item._closeTimer);
      link.setAttribute('aria-expanded', 'true');
      item.classList.add('open');
    });
    item.addEventListener('mouseleave', function () {
      link.setAttribute('aria-expanded', 'false');
      item._closeTimer = setTimeout(function () { item.classList.remove('open'); }, 300);
    });
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

  // ----- 6. Filtres catalogue (chips + recherche texte) -----
  var filtersRoot = document.querySelector('[data-filters]');
  if (filtersRoot) {
    var grid = document.querySelector('[data-filter-grid]');
    var state = { niveau: 'tous', matiere: 'tous', recherche: '' };

    function appliquerFiltres() {
      if (!grid) return;
      grid.querySelectorAll('[data-niveau]').forEach(function (card) {
        var matchN = state.niveau === 'tous' || card.getAttribute('data-niveau').split(',').indexOf(state.niveau) !== -1;
        var matchM = state.matiere === 'tous' || card.getAttribute('data-matiere').split(',').indexOf(state.matiere) !== -1;
        var matchR = !state.recherche || card.textContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').indexOf(state.recherche) !== -1;
        card.hidden = !(matchN && matchM && matchR);
      });
    }
    // Exposée pour que le filtre de recherche texte (filtre-recherche.js) partage le même état
    // que les chips, plutôt que d'écraser leur résultat en manipulant `hidden` séparément.
    window.tjdAppliquerFiltreRecherche = function (terme) {
      state.recherche = terme;
      appliquerFiltres();
    };

    filtersRoot.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var group = chip.getAttribute('data-group');
        var value = chip.getAttribute('data-value');
        state[group] = value;
        // Toggle active in same group
        filtersRoot.querySelectorAll('.filter-chip[data-group="' + group + '"]').forEach(function (c) {
          c.classList.toggle('active', c === chip);
        });
        appliquerFiltres();
      });
    });

    // Ancres #cours-l1 / #cours-l2 / #cours-l3 (méga-menu "Fiches" du header) :
    // le lien pointe vers formations.html#cours-lX, mais aucun élément ne porte
    // cet id. On active donc le filtre niveau correspondant et on scrolle
    // jusqu'au catalogue, comme si le chip L1/L2/L3 avait été cliqué à la main.
    var niveauDepuisHash = { 'cours-l1': 'L1', 'cours-l2': 'L2', 'cours-l3': 'L3' };
    function appliquerNiveauDepuisHash() {
      var niveau = niveauDepuisHash[window.location.hash.replace('#', '')];
      if (!niveau) return;
      var chip = filtersRoot.querySelector('.filter-chip[data-group="niveau"][data-value="' + niveau + '"]');
      if (!chip) return;
      chip.click();
      var cible = document.getElementById('a-l-unite');
      if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    appliquerNiveauDepuisHash();
    window.addEventListener('hashchange', appliquerNiveauDepuisHash);
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

  // ----- 9. Newsletter : inscription envoyée vers Brevo -----
  // Intercepte les formulaires dont l'action pointe vers Brevo (sibforms.com) et
  // poste l'email vers /api/lead (même origine que le site), qui appelle Brevo
  // côté serveur. Corrige le 12/07/2026 : l'ancien code postait en direct vers
  // sibforms.com depuis le navigateur (fetch cross-origin), un flux qu'un
  // bloqueur de pub interrompt silencieusement (domaine de marketing email),
  // et la moindre erreur réseau ou réponse non-JSON tombait dans le .catch()
  // qui redirigeait quand même vers merci.html : le visiteur voyait un succès
  // même quand rien n'était jamais arrivé jusqu'à Brevo. Passer par notre propre
  // domaine élimine le blocage et permet de distinguer un vrai échec.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.action || form.action.indexOf('sibforms.com') === -1) return;
    e.preventDefault();
    var emailInput = form.querySelector('input[type="email"], input[name="email"], input[name="EMAIL"]');
    var email = emailInput ? emailInput.value.trim() : '';
    if (!email) { if (emailInput) emailInput.focus(); return; }
    var btn = form.querySelector('button[type="submit"], button:not([type])');
    if (btn) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Inscription…'; }
    // Source par page (au lieu d'un "newsletter-site" identique partout), pour
    // savoir dans Brevo quelle page capture vraiment des leads.
    var pageActuelle = window.location.pathname.split('/').pop().replace('.html', '') || 'accueil';
    function trackLead() {
      // L'inscription est déjà enregistrée. Une mesure refusée conserve donc
      // la confirmation et le téléchargement prévus pour le visiteur.
      try {
        if (localStorage.getItem('tjd_consent') === 'granted' && typeof window.fbq === 'function') fbq('track', 'Lead');
      } catch (_) {}
      try { if (typeof window.gtag === 'function') gtag('event', 'generate_lead', { source: pageActuelle }); } catch (_) {}
      try { if (window._paq) window._paq.push(['trackEvent', 'Lead', 'Inscription', pageActuelle]); } catch (_) {}
    }
    function echec() {
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.label || 'S’inscrire'; }
      alert('Ton inscription n’a pas pu être enregistrée. Réessaie dans un instant, ou écris-moi directement à contact@trajectoiredroit.com.');
    }
    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'newsletter-' + pageActuelle })
    })
      .then(function (r) {
        if (!r.ok) { echec(); return; }
        trackLead();
        window.location.href = '/merci.html';
      })
      .catch(echec);
  }, true);

})();
