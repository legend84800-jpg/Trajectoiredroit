/* Intégration paiement TJD (Stripe). Gère tous les boutons [data-tjd-produit] du site. */
(function () {
  var TEXTES_ORIGINAUX = {};

  function lireCookie(nom) {
    var m = document.cookie.match('(?:^|; )' + nom + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function tjdAcheter(produitId, btnEl) {
    if (!btnEl) btnEl = document.querySelector('[data-tjd-produit="' + produitId + '"]');
    if (!btnEl) return;
    var idx = produitId + '-' + Array.from(document.querySelectorAll('[data-tjd-produit="' + produitId + '"]')).indexOf(btnEl);
    TEXTES_ORIGINAUX[idx] = TEXTES_ORIGINAUX[idx] || btnEl.textContent.trim();

    // Order bump : si le bouton référence une checkbox cochée, on ajoute ce produit à la même session.
    var bumpId = btnEl.getAttribute('data-tjd-bump');
    var bumpCheckboxId = btnEl.getAttribute('data-tjd-bump-checkbox');
    var bumpCheckbox = bumpCheckboxId ? document.getElementById(bumpCheckboxId) : null;
    var bumpActif = !!(bumpId && bumpCheckbox && bumpCheckbox.checked);

    // Identifiants Meta transmis uniquement si le visiteur a accepté les cookies,
    // pour permettre à l'API Conversions de recouper l'achat avec le pixel côté serveur.
    var corps = bumpActif ? { produitId: produitId, bumpId: bumpId } : { produitId: produitId };
    if (localStorage.getItem('tjd_consent') === 'granted') {
      var fbp = lireCookie('_fbp');
      var fbc = lireCookie('_fbc');
      if (fbp) corps.fbp = fbp;
      if (fbc) corps.fbc = fbc;
      corps.consentMarketing = true;
    }

    // Attribution capturée par main.js à la première page vue de la session,
    // pour relier chaque vente à sa page et sa source d'origine.
    corps.landingPage = sessionStorage.getItem('tjd_landing_page') || window.location.pathname.replace(/^\//, '');
    var referrerSession = sessionStorage.getItem('tjd_referrer');
    if (referrerSession) corps.referrer = referrerSession;
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (cle) {
      var val = sessionStorage.getItem('tjd_' + cle);
      if (val) corps[cle] = val;
    });

    // Mesure du funnel : le clic Acheter, avant même la redirection Stripe,
    // pour pouvoir calculer un taux de clic par page et un taux d'abandon vers le paiement.
    if (typeof window.gtag === 'function') {
      gtag('event', 'begin_checkout', { items: [{ item_id: produitId }] });
    }
    if (window._paq) {
      window._paq.push(['trackEvent', 'Ecommerce', 'ClicAcheter', produitId]);
    }

    btnEl.disabled = true;
    btnEl.textContent = 'Chargement…';
    fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.url) {
          if (localStorage.getItem('tjd_consent') === 'granted' && typeof window.fbq === 'function') {
            fbq('track', 'InitiateCheckout', { content_ids: [produitId], content_type: 'product' });
          }
          window.location.href = d.url;
        }
        else {
          alert('Une erreur est survenue. Réessaie dans quelques secondes.');
          btnEl.disabled = false;
          btnEl.textContent = TEXTES_ORIGINAUX[idx] || 'Acheter';
        }
      })
      .catch(function () {
        alert('Erreur réseau. Vérifie ta connexion et réessaie.');
        btnEl.disabled = false;
        btnEl.textContent = TEXTES_ORIGINAUX[idx] || 'Acheter';
      });
  }

  window.tjdAcheter = tjdAcheter;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tjd-produit]');
    if (!btn) return;
    var produitId = btn.getAttribute('data-tjd-produit');
    if (!produitId) return;
    e.preventDefault();
    tjdAcheter(produitId, btn);
  });
})();
