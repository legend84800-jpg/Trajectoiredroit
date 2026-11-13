/* Premier chapitre offert (07/11/2026).
   Sous chaque bouton d'aperçu d'une fiche complète ou d'un cours complet
   ([data-apercu-cta]), ajoute un lien vers le premier chapitre entier, en PDF,
   sans email. PDF publiés sur R2 sous tjd/essai/premier-chapitre/ par
   livrables/automatisation/essai-gratuit-tjd-2026-11-07/premier-chapitre/premier_chapitre.py.
   Mesure Matomo : catégorie Essai, action premier-chapitre, nom produit.
   Texte passé par redaction-julien le 07/11/2026. */
(function () {
  'use strict';
  var R2 = 'https://pub-45b53167be7548aca62650d34a771b47.r2.dev/tjd/essai/premier-chapitre/typographie-20261113/';
  var CHAPITRES = {"cours-complet-finances-publiques-l2-s1":["cours-complet-finances-publiques-l2-s1.pdf",13],"cours-complet-philosophie-du-droit-l2-s1":["cours-complet-philosophie-du-droit-l2-s1.pdf",18],"cours-fiche-biens-l2":["cours-fiche-biens-l2.pdf",13],"cours-fiche-commercial-l3-s1":["cours-fiche-commercial-l3-s1.pdf",11],"cours-fiche-constit-l1-s1":["cours-fiche-constit-l1-s1.pdf",14],"cours-fiche-constit-l1-s2":["cours-fiche-constit-l1-s2.pdf",12],"cours-fiche-contrats-l2-s1":["cours-fiche-contrats-l2-s1.pdf",13],"cours-fiche-contrats-speciaux-l3":["cours-fiche-contrats-speciaux-l3.pdf",12],"cours-fiche-da-l2-s1":["cours-fiche-da-l2-s1.pdf",11],"cours-fiche-da-l2-s2":["cours-fiche-da-l2-s2.pdf",8],"cours-fiche-famille-l1-s2":["cours-fiche-famille-l1-s2.pdf",10],"cours-fiche-finances-publiques-l2-s1":["cours-fiche-finances-publiques-l2-s1.pdf",9],"cours-fiche-hist-droit-l1":["cours-fiche-hist-droit-l1.pdf",11],"cours-fiche-hist-institutions-l1":["cours-fiche-hist-institutions-l1.pdf",14],"cours-fiche-intro-droit-l1":["cours-fiche-intro-droit-l1.pdf",14],"cours-fiche-obligations-l2-s2":["cours-fiche-obligations-l2-s2.pdf",15],"cours-fiche-penal-general-l1":["cours-fiche-penal-general-l1.pdf",12],"cours-fiche-penal-l2-s1":["cours-fiche-penal-l2-s1.pdf",12],"cours-fiche-personnes-l1":["cours-fiche-personnes-l1.pdf",11],"cours-fiche-philo-droit-l2-s1":["cours-fiche-philo-droit-l2-s1.pdf",13],"cours-fiche-procedure-penale-l3":["cours-fiche-procedure-penale-l3.pdf",10],"cours-fiche-relations-internationales-l1":["cours-fiche-relations-internationales-l1.pdf",9],"cours-fiche-societes-l3-s1":["cours-fiche-societes-l3-s1.pdf",13],"cours-fiche-societes-l3-s2":["cours-fiche-societes-l3-s2.pdf",14],"cours-fiche-travail-l3-s1":["cours-fiche-travail-l3-s1.pdf",10],"fiche-biens-l2":["fiche-biens-l2.pdf",9],"fiche-commercial-l3-s1":["fiche-commercial-l3-s1.pdf",9],"fiche-constit-l1-s1":["fiche-constit-l1-s1.pdf",14],"fiche-constit-l1-s2":["fiche-constit-l1-s2.pdf",9],"fiche-contrats-l2-s1":["fiche-contrats-l2-s1.pdf",13],"fiche-contrats-speciaux-l3":["fiche-contrats-speciaux-l3.pdf",12],"fiche-da-l2-s1":["fiche-da-l2-s1.pdf",10],"fiche-da-l2-s2":["fiche-da-l2-s2.pdf",9],"fiche-famille-l1-s2":["fiche-famille-l1-s2.pdf",8],"fiche-hist-droit-l1":["fiche-hist-droit-l1.pdf",8],"fiche-hist-institutions-l1":["fiche-hist-institutions-l1.pdf",8],"fiche-intro-droit-l1":["fiche-intro-droit-l1.pdf",16],"fiche-obligations-l2-s2":["fiche-obligations-l2-s2.pdf",10],"fiche-penal-general-l1":["fiche-penal-general-l1.pdf",9],"fiche-penal-l2-s1":["fiche-penal-l2-s1.pdf",10],"fiche-personnes-l1":["fiche-personnes-l1.pdf",8],"fiche-procedure-penale-l3":["fiche-procedure-penale-l3.pdf",8],"fiche-relations-internationales-l1":["fiche-relations-internationales-l1.pdf",11],"fiche-societes-l3-s1":["fiche-societes-l3-s1.pdf",10],"fiche-societes-l3-s2":["fiche-societes-l3-s2.pdf",8],"fiche-travail-l3-s1":["fiche-travail-l3-s1.pdf",11]};
  var TEXTE = 'Lire le premier chapitre en entier, gratuitement ({n} pages)';
  function demarrer() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-apercu-cta]'), function (bouton) {
      var id = bouton.getAttribute('data-apercu-cta');
      var c = CHAPITRES[id];
      if (!c || bouton.getAttribute('data-premier-chapitre') === '1') return;
      bouton.setAttribute('data-premier-chapitre', '1');
      var lien = document.createElement('a');
      lien.className = 'apercu-link';
      lien.href = R2 + c[0];
      lien.target = '_blank';
      lien.rel = 'noopener';
      lien.textContent = TEXTE.replace('{n}', c[1]);
      lien.addEventListener('click', function () {
        try { if (window._paq) window._paq.push(['trackEvent', 'Essai', 'premier-chapitre', id]); } catch (_) {}
      });
      bouton.insertAdjacentElement('afterend', lien);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
