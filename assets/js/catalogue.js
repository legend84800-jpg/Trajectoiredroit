/* Filtres des fiches et des cours. Les autres catalogues conservent leur moteur. */
(function () {
  var CLE_NIVEAU = 'tjd_catalogue_niveau';
  var NIVEAUX = ['tous', 'L1', 'L2', 'L3'];
  var HASH_NIVEAU = { '#cours-l1': 'L1', '#cours-l2': 'L2', '#cours-l3': 'L3' };

  function normaliser(texte) {
    return String(texte || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function extraireMots(texte) {
    return texte.match(/[\p{L}\p{N}]+/gu) || [];
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
    } catch (_) { /* Le niveau reste porté par les liens du catalogue. */ }
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
    var catalogueFiches = racine.getAttribute('data-catalogue-format') === 'fiches';
    var cartes = Array.prototype.slice.call(grille.querySelectorAll('article[data-niveau]')).map(function (carte) {
      var meta = carte.querySelector('.product__meta');
      var texteMeta = normaliser(meta && meta.textContent);
      var semestresCarte = Array.from(texteMeta.matchAll(/\b(?:semestre\s+|s)([12])\b/g), function (match) {
        return match[1];
      });
      var titreAnnuel = catalogueFiches && /(?:^|·)\s*annee\s*(?:·|$)/.test(texteMeta)
        ? carte.querySelector('.product__title') : null;
      var champs = carte.querySelectorAll('.badge--format, .product__title, .product__meta, .product__edition, .product__desc, .product__sommaire-list');
      return {
        element: carte,
        display: carte.style.display,
        semestres: semestresCarte,
        sujetAnnuel: titreAnnuel ? extraireMots(normaliser(titreAnnuel.textContent)).sort().join(' ') : null,
        texte: normaliser(Array.prototype.map.call(champs, function (champ) { return champ.textContent; }).join(' ')),
        niveaux: (carte.getAttribute('data-niveau') || '').split(',').map(function (niveau) { return niveau.trim(); }),
        matieres: (carte.getAttribute('data-matiere') || '').split(',').map(function (matiere) { return matiere.trim(); })
      };
    });
    var niveaux = Array.prototype.slice.call(racine.querySelectorAll('[data-catalogue-niveau]'));
    var matieres = Array.prototype.slice.call(racine.querySelectorAll('[data-catalogue-matiere]'));
    var compteur = racine.querySelector('[data-catalogue-compteur]');
    var vide = racine.querySelector('[data-catalogue-vide]');
    var suggestion = racine.querySelector('[data-catalogue-suggestion]');
    var reset = racine.querySelector('[data-catalogue-reset]');
    var etat = { niveau: niveauAdresse() || niveauEnregistre() || 'tous', matiere: 'tous' };
    var filtreSuggere = null;

    function actualiserLiens() {
      document.querySelectorAll('a[href]').forEach(function (lien) {
        try {
          var url = new URL(lien.getAttribute('href'), window.location.href);
          if (url.origin !== window.location.origin || !/\/formations\.html$/.test(url.pathname)) return;
          if (url.hash && cartes.some(function (carte) { return carte.element.id === url.hash.slice(1); })) return;
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
            ? 'a-l-unite'
            : 'cours-' + etat.niveau.toLowerCase();
        }
        if (window.history && window.history.replaceState) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch (_) { /* Les filtres restent utilisables lorsque l'adresse est protégée. */ }
      memoriserNiveau(etat.niveau);
      actualiserLiens();
    }
    function cartesDansMatiere(cartesRecherchees, matiere, sujetAnnuel) {
      var correspondances = matiere === 'tous' ? cartesRecherchees : cartesRecherchees.filter(function (carte) {
        return carte.matieres.includes(matiere);
      });
      if (!sujetAnnuel) return correspondances;
      var fichesAnnuelles = correspondances.filter(function (carte) { return carte.sujetAnnuel === sujetAnnuel; });
      return fichesAnnuelles.length ? fichesAnnuelles : correspondances;
    }
    function carteDansNiveau(carte) {
      return etat.niveau === 'tous' || carte.niveaux.includes(etat.niveau);
    }
    function proposerFiltre(cartesCorrespondantes, cartesAutresMatieres) {
      if (!suggestion) return;
      filtreSuggere = null;
      var texte = '';
      if (cartesAutresMatieres.length) {
        filtreSuggere = { matiere: 'tous' };
        texte = cartesAutresMatieres.length === 1
          ? 'Voir le résultat dans toutes les matières'
          : 'Voir les résultats dans toutes les matières';
      } else if (cartesCorrespondantes.length) {
        var niveauxTrouves = NIVEAUX.slice(1).filter(function (niveau) {
          return cartesCorrespondantes.some(function (carte) { return carte.niveaux.includes(niveau); });
        });
        var niveau = niveauxTrouves.length > 1 ? 'tous' : niveauxTrouves[0];
        if (niveau) {
          filtreSuggere = { niveau: niveau };
          var nombre = cartesCorrespondantes.length;
          var resultat = nombre === 1 ? 'le résultat' : 'les ' + nombre + ' résultats';
          texte = 'Voir ' + resultat + (niveau === 'tous' ? ' dans toutes les années' : ' en ' + niveau);
        }
      }
      suggestion.textContent = texte;
      suggestion.hidden = !filtreSuggere;
      suggestion.style.display = filtreSuggere ? '' : 'none';
    }
    function appliquerFiltres(depuisRecherche) {
      var semestres = [], niveauxRecherches = [];
      var texte = normaliser(recherche.value)
        .replace(/\bl([123])s([12])\b/g, 'l$1 s$2')
        .replace(/\b(?:licence|l)[\s.-]*([123])\b/g, function (_, niveau) {
          niveauxRecherches.push('L' + niveau);
          return ' ';
        })
        .replace(/\b(?:semestre|s)[\s.-]*([12])\b/g, function (_, semestre) {
          semestres.push(semestre);
          return ' ';
        });
      var niveauSaisi = niveauxRecherches[0];
      if (depuisRecherche && catalogueFiches
          && niveauSaisi && niveauSaisi !== etat.niveau
          && niveauxRecherches.every(function (niveau) { return niveau === niveauSaisi; })) {
        etat.niveau = niveauSaisi;
        actualiserAdresse(false);
      }
      var mots = extraireMots(texte);
      var sujetRecherche = mots.slice().sort().join(' ');
      var cartesRecherchees = cartes.filter(function (carte) {
        return (!niveauxRecherches.length || niveauxRecherches.some(function (niveau) { return carte.niveaux.indexOf(niveau) !== -1; }))
          && (!semestres.length
            || semestres.some(function (semestre) { return carte.semestres.includes(semestre); })
            || (sujetRecherche && carte.sujetAnnuel === sujetRecherche))
          && mots.every(function (mot) { return carte.texte.indexOf(mot) !== -1; });
      });
      var sujetAnnuel = semestres.length ? sujetRecherche : null;
      var cartesCorrespondantes = cartesDansMatiere(cartesRecherchees, etat.matiere, sujetAnnuel);
      var cartesRetenues = new Set(cartesCorrespondantes);
      var nombre = 0;
      cartes.forEach(function (carte) {
        var visible = cartesRetenues.has(carte) && carteDansNiveau(carte);
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
      var chercherSuggestion = nombre === 0 && (mots.length || niveauxRecherches.length || semestres.length);
      var autresMatieres = chercherSuggestion && etat.matiere !== 'tous'
        ? cartesDansMatiere(cartesRecherchees, 'tous', sujetAnnuel).filter(carteDansNiveau) : [];
      proposerFiltre(chercherSuggestion ? cartesCorrespondantes : [], autresMatieres);
      if (vide) {
        vide.hidden = nombre !== 0 || !!filtreSuggere;
        vide.style.display = vide.hidden ? 'none' : '';
      }
    }
    if (suggestion) suggestion.addEventListener('click', function () {
      if (!filtreSuggere) return;
      var niveauModifie = !!filtreSuggere.niveau;
      Object.assign(etat, filtreSuggere);
      appliquerFiltres();
      if (niveauModifie) actualiserAdresse(false);
      var premiereCarte = cartes.find(function (carte) { return !carte.element.hidden; });
      if (premiereCarte) {
        if (premiereCarte.element.getAttribute('tabindex') === null) premiereCarte.element.setAttribute('tabindex', '-1');
        premiereCarte.element.focus();
      }
    });
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
    recherche.addEventListener('input', function () { appliquerFiltres(true); });
    if (reset) reset.addEventListener('click', function () {
      etat.niveau = 'tous'; etat.matiere = 'tous'; recherche.value = '';
      appliquerFiltres(); actualiserAdresse(false); recherche.focus();
    });
    function appliquerHash() {
      var hash = window.location.hash;
      var cible = hash && cartes.find(function (carte) { return carte.element.id === hash.slice(1); });
      if (cible && cible.niveaux.length) {
        etat.niveau = niveauValide(cible.niveaux[0]) || 'tous';
        etat.matiere = 'tous';
        recherche.value = '';
        appliquerFiltres(); actualiserAdresse(true);
        cible.element.focus({ preventScroll: true });
        cible.element.scrollIntoView({ behavior: 'auto', block: 'start' });
        return true;
      }
      var niveau = HASH_NIVEAU[hash];
      if (!niveau) return false;
      etat.niveau = niveau;
      appliquerFiltres(); actualiserAdresse(true);
      racine.scrollIntoView({ behavior: 'auto', block: 'start' });
      return true;
    }
    window.addEventListener('hashchange', appliquerHash);
    if (!appliquerHash()) { appliquerFiltres(); actualiserAdresse(true); }
    niveaux.concat(matieres, recherche, reset || []).forEach(function (controle) {
      controle.disabled = false;
    });
  }
  function initialiser() {
    document.querySelectorAll('[data-tjd-catalogue]').forEach(initialiserCatalogue);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiser);
  else initialiser();
})();
