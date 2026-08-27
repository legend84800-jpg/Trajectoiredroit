/* Intégration paiement TJD (Stripe). Gère tous les boutons [data-tjd-produit] du site. */
(function () {
  var TEXTES_ORIGINAUX = {};

  function estTestInterne() {
    try {
      var parametre = new URLSearchParams(window.location.search).get('tjd_test');
      if (parametre === '1') localStorage.setItem('tjd_internal_test', '1');
      if (parametre === '0') localStorage.removeItem('tjd_internal_test');
      return localStorage.getItem('tjd_internal_test') === '1';
    } catch (_) {
      return window.tjdTestInterne === true;
    }
  }

  function typeAppareil() {
    var largeur = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (largeur < 768) return 'mobile';
    if (largeur < 1100) return 'tablette';
    return 'ordinateur';
  }

  function lireCookie(nom) {
    var m = document.cookie.match('(?:^|; )' + nom + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function creerAttemptId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'tjd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  }

  function mesurerCheckout(action, produitId, apresMesure) {
    if (estTestInterne()) {
      if (apresMesure) apresMesure();
      return;
    }
    var termine = false;
    function terminer() {
      if (termine) return;
      termine = true;
      if (apresMesure) apresMesure();
    }
    if (typeof window.gtag === 'function') {
      gtag('event', action === 'CheckoutCree' ? 'checkout_session_created' : 'checkout_error', {
        items: [{ item_id: produitId }],
        event_callback: action === 'CheckoutCree' ? terminer : undefined,
        event_timeout: action === 'CheckoutCree' ? 450 : undefined
      });
    }
    if (window._paq) {
      window._paq.push(['trackEvent', 'Ecommerce', action, produitId]);
    }
    if (action === 'CheckoutCree') window.setTimeout(terminer, 500);
    else terminer();
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
    corps.attemptId = creerAttemptId();
    corps.attemptCreatedAt = Math.floor(Date.now() / 1000);
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
    // Page réellement en cours au moment du clic (peut différer de la landing page
    // si le visiteur a navigué avant d'acheter) : sert de cancel_url pour ne pas
    // renvoyer tout le monde vers formations.html en cas d'abandon du paiement.
    corps.pageActuelle = window.location.pathname.replace(/^\//, '') + window.location.hash;
    corps.deviceType = typeAppareil();
    corps.viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
      + 'x' + Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    corps.internalTest = estTestInterne();
    var referrerSession = sessionStorage.getItem('tjd_referrer');
    if (referrerSession) corps.referrer = referrerSession;
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (cle) {
      var val = sessionStorage.getItem('tjd_' + cle);
      if (val) corps[cle] = val;
    });

    // Mesure du funnel : le clic Acheter, avant même la redirection Stripe,
    // pour pouvoir calculer un taux de clic par page et un taux d'abandon vers le paiement.
    if (!estTestInterne() && typeof window.gtag === 'function') {
      gtag('event', 'begin_checkout', { items: [{ item_id: produitId }] });
    }
    if (!estTestInterne() && window._paq) {
      window._paq.push(['trackEvent', 'Ecommerce', 'ClicAcheter', produitId]);
    }

    btnEl.disabled = true;
    btnEl.textContent = 'Chargement…';
    fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.erreur || 'Création du paiement impossible');
          return d;
        });
      })
      .then(function (d) {
        if (d.url) {
          if (!estTestInterne() && localStorage.getItem('tjd_consent') === 'granted' && typeof window.fbq === 'function') {
            fbq('track', 'InitiateCheckout', { content_ids: [produitId], content_type: 'product' });
          }
          mesurerCheckout('CheckoutCree', produitId, function () {
            window.location.assign(d.url);
          });
        }
        else {
          throw new Error('URL Stripe absente');
        }
      })
      .catch(function () {
        mesurerCheckout('CheckoutErreur', produitId);
        alert('Le paiement ne peut pas être ouvert pour le moment. Réessaie dans quelques secondes.');
        btnEl.disabled = false;
        btnEl.textContent = TEXTES_ORIGINAUX[idx] || 'Acheter';
      });
  }

  window.tjdAcheter = tjdAcheter;
  window.tjdEstTestInterne = estTestInterne;
  window.tjdTypeAppareil = typeAppareil;
  window.tjdMesurerCheckout = mesurerCheckout;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tjd-produit]');
    if (!btn) return;
    var produitId = btn.getAttribute('data-tjd-produit');
    if (!produitId) return;
    e.preventDefault();
    tjdAcheter(produitId, btn);
  });

  // Total dynamique de l'order bump : le libellé du bouton reflète le prix réel
  // dès que la case est cochée, au lieu de garder un prix fixe qui ne correspond
  // plus à ce qui sera réellement facturé sur Stripe.
  function euroVersCentimes(txt) {
    var m = txt && txt.match(/([\d]+)[,.]?(\d{0,2})\s*€/);
    if (!m) return null;
    return parseInt(m[1], 10) * 100 + parseInt((m[2] || '0').padEnd(2, '0'), 10);
  }
  function centimesVersEuro(c) {
    return (c / 100).toFixed(2).replace('.', ',') + ' €';
  }
  function initTotauxBump() {
    document.querySelectorAll('[data-tjd-bump-checkbox]').forEach(function (btn) {
      var checkboxId = btn.getAttribute('data-tjd-bump-checkbox');
      var checkbox = checkboxId ? document.getElementById(checkboxId) : null;
      if (!checkbox) return;
      var label = checkbox.closest('label');
      var prixBumpCentimes = euroVersCentimes(label ? label.textContent : '');
      var texteBase = btn.textContent;
      var prixBaseCentimes = euroVersCentimes(texteBase);
      if (prixBumpCentimes == null || prixBaseCentimes == null) return;
      var prefixe = texteBase.replace(/[\d]+[,.]?\d{0,2}\s*€\s*$/, '').replace(/[·\-–:]\s*$/, '').trim();
      checkbox.addEventListener('change', function () {
        var total = prixBaseCentimes + (checkbox.checked ? prixBumpCentimes : 0);
        btn.textContent = prefixe + ' · ' + centimesVersEuro(total);
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTotauxBump);
  } else {
    initTotauxBump();
  }

  // Réassurance sous chaque bouton d'achat principal (pas les boutons compacts en liste,
  // ni celui de la modale d'aperçu) : garantie, paiement Stripe, livraison immédiate.
  var TEXTE_REASSURANCE = 'Satisfait ou remboursé sous 7 jours · Paiement sécurisé par Stripe · PDF reçu immédiatement par email';
  function initReassurance() {
    document.querySelectorAll('.btn--full[data-tjd-produit]').forEach(function (btn) {
      if (btn.id === 'apercuCta') return;
      var parent = btn.parentElement;
      if (!parent || parent.querySelector('.tjd-reassurance')) return;
      var suivant = btn.nextElementSibling;
      if (suivant && /pdf complet par email/i.test(suivant.textContent || '')) suivant.remove();
      var p = document.createElement('p');
      p.className = 'tjd-reassurance';
      p.textContent = TEXTE_REASSURANCE;
      btn.insertAdjacentElement('afterend', p);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReassurance);
  } else {
    initReassurance();
  }
})();
