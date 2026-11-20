/* Encart Pack Partiel : onglets d'année et choix du duo en L3 (19/11/2026).
   Le bouton d'achat garde data-tjd-produit, donc achat.js gère le paiement. */
(function () {
  function suivre(action, libelle) {
    try {
      if (window._paq) window._paq.push(['trackEvent', 'EncartPartiels', action, libelle]);
    } catch (_) {}
  }

  function initialiser(encart) {
    var onglets = Array.prototype.slice.call(encart.querySelectorAll('.offre-partiels__annee'));
    var panneaux = Array.prototype.slice.call(encart.querySelectorAll('.offre-partiels__panneau'));

    function choisirAnnee(annee, parClic) {
      onglets.forEach(function (onglet) {
        var actif = onglet.getAttribute('data-annee') === annee;
        onglet.setAttribute('aria-selected', actif ? 'true' : 'false');
        onglet.tabIndex = actif ? 0 : -1;
      });
      panneaux.forEach(function (panneau) {
        panneau.hidden = panneau.getAttribute('data-annee') !== annee;
      });
      if (parClic) suivre('Annee', annee + ' | ' + location.pathname);
    }

    onglets.forEach(function (onglet, index) {
      onglet.addEventListener('click', function () { choisirAnnee(onglet.getAttribute('data-annee'), true); });
      onglet.addEventListener('keydown', function (e) {
        var cible = null;
        if (e.key === 'ArrowRight') cible = onglets[(index + 1) % onglets.length];
        if (e.key === 'ArrowLeft') cible = onglets[(index - 1 + onglets.length) % onglets.length];
        if (!cible) return;
        e.preventDefault();
        cible.focus();
        choisirAnnee(cible.getAttribute('data-annee'), true);
      });
    });

    Array.prototype.forEach.call(encart.querySelectorAll('.offre-partiels__duo'), function (bouton) {
      bouton.addEventListener('click', function () {
        var panneau = bouton.closest('.offre-partiels__panneau');
        Array.prototype.forEach.call(panneau.querySelectorAll('.offre-partiels__duo'), function (autre) {
          autre.setAttribute('aria-pressed', autre === bouton ? 'true' : 'false');
        });
        var cta = panneau.querySelector('.offre-partiels__cta');
        var visuel = panneau.querySelector('.offre-partiels__visuel');
        cta.setAttribute('data-tjd-produit', bouton.getAttribute('data-produit'));
        cta.setAttribute('aria-label', 'Acheter le ' + bouton.getAttribute('data-nom') + ' · 69,90 €');
        var panier = panneau.querySelector('.tjd-panier-lien');
        if (panier) {
          panier.setAttribute('data-tjd-panier-lien', bouton.getAttribute('data-produit'));
          panier.dataset.produitId = bouton.getAttribute('data-produit');
          panier.dataset.nom = bouton.getAttribute('data-nom');
          panier.disabled = false;
        }
        visuel.src = bouton.getAttribute('data-visuel');
        visuel.alt = 'Couverture du ' + bouton.getAttribute('data-nom') + ', Trajectoire Droit';
        suivre('Duo', bouton.getAttribute('data-produit'));
      });
    });

    choisirAnnee(encart.getAttribute('data-annee-defaut') || 'l1', false);

    if ('IntersectionObserver' in window) {
      var vu = false;
      var observateur = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (entree) {
          if (entree.isIntersecting && !vu) {
            vu = true;
            suivre('Vu', location.pathname);
            observateur.disconnect();
          }
        });
      }, { threshold: 0.4 });
      observateur.observe(encart);
    }
  }

  function demarrer() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-offre-partiels]'), initialiser);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
