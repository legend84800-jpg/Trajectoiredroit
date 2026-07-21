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

/* ----- RECHERCHE SITE-WIDE -----
   Index statique (pas de backend de recherche), injecté sur toutes les pages
   via main.js pour ne pas éditer 75 fichiers. Bouton loupe dans le header,
   recherche instantanée par titre/mots-clés. */
(function () {
  var INDEX = [
    { t: 'Accueil', u: 'index.html', c: 'Page' },
    { t: 'Catalogue des fiches complètes, L1 L2 L3', u: 'formations.html', c: 'Produit' },
    { t: 'Meilleures ventes', u: 'top-ventes.html', c: 'Produit' },
    { t: 'Majeures préparées', u: 'majeures-preparees.html', c: 'Produit' },
    { t: 'Cours particuliers de droit en visio', u: 'cours-particuliers.html', c: 'Produit' },
    { t: 'Stage de méthode en direct', u: 'stage-methode.html', c: 'Produit' },
    { t: 'Introduction au droit L1', u: 'introduction-au-droit-l1.html', c: 'Matière' },
    { t: 'Droit constitutionnel L1', u: 'droit-constitutionnel-l1.html', c: 'Matière' },
    { t: 'Droit des personnes L1', u: 'droit-des-personnes-l1.html', c: 'Matière' },
    { t: 'Droit de la famille L1', u: 'droit-de-la-famille-l1.html', c: 'Matière' },
    { t: 'Droit pénal général L1', u: 'droit-penal-general-l1.html', c: 'Matière' },
    { t: 'Histoire du droit L1', u: 'histoire-du-droit-l1.html', c: 'Matière' },
    { t: 'Histoire des institutions L1', u: 'histoire-des-institutions-l1.html', c: 'Matière' },
    { t: 'Relations internationales L1', u: 'relations-internationales-l1.html', c: 'Matière' },
    { t: 'Droit administratif L2', u: 'droit-administratif-l2.html', c: 'Matière' },
    { t: 'Droit des contrats L2', u: 'droit-des-contrats-l2.html', c: 'Matière' },
    { t: 'Droit des obligations L2', u: 'droit-des-obligations-l2.html', c: 'Matière' },
    { t: 'Droit des biens L2', u: 'droit-des-biens-l2.html', c: 'Matière' },
    { t: 'Droit pénal L2', u: 'droit-penal-l2.html', c: 'Matière' },
    { t: 'Droit commercial L3', u: 'droit-commercial-l3.html', c: 'Matière' },
    { t: 'Droit des sociétés L3', u: 'droit-des-societes-l3.html', c: 'Matière' },
    { t: 'Droit du travail L3', u: 'droit-du-travail-l3.html', c: 'Matière' },
    { t: 'Contrats spéciaux L3', u: 'contrats-speciaux-l3.html', c: 'Matière' },
    { t: 'Procédure pénale L3', u: 'procedure-penale-l3.html', c: 'Matière' },
    { t: 'Méthode du cas pratique', u: 'methode-cas-pratique.html', c: 'Méthode' },
    { t: "Méthode du commentaire d'arrêt", u: 'methode-commentaire-arret.html', c: 'Méthode' },
    { t: 'Méthode de la dissertation juridique', u: 'methode-dissertation-juridique.html', c: 'Méthode' },
    { t: "Méthode de la fiche d'arrêt", u: 'methode-fiche-arret.html', c: 'Méthode' },
    { t: 'Correcteur IA gratuit (fiche, commentaire, cas pratique, dissert)', u: 'outil-fiche-arret.html', c: 'Outil gratuit' },
    { t: 'Quiz : teste ta méthode', u: 'quiz-methode.html', c: 'Outil gratuit' },
    { t: 'Quiz : quel métier du droit te correspond ?', u: 'quiz-metier-droit.html', c: 'Outil gratuit' },
    { t: 'Toutes les ressources gratuites', u: 'ressources-gratuites.html', c: 'Outil gratuit' },
    { t: 'Arrêt Blanco expliqué', u: 'arret-blanco-explique.html', c: 'Arrêt expliqué' },
    { t: 'Arrêt Benjamin expliqué', u: 'arret-benjamin-explique.html', c: 'Arrêt expliqué' },
    { t: 'Arrêt Cadot expliqué', u: 'arret-cadot-explique.html', c: 'Arrêt expliqué' },
    { t: 'Arrêt Dame Lamotte expliqué', u: 'arret-dame-lamotte-explique.html', c: 'Arrêt expliqué' },
    { t: "Arrêt Bac d'Eloka expliqué", u: 'arret-bac-eloka-explique.html', c: 'Arrêt expliqué' },
    { t: 'Arrêt GISTI 1978 expliqué', u: 'arret-gisti-1978-explique.html', c: 'Arrêt expliqué' },
    { t: 'Arrêt Nicolo expliqué', u: 'arret-nicolo-explique.html', c: 'Arrêt expliqué' },
    { t: 'Arrêt Nikon expliqué', u: 'arret-nikon.html', c: 'Arrêt expliqué' },
    { t: "Bibliothèque des arrêts expliqués", u: 'arrets-expliques.html', c: 'Page' },
    { t: "Commentaire d'arrêt corrigé : Blieck (1991)", u: 'commentaire-arret-blieck-1991-corrige.html', c: 'Corrigé' },
    { t: "Commentaire d'arrêt corrigé : Clément-Bayard", u: 'commentaire-arret-clement-bayard-corrige.html', c: 'Corrigé' },
    { t: "Commentaire d'arrêt corrigé : Odièvre (2003)", u: 'commentaire-arret-odievre-2003-corrige.html', c: 'Corrigé' },
    { t: "Commentaire d'arrêt corrigé : Uber (2020)", u: 'commentaire-arret-uber-2020-corrige.html', c: 'Corrigé' },
    { t: 'Dissertation corrigée : droit et morale', u: 'dissertation-droit-et-morale-corrige.html', c: 'Corrigé' },
    { t: 'Dissertation corrigée : fonctions de la responsabilité civile', u: 'dissertation-fonctions-responsabilite-civile-corrige.html', c: 'Corrigé' },
    { t: 'Dissertation corrigée : la séparation des pouvoirs', u: 'dissertation-separation-des-pouvoirs-corrige.html', c: 'Corrigé' },
    { t: 'Cas pratique corrigé : droit civil L1, la loi dans le temps', u: 'cas-pratique-corrige-droit-civil-l1.html', c: 'Corrigé' },
    { t: 'Cas pratique corrigé : dol et réticence dolosive', u: 'cas-pratique-dol-reticence-dolosive-corrige.html', c: 'Corrigé' },
    { t: 'Cas pratique corrigé : la légitime défense', u: 'cas-pratique-legitime-defense-corrige.html', c: 'Corrigé' },
    { t: 'Cas pratique corrigé : responsabilité sans faute', u: 'cas-pratique-responsabilite-sans-faute-corrige.html', c: 'Corrigé' },
    { t: 'Annales corrigées de droit civil L1', u: 'annales-corrigees-droit-civil-l1.html', c: 'Corrigé' },
    { t: "Galop d'essai en droit, méthode et exemple corrigé", u: 'galop-d-essai-droit.html', c: 'Corrigé' },
    { t: 'La clause pénale, article 1231-5', u: 'clause-penale-contrat-article-1231-5.html', c: 'Notion' },
    { t: 'Comment réviser le droit administratif L2', u: 'comment-reviser-le-droit-administratif-l2.html', c: 'Notion' },
    { t: 'Différence contravention, délit et crime', u: 'contravention-delit-crime.html', c: 'Notion' },
    { t: 'La force majeure, article 1218', u: 'force-majeure-contrat-article-1218.html', c: 'Notion' },
    { t: 'La cause en droit des contrats', u: 'la-cause-en-droit.html', c: 'Notion' },
    { t: 'La faute civile en droit des obligations', u: 'la-faute-civile-droit-des-obligations.html', c: 'Notion' },
    { t: 'La hiérarchie des normes, la pyramide de Kelsen', u: 'la-hierarchie-des-normes.html', c: 'Notion' },
    { t: 'Les vices du consentement : erreur, dol, violence', u: 'les-vices-du-consentement.html', c: 'Notion' },
    { t: 'La notion de service public', u: 'notion-service-public-droit-administratif.html', c: 'Notion' },
    { t: 'Obligation de moyen ou de résultat', u: 'obligation-de-moyen-et-de-resultat.html', c: 'Notion' },
    { t: "Le recours pour excès de pouvoir", u: 'recours-exces-de-pouvoir-droit-administratif.html', c: 'Notion' },
    { t: 'Responsabilité civile L2', u: 'responsabilite-civile-l2.html', c: 'Notion' },
    { t: 'Fiche de révision droit administratif L2', u: 'fiche-revision-droit-administratif-l2.html', c: 'Notion' },
    { t: "Méthode de la fiche d'arrêt (exemples rédigés)", u: 'fiche-arrets.html', c: 'Méthode' },
    { t: 'Témoignages, 149 avis 5/5', u: 'temoignages.html', c: 'Page' },
    { t: 'FAQ', u: 'faq.html', c: 'Page' },
    { t: 'À propos de Julien', u: 'a-propos.html', c: 'Page' },
    { t: 'Le blog du droit', u: 'blog.html', c: 'Page' }
  ];

  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function buildUI() {
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'search-trigger';
    trigger.setAttribute('aria-label', 'Rechercher sur le site');
    trigger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    var host = document.querySelector('.site-header__cta');
    if (host) host.insertBefore(trigger, host.firstChild);

    var overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Recherche');
    overlay.innerHTML =
      '<div class="search-panel">' +
      '<div class="search-panel__head">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input type="text" class="search-panel__input" placeholder="Cherche parmi 70+ matières, arrêts et corrigés…" aria-label="Rechercher">' +
      '<button type="button" class="search-panel__close" aria-label="Fermer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5L19 19"/><path d="M19 5L5 19"/></svg></button>' +
      '</div>' +
      '<div class="search-panel__results" id="searchResults"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var input = overlay.querySelector('.search-panel__input');
    var results = overlay.querySelector('#searchResults');
    var closeBtn = overlay.querySelector('.search-panel__close');

    function render(items, query) {
      if (!query) { results.innerHTML = ''; return; }
      if (!items.length) {
        results.innerHTML = '<p class="search-panel__empty">Rien ne correspond à « ' + query.replace(/</g, '&lt;') + ' ». Essaie le nom d’une matière ou d’un arrêt.</p>';
        return;
      }
      results.innerHTML = items.slice(0, 12).map(function (item) {
        return '<a class="search-result" href="' + item.u + '">' +
          '<span class="search-result__cat">' + item.c + '</span>' +
          '<span class="search-result__title">' + item.t + '</span>' +
          '</a>';
      }).join('');
    }

    function search(query) {
      var q = normalize(query);
      if (!q) return [];
      return INDEX.filter(function (item) { return normalize(item.t).indexOf(q) !== -1 || normalize(item.c).indexOf(q) !== -1; });
    }

    function open() {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      input.value = '';
      results.innerHTML = '';
      setTimeout(function () { input.focus(); }, 50);
    }
    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    trigger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !overlay.classList.contains('open') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        open();
      }
    });
    input.addEventListener('input', function () { render(search(input.value), input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = results.querySelector('.search-result');
        if (first) window.location.href = first.getAttribute('href');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
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
    modal.innerHTML =
      '<div class="apercu-panel">' +
      '<div class="apercu-head">' +
      '<div><h3 id="apercuTitle"></h3><p>Extraits réels de la fiche complète</p></div>' +
      '<button class="apercu-close" data-apercu-close aria-label="Fermer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5L19 19"/><path d="M19 5L5 19"/></svg></button>' +
      '</div>' +
      '<div class="apercu-imgs" id="apercuImgs"></div>' +
      '<div class="apercu-foot">' +
      '<span class="price" id="apercuPrice"></span>' +
      '<a class="btn btn--primary" id="apercuCta" href="#" target="_blank" rel="noopener">Acheter la fiche</a>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);

    var imgsBox = document.getElementById('apercuImgs');

    function open(btn) {
      var imgs;
      try { imgs = JSON.parse(btn.getAttribute('data-apercu') || '[]'); } catch (e) { imgs = []; }
      document.getElementById('apercuTitle').textContent = btn.getAttribute('data-apercu-title') || 'Aperçu';
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
      imgs.forEach(function (src) {
        var im = document.createElement('img');
        im.src = src; im.loading = 'lazy'; im.alt = 'Extrait de la fiche';
        imgsBox.appendChild(im);
      });
      imgsBox.scrollTop = 0;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (window.gtag) gtag('event', 'apercu_open', { matiere: btn.getAttribute('data-apercu-title') || '' });
    }
    function close() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
    triggers.forEach(function (b) { b.addEventListener('click', function () { open(b); }); });
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.hasAttribute('data-apercu-close')) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
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
  }

  // ----- 4. Urgency banner : stage de droit pré-rentrée -----
  // Construit en JS, comme le skip-link et la recherche plus haut, pour ne pas
  // coller ce bloc dans les 138 pages HTML. Compte à rebours réel vers la
  // clôture des inscriptions (27 août, cf. la FAQ de stage-methode.html) :
  // jamais un faux compte à rebours qui repart à chaque visite. Masqué sur la
  // page du stage elle-même, déjà entièrement consacrée à cette offre.
  (function () {
    var header = document.querySelector('.site-header');
    if (!header || sessionStorage.getItem('urgencyDismissed')) return;
    if (/stage-methode\.html/.test(window.location.pathname)) return;

    var DEADLINE = new Date('2026-08-27T00:00:00').getTime();
    if (Date.now() >= DEADLINE) return;

    var banner = document.createElement('div');
    banner.className = 'urgency-banner';
    banner.id = 'urgencyBanner';
    banner.innerHTML =
      '<a class="urgency-banner__link" href="stage-methode.html#reserver">' +
        '<span class="urgency-banner__dot" aria-hidden="true"></span>' +
        '<span class="urgency-banner__label"><span class="urgency-banner__label-strong">Stage de droit</span>, pré-rentrée</span>' +
        '<span class="urgency-banner__chip">du 8 au 10 septembre &middot; 15 places</span>' +
        '<span class="urgency-banner__countdown-group">' +
          '<span class="urgency-banner__countdown-label">Ferme dans</span>' +
          '<span class="urgency-banner__countdown" id="urgencyCountdown"></span>' +
        '</span>' +
        '<span class="urgency-banner__cta">Réserver ma place <span class="urgency-banner__cta-arrow" aria-hidden="true">→</span></span>' +
      '</a>' +
      '<button type="button" class="urgency-banner__close" aria-label="Fermer ce message" data-close-urgency>✕</button>';
    header.parentNode.insertBefore(banner, header);

    // Décompte automatique réel (jour/heure/min/sec, tique chaque seconde),
    // toujours vers la même échéance DEADLINE ci-dessus, jamais un faux
    // compte à rebours qui repart à chaque visite.
    var countdown = document.getElementById('urgencyCountdown');
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var seg = function (n, unit) { return '<span class="urgency-banner__countdown-seg">' + n + '<small>' + unit + '</small></span>'; };
    var sep = '<span class="urgency-banner__countdown-sep">:</span>';
    var update = function () {
      var diff = DEADLINE - Date.now();
      if (diff <= 0) { banner.remove(); return; }
      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff / 3600000) % 24);
      var m = Math.floor((diff / 60000) % 60);
      var s = Math.floor((diff / 1000) % 60);
      countdown.innerHTML = seg(d, 'j') + sep + seg(pad(h), 'h') + sep + seg(pad(m), 'min') + sep + seg(pad(s), 's');
    };
    update();
    var urgencyTimer = setInterval(update, 1000);

    banner.querySelector('[data-close-urgency]').addEventListener('click', function () {
      clearInterval(urgencyTimer);
      banner.remove();
      sessionStorage.setItem('urgencyDismissed', '1');
    });
  })();

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

  // ----- 7c. Carte "Stage en direct" : décompte (desktop + mobile) + accordéon desktop -----
  // Même échéance que la bannière d'urgence (27 août, cf. FAQ stage-methode.html)
  var stageCountdownEls = document.querySelectorAll('.stage-teaser__countdown');
  if (stageCountdownEls.length) {
    var stageDays = Math.floor((new Date('2026-08-27T00:00:00').getTime() - Date.now()) / 86400000);
    var stageCountdownText = stageDays >= 1
      ? 'Ferme dans ' + stageDays + ' jour' + (stageDays > 1 ? 's' : '')
      : 'Dernier jour';
    stageCountdownEls.forEach(function (el) { el.textContent = stageCountdownText; });
  }
  var stageTeaser = document.querySelector('.stage-teaser__trigger');
  if (stageTeaser) {
    var stagePanel = document.getElementById(stageTeaser.getAttribute('aria-controls'));
    if (stagePanel) {
      stageTeaser.addEventListener('click', function (e) {
        e.preventDefault();
        var open = stagePanel.classList.toggle('is-open');
        stageTeaser.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

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
    function trackLead() {
      if (localStorage.getItem('tjd_consent') === 'granted' && typeof window.fbq === 'function') {
        fbq('track', 'Lead');
      }
    }
    function echec() {
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.label || 'S’inscrire'; }
      alert('Ton inscription n’a pas pu être enregistrée. Réessaie dans un instant, ou écris-moi directement à contact@trajectoiredroit.com.');
    }
    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'newsletter-site' })
    })
      .then(function (r) {
        if (!r.ok) { echec(); return; }
        trackLead();
        window.location.href = '/merci.html';
      })
      .catch(echec);
  }, true);

})();
