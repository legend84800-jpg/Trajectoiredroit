/* Filtres des fiches et des cours. Les autres catalogues conservent leur moteur. */
(function () {
  var CLE_NIVEAU = 'tjd_catalogue_niveau';
  var NIVEAUX = ['tous', 'L1', 'L2', 'L3'];
  var HASH_NIVEAU = { '#cours-l1': 'L1', '#cours-l2': 'L2', '#cours-l3': 'L3' };

  function normaliser(texte) {
    return String(texte || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function niveauValide(valeur) {
    var niveau = String(valeur || '').toUpperCase();
    return niveau === 'TOUS' ? 'tous' : NIVEAUX.indexOf(niveau) !== -1 ? niveau : null;
  }
  function niveauEnregistre() {
    try { return niveauValide(sessionStorage.getItem(CLE_NIVEAU)); } catch (_) { return null; }
  }
  function memoriserNiveau(niveau) {
    try {
      if (niveau === 'tous') sessionStorage.removeItem(CLE_NIVEAU);
      else sessionStorage.setItem(CLE_NIVEAU, niveau);
    } catch (_) { /* Le niveau reste porté par les liens entre les deux formats. */ }
  }
  function niveauAdresse() {
    if (HASH_NIVEAU[window.location.hash]) return HASH_NIVEAU[window.location.hash];
    try { return niveauValide(new URL(window.location.href).searchParams.get('niveau')); } catch (_) { return null; }
  }
  function initialiserCatalogue(racine) {
    if (racine.tjdCataloguePret) return;
    var grille = racine.querySelector('[data-catalogue-grille]');
    var recherche = racine.querySelector('[data-catalogue-recherche]');
    if (!grille || !recherche) return;
    racine.tjdCataloguePret = true;
    var cartes = Array.prototype.slice.call(grille.querySelectorAll('article[data-niveau]')).map(function (carte) {
      return {
        element: carte,
        display: carte.style.display,
        texte: normaliser(carte.textContent),
        niveaux: (carte.getAttribute('data-niveau') || '').split(',').map(function (niveau) { return niveau.trim(); }),
        matieres: (carte.getAttribute('data-matiere') || '').split(',').map(function (matiere) { return matiere.trim(); })
      };
    });
    var niveaux = Array.prototype.slice.call(racine.querySelectorAll('[data-catalogue-niveau]'));
    var matieres = Array.prototype.slice.call(racine.querySelectorAll('[data-catalogue-matiere]'));
    var compteur = racine.querySelector('[data-catalogue-compteur]');
    var vide = racine.querySelector('[data-catalogue-vide]');
    var reset = racine.querySelector('[data-catalogue-reset]');
    var etat = { niveau: niveauAdresse() || niveauEnregistre() || 'tous', matiere: 'tous' };

    function actualiserLiens() {
      document.querySelectorAll('a[href]').forEach(function (lien) {
        try {
          var url = new URL(lien.getAttribute('href'), window.location.href);
          if (url.origin !== window.location.origin || !/\/(formations|cours-fiches)\.html$/.test(url.pathname)) return;
          if (etat.niveau === 'tous') url.searchParams.delete('niveau');
          else url.searchParams.set('niveau', etat.niveau.toLowerCase());
          lien.setAttribute('href', url.pathname + url.search + url.hash);
        } catch (_) { /* Une autre destination conserve son adresse. */ }
      });
    }
    function actualiserAdresse(depuisHash) {
      try {
        var url = new URL(window.location.href);
        if (etat.niveau === 'tous') url.searchParams.delete('niveau');
        else url.searchParams.set('niveau', etat.niveau.toLowerCase());
        if (!depuisHash && HASH_NIVEAU[url.hash]) {
          url.hash = etat.niveau === 'tous'
            ? (racine.getAttribute('data-catalogue-format') === 'cours' ? 'grille-cours-fiches' : 'a-l-unite')
            : 'cours-' + etat.niveau.toLowerCase();
        }
        if (window.history && window.history.replaceState) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch (_) { /* Les filtres restent utilisables lorsque l'adresse est protégée. */ }
      memoriserNiveau(etat.niveau);
      actualiserLiens();
    }
    function appliquerFiltres() {
      var mots = normaliser(recherche.value).trim().split(/\s+/).filter(Boolean);
      var nombre = 0;
      cartes.forEach(function (carte) {
        var visible = (etat.niveau === 'tous' || carte.niveaux.indexOf(etat.niveau) !== -1)
          && (etat.matiere === 'tous' || carte.matieres.indexOf(etat.matiere) !== -1)
          && mots.every(function (mot) { return carte.texte.indexOf(mot) !== -1; });
        carte.element.hidden = !visible;
        carte.element.style.display = visible ? carte.display : 'none';
        if (visible) nombre++;
      });
      niveaux.forEach(function (bouton) {
        var actif = bouton.getAttribute('data-catalogue-niveau') === etat.niveau;
        bouton.classList.toggle('active', actif);
        bouton.setAttribute('aria-pressed', String(actif));
      });
      matieres.forEach(function (bouton) {
        var actif = bouton.getAttribute('data-catalogue-matiere') === etat.matiere;
        bouton.classList.toggle('active', actif);
        bouton.setAttribute('aria-pressed', String(actif));
      });
      if (compteur) compteur.textContent = nombre + (nombre > 1 ? ' supports affichés sur ' : ' support affiché sur ') + cartes.length;
      if (vide) {
        vide.hidden = nombre !== 0;
        vide.style.display = nombre === 0 ? '' : 'none';
      }
    }
    niveaux.forEach(function (bouton) {
      bouton.addEventListener('click', function () {
        etat.niveau = niveauValide(bouton.getAttribute('data-catalogue-niveau')) || 'tous';
        appliquerFiltres(); actualiserAdresse(false);
      });
    });
    matieres.forEach(function (bouton) {
      bouton.addEventListener('click', function () {
        etat.matiere = bouton.getAttribute('data-catalogue-matiere') || 'tous';
        appliquerFiltres();
      });
    });
    recherche.addEventListener('input', appliquerFiltres);
    if (reset) reset.addEventListener('click', function () {
      etat.niveau = 'tous'; etat.matiere = 'tous'; recherche.value = '';
      appliquerFiltres(); actualiserAdresse(false); recherche.focus();
    });
    function appliquerHash() {
      var niveau = HASH_NIVEAU[window.location.hash];
      if (!niveau) return;
      etat.niveau = niveau;
      appliquerFiltres(); actualiserAdresse(true);
      racine.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    window.addEventListener('hashchange', appliquerHash);
    appliquerFiltres(); actualiserAdresse(true);
    if (HASH_NIVEAU[window.location.hash]) appliquerHash();
  }
  function initialiser() {
    document.querySelectorAll('[data-tjd-catalogue]').forEach(initialiserCatalogue);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiser);
  else initialiser();
})();
