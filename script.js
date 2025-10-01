/* =========================================================
   LINCISIF — script.js (édition minimaliste, robuste, performante)
   ---------------------------------------------------------------
   ✅ Ce fichier ne dépend d'aucune lib externe (zéro Lottie)
   ✅ Respecte prefers-reduced-motion et évite les reflows inutiles
   ✅ Fonctionne sur TOUTES les pages (éléments optionnels = no-op)
   ✅ Inline comments pour les parties plus techniques
   ========================================================= */
(function () {
  "use strict";

  /* -------------------------------------------------------
   * Helpers utilitaires (sans optional chaining)
   * ----------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  // Détection d'accessibilité (motion)
  var REDUCE_MOTION = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || false;

  // Throttle basé sur requestAnimationFrame
  // 👉 Assure 1 exécution / frame max, parfait pour scroll/resize
  function rafThrottle(fn) {
    var ticking = false;
    return function () {
      if (ticking) return; // on ignore si une frame est déjà planifiée
      var args = arguments;
      window.requestAnimationFrame(function () {
        ticking = false;
        try { fn.apply(null, args); } catch (_) {}
      });
      ticking = true;
    };
  }

  // Récupère la hauteur de la navbar sticky pour compenser les ancres
  function getStickyNavOffset() {
    var nav = $(".nav-wrap .navbar") || $(".navbar");
    // +10px d'air pour ne pas coller le titre sous la barre
    return nav ? (nav.getBoundingClientRect().height + 10) : 0;
  }

  /* -------------------------------------------------------
   * Apparitions (reveal/fade-in)
   * ----------------------------------------------------- */
  function setupReveal() {
    var elsReveal = $$(".reveal"); // nouveau thème
    var elsFade = $$(".fade-in");  // rétro-compatibilité

    // Fallback vieux navigateurs : on rend tout visible
    if (!("IntersectionObserver" in window)) {
      elsReveal.forEach(function (el) { el.classList.add("in"); });
      elsFade.forEach(function (el) { el.classList.add("visible"); });
      return;
    }

    // Un IO par type (meilleure lisibilité + possibilité d'évoluer)
    var ioReveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          ioReveal.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });

    var ioFade = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          ioFade.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });

    elsReveal.forEach(function (el) { ioReveal.observe(el); });
    elsFade.forEach(function (el) { ioFade.observe(el); });
  }

  /* -------------------------------------------------------
   * Champ d'étoiles (Canvas) — pure déco, respecte l'accessibilité
   * ----------------------------------------------------- */
  function setupStarfield() {
    if (REDUCE_MOTION) return;         // on n'anime pas si l'utilisateur l'a demandé
    var canvas = $("#starfield");
    if (!canvas) return;               // la page peut ne pas inclure de canvas

    var ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;                  // très rare, mais on reste défensif

    var W = 0, H = 0, stars = [], rafId = 0;

    // (1) Recalcule la densité du champ à chaque resize
    function resize() {
      try {
        var ratio = Math.min(window.devicePixelRatio || 1, 2); // plafonné pour perfs
        W = canvas.width  = Math.floor(window.innerWidth  * ratio);
        H = canvas.height = Math.floor(window.innerHeight * ratio);
        canvas.style.width  = window.innerWidth  + "px";
        canvas.style.height = window.innerHeight + "px";

        // Densité proportionnelle à l'aire du viewport
        var COUNT = Math.round((window.innerWidth * window.innerHeight) / 1600);
        var N = clamp(COUNT, 300, 1100); // léger ajustement (moins dense que la version précédente)

        stars = [];
        for (var i = 0; i < N; i++) {
          stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.2 + 0.2,    // rayon de base
            s: Math.random() * 0.6 + 0.4,    // vitesse du twinkle
            p: Math.random() * Math.PI * 2   // phase initiale
          });
        }
        cancelAnimationFrame(rafId);
        draw(0); // nouvelle frame sur la nouvelle taille
      } catch (_) {
        // Si jamais un device exotique remonte une erreur :
        window.removeEventListener("resize", onResize);
      }
    }

    // (2) Boucle de rendu — effet de twinkle léger (sinus)
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter"; // mélange additif = halos plus doux

      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        var tw = 0.6 + 0.4 * Math.sin(st.p + t * 0.0013 * st.s); // 0.0013 = vitesse globale
        var r = st.r * tw;
        ctx.fillStyle = "rgba(249,251,255," + (0.50 + 0.50 * tw) + ")";
        ctx.beginPath();
        ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(draw);
    }

    // (3) Pause/reprise si l'onglet n'est plus visible
    function onVisibility() {
      if (document.hidden) cancelAnimationFrame(rafId);
      else draw(0);
    }

    var onResize = rafThrottle(resize);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    resize(); // premier calcul
  }

  /* -------------------------------------------------------
   * Parallaxe de la nébuleuse (défilement)
   * ----------------------------------------------------- */
  function setupNebulaParallax() {
    if (REDUCE_MOTION) return;
    var nebula = $(".bg-nebula");
    if (!nebula) return;

    // 👉 on calcule seulement une valeur Y et on l'applique aux couches
    var onScroll = rafThrottle(function () {
      var y = window.scrollY || window.pageYOffset || 0;
      nebula.style.backgroundPosition =
        "0 " + (-y * 0.05) + "px, " +
        "0 " + (-y * 0.03) + "px, " +
        "0 " + (-y * 0.02) + "px, 0 0, 0 0"; // garde les dernières couches fixes
    });

    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* -------------------------------------------------------
   * Scroll doux + correction d'offset (navbar sticky)
   * ----------------------------------------------------- */
  function setupSmoothAnchors() {
    var links = $$('a[href^="#"]:not([href="#"])');
    if (!links.length) return;

    function supportsSmoothScroll() { return ("scrollBehavior" in document.documentElement.style); }

    function smoothScrollTo(targetY) {
      if (REDUCE_MOTION || !supportsSmoothScroll()) {
        window.scrollTo(0, targetY);
      } else {
        window.scrollTo({ top: targetY, behavior: "smooth" });
      }
    }

    function scrollToHash(hash) {
      try {
        if (!hash || hash === "#") return;
        var id = hash.slice(1);
        var target = document.getElementById(id);
        if (!target) return;

        // Calcul de la position absolue + correction sticky
        var rect = target.getBoundingClientRect();
        var top = rect.top + (window.scrollY || window.pageYOffset || 0);
        var offset = getStickyNavOffset();
        var finalY = Math.max(0, top - offset);
        smoothScrollTo(finalY);

        // Accessibilité : place le focus pour les lecteurs d'écran/clavier
        // sans laisser de tab-stop persistant
        target.setAttribute("tabindex", "-1");
        target.addEventListener("blur", function cleanup() { target.removeAttribute("tabindex"); target.removeEventListener("blur", cleanup); });
        target.focus({ preventScroll: true });
      } catch (_) {}
    }

    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var href = a.getAttribute("href");
        if (!href || href.charAt(0) !== "#") return; // liens absolus ignorés
        e.preventDefault();
        scrollToHash(href);
        try { history.pushState(null, "", href); } catch (_) { location.hash = href; }
      });
    });

    // Si la page arrive déjà avec un hash (#section)
    if (location.hash) {
      setTimeout(function () { scrollToHash(location.hash); }, 0);
    }
  }

  /* -------------------------------------------------------
   * ScrollSpy (lien actif dans la navbar)
   * ----------------------------------------------------- */
  function setupScrollSpy() {
    var nav = $(".nav-wrap .navbar") || $(".navbar");
    if (!nav || !("IntersectionObserver" in window)) return;

    // On ne garde que les liens ancrés qui pointent vers des ids existants
    var anchors = $$('a[href^="#"]', nav).filter(function (a) {
      var href = a.getAttribute("href");
      return href && href !== "#" && $(href) != null;
    });
    if (!anchors.length) return;

    var sections = anchors.map(function (a) { return $(a.getAttribute("href")); });

    function setActive(id) {
      anchors.forEach(function (a) {
        var isActive = a.getAttribute("href") === ("#" + id);
        a.classList.toggle("active", !!isActive);
        a.setAttribute("aria-current", isActive ? "true" : "false");
      });
    }

    var io = new IntersectionObserver(function (entries) {
      // On choisit la section la plus visible
      entries.sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
      var vis = entries[0];
      if (vis && vis.isIntersecting && vis.target.id) setActive(vis.target.id);
    }, {
      rootMargin: "-" + (getStickyNavOffset() + 10) + "px 0px -55% 0px",
      threshold: [0.1, 0.6, 0.98]
    });

    sections.forEach(function (sec) { if (sec) io.observe(sec); });
  }

  /* -------------------------------------------------------
   * Micro-interaction : halo qui suit le pointeur sur les CTA
   * ----------------------------------------------------- */
  function setupCtaPointerGlow() {
    var ctas = $$(".cta, .button"); // .button = rétro-compatibilité
    if (!ctas.length) return;

    function onMove(e) {
      var t = e.currentTarget;
      var r = t.getBoundingClientRect();
      t.style.setProperty("--px", (e.clientX - r.left) + "px");
      t.style.setProperty("--py", (e.clientY - r.top) + "px");
    }

    ctas.forEach(function (btn) {
      btn.addEventListener("pointermove", onMove, { passive: true });
      btn.addEventListener("pointerleave", function () {
        btn.style.removeProperty("--px");
        btn.style.removeProperty("--py");
      });
    });
  }

  /* -------------------------------------------------------
   * Formulaire de contact — mode démo (toast de confirmation)
   * ----------------------------------------------------- */
  function setupForm() {
    // On cible d'abord le formulaire explicite, sinon le premier <form>
    var form = $("form[aria-label^='Formulaire de contact']") || $("form[aria-label*='contact']") || $("form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      // Soumission réelle si action non vide et différent de '#'
      var action = (form.getAttribute("action") || "").trim();
      var isDemo = action === "" || action === "#";
      if (!isDemo) return; // laisser le backend gérer

      e.preventDefault();
      // Valeur de politesse personnalisée si le champ nom est présent
      var nameInput = $("#name", form);
      var name = (nameInput && nameInput.value && nameInput.value.trim()) || "Merci";
      showToast(name + ", ton message a bien été envoyé ✨");
      try { form.reset(); } catch (_) {}
    });

    // Petit composant Toast accessible (role=status) réutilisable
    function showToast(text) {
      var toast = document.createElement("div");
      toast.setAttribute("role", "status");
      toast.textContent = text || "Envoyé !";
      // Styles inlined pour éviter d'alourdir le CSS global
      toast.style.position = "fixed";
      toast.style.left = "50%";
      toast.style.bottom = "24px";
      toast.style.transform = "translateX(-50%)";
      toast.style.background = "rgba(10,19,38,.92)";
      toast.style.color = "#fff";
      toast.style.padding = "12px 16px";
      toast.style.borderRadius = "12px";
      toast.style.border = "1px solid rgba(255,255,255,.18)";
      toast.style.boxShadow = "0 10px 30px rgba(0,0,0,.28)";
      toast.style.zIndex = "1000";
      toast.style.opacity = "0";
      toast.style.transition = "opacity .25s ease, transform .25s ease";
      toast.style.backdropFilter = "blur(6px)";
      toast.style.webkitBackdropFilter = "blur(6px)";
      document.body.appendChild(toast);

      // apparition (1 frame plus tard pour déclencher la transition)
      requestAnimationFrame(function () {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(-6px)";
      });

      // disparition + cleanup
      setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(0)";
        setTimeout(function () { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); }, 260);
      }, 2200);
    }
  }

  /* -------------------------------------------------------
   * Initialisation
   * ----------------------------------------------------- */
  function init() {
    try { setupReveal(); } catch (_) {}
    try { setupStarfield(); } catch (_) {}
    try { setupNebulaParallax(); } catch (_) {}
    try { setupSmoothAnchors(); } catch (_) {}
    try { setupScrollSpy(); } catch (_) {}
    try { setupCtaPointerGlow(); } catch (_) {}
    try { setupForm(); } catch (_) {}
  }

  // On s'assure d'initialiser au bon moment, même si le script est injecté tard
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
