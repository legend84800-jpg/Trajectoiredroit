/* Capture un email puis affiche l'extrait propre à la matière. */
(function () {
  document.querySelectorAll('[data-tjd-sample-form]').forEach(function (formulaire) {
    formulaire.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      var email = formulaire.querySelector('input[type="email"]');
      var bouton = formulaire.querySelector('button[type="submit"]');
      var statut = formulaire.parentElement.querySelector('[data-tjd-sample-status]');
      var resultat = formulaire.parentElement.querySelector('[data-tjd-sample-result]');
      if (!email || !email.checkValidity()) {
        if (email) email.reportValidity();
        return;
      }
      bouton.disabled = true;
      bouton.textContent = 'Ouverture…';
      if (statut) statut.textContent = '';
      var testInterne = window.tjdEstTestInterne && window.tjdEstTestInterne();
      var capture = testInterne ? Promise.resolve({ ok: true }) : fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value,
          source: formulaire.getAttribute('data-source') || 'extrait-matiere'
        })
      });
      capture.then(function (reponse) {
        if (!reponse.ok) throw new Error('capture');
        if (resultat) resultat.hidden = false;
        formulaire.hidden = true;
        if (statut) statut.textContent = 'Ton extrait est prêt juste en dessous.';
        if (!testInterne) {
          var source = formulaire.getAttribute('data-source') || 'extrait-matiere';
          if (typeof window.gtag === 'function') {
            window.gtag('event', 'generate_lead', { lead_source: source });
          }
          if (window._paq) window._paq.push(['trackEvent', 'Lead', 'ExtraitMatiere', source]);
        }
      }).catch(function () {
        bouton.disabled = false;
        bouton.textContent = 'Voir mon extrait';
        if (statut) statut.textContent = 'Impossible d’ouvrir l’extrait pour le moment. Réessaie dans quelques secondes.';
      });
    });
  });
})();
