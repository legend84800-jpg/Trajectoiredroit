/* Intégration paiement TJD (Stripe). Gère tous les boutons [data-tjd-produit] du site. */
(function () {
  var TEXTES_ORIGINAUX = {};

  function tjdAcheter(produitId, btnEl) {
    if (!btnEl) btnEl = document.querySelector('[data-tjd-produit="' + produitId + '"]');
    if (!btnEl) return;
    var idx = produitId + '-' + Array.from(document.querySelectorAll('[data-tjd-produit="' + produitId + '"]')).indexOf(btnEl);
    TEXTES_ORIGINAUX[idx] = TEXTES_ORIGINAUX[idx] || btnEl.textContent.trim();
    btnEl.disabled = true;
    btnEl.textContent = 'Chargement…';
    fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produitId: produitId })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.url) { window.location.href = d.url; }
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
