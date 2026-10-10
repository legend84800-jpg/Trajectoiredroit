/* Avis des acheteurs, remplis depuis /api/avis.
 * Emplacements : <div data-tjd-avis data-produit="fiche-da-l2-s1"></div>
 *            ou <div data-tjd-avis data-matiere="da-l2"></div>
 * Option : data-titre="0" retire le titre du bloc.
 * Sans avis publié, l'emplacement reste vide et invisible.
 * La mention de la fiche offerte accompagne chaque avis (transparence sur la contrepartie). */
(function () {
  'use strict';

  var METHODE = 'Ces avis viennent d’acheteurs dont la commande a été vérifiée. Les avis les plus récents apparaissent en premier, et seuls les avis injurieux ou sans rapport avec le produit sont retirés.';

  function chargerStyle() {
    if (document.querySelector('link[data-tjd-avis-css]')) return;
    var lien = document.createElement('link');
    lien.rel = 'stylesheet';
    lien.href = 'assets/css/avis.css?v=2b5967db';
    lien.setAttribute('data-tjd-avis-css', '');
    document.head.appendChild(lien);
  }

  function element(tag, classe, texte) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texte != null) el.textContent = texte;
    return el;
  }

  function etoiles(note) {
    var bloc = element('div', 'tjd-avis__etoiles');
    bloc.setAttribute('role', 'img');
    bloc.setAttribute('aria-label', note + ' sur 5');
    bloc.appendChild(document.createTextNode('★★★★★'.slice(0, note)));
    bloc.appendChild(element('span', null, '★★★★★'.slice(note)));
    return bloc;
  }

  function dateLisible(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function carte(avis) {
    var c = element('article', 'tjd-avis__carte');
    c.appendChild(etoiles(avis.note));
    c.appendChild(element('p', 'tjd-avis__texte', avis.texte));
    var date = dateLisible(avis.date);
    var auteur = element('p', 'tjd-avis__auteur', avis.prenom + ', ' + avis.niveau + (date ? ', ' : ''));
    if (date) {
      var t = element('time', null, 'le ' + date);
      t.setAttribute('datetime', avis.date);
      auteur.appendChild(t);
    }
    c.appendChild(auteur);
    c.appendChild(element('p', 'tjd-avis__contrepartie', avis.contrepartie));
    return c;
  }

  function remplir(bloc, avis) {
    if (!avis.length) return;
    var total = 0;
    avis.forEach(function (a) { total += a.note; });
    var moyenne = (Math.round((total / avis.length) * 10) / 10).toString().replace('.', ',');

    var section = element('section', 'tjd-avis');
    section.setAttribute('aria-label', 'Avis des acheteurs');
    if (bloc.getAttribute('data-titre') !== '0') section.appendChild(element('h2', 'h3 tjd-avis__titre', 'Avis des acheteurs'));
    section.appendChild(element('p', 'tjd-avis__resume',
      'Note moyenne de ' + moyenne + ' sur 5, calculée sur ' + avis.length + ' avis.'));
    var liste = element('div', 'tjd-avis__liste');
    avis.forEach(function (a) { liste.appendChild(carte(a)); });
    section.appendChild(liste);
    section.appendChild(element('p', 'tjd-avis__methode', METHODE));
    bloc.textContent = '';
    bloc.appendChild(section);
  }

  function charger(bloc) {
    var produit = bloc.getAttribute('data-produit');
    var matiere = bloc.getAttribute('data-matiere');
    var param = produit ? 'produit=' + encodeURIComponent(produit) : 'matiere=' + encodeURIComponent(matiere);
    fetch('/api/avis?' + param)
      .then(function (r) { return r.ok ? r.json() : { avis: [] }; })
      .then(function (d) { remplir(bloc, (d && d.avis) || []); })
      .catch(function () {});
  }

  function initialiser() {
    var blocs = document.querySelectorAll('[data-tjd-avis][data-produit], [data-tjd-avis][data-matiere]');
    if (!blocs.length) return;
    chargerStyle();
    Array.prototype.forEach.call(blocs, charger);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiser);
  else initialiser();
})();
