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
    // Page réellement en cours au moment du clic (peut différer de la landing page
    // si le visiteur a navigué avant d'acheter) : sert de cancel_url pour ne pas
    // renvoyer tout le monde vers formations.html en cas d'abandon du paiement.
    corps.pageActuelle = window.location.pathname.replace(/^\//, '') + window.location.hash;
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
  // ni celui de la modale d'aperçu) : garantie, paiement Stripe, livraison immédiate,
  // plus un lien WhatsApp pour lever une dernière hésitation avant de payer.
  var TEXTE_REASSURANCE = 'Satisfait ou remboursé sous 7 jours · Paiement sécurisé par Stripe · PDF reçu immédiatement par email';
  var WHATSAPP_NUMERO = '33605418521';
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

      var nomProduit = btn.getAttribute('data-tjd-produit') || '';
      var messagePreRempli = encodeURIComponent("Bonjour Julien, j'ai une question avant d'acheter (" + nomProduit + ").");
      var lienWa = document.createElement('a');
      lienWa.className = 'tjd-reassurance tjd-reassurance--wa';
      lienWa.href = 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + messagePreRempli;
      lienWa.target = '_blank';
      lienWa.rel = 'noopener';
      lienWa.textContent = 'Une question avant d\'acheter ? Écris-moi sur WhatsApp →';
      p.insertAdjacentElement('afterend', lienWa);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReassurance);
  } else {
    initReassurance();
  }
})();
