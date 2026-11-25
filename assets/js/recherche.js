/* ----- RECHERCHE SITE-WIDE -----
   L'index provient des pages publiques du site. Il se charge à la première
   ouverture de la recherche, indépendamment du chargement des autres fonctions. */
(function () {
  var index = null, chargement = null;
  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ');
  }
  function rechercher(pages, query) {
    var requete = normalize(query).trim();
    if (!requete) return [];
    var mots = requete.split(/\s+/);
    var referenceArret = requete.match(/^fiches?\s+(?:(?:d|de l)\s+)?arrets?\s+(.+)$/);
    var motsArret = referenceArret ? referenceArret[1].replace(/^sur\s+/, '').match(/[\p{L}\p{N}]+/gu) : null;
    var demandeGuide = /\bguides?\b/.test(requete);
    var requeteCarte = requete
      .replace(/\bl([123])s([12])\b/g, 'l$1 s$2')
      .replace(/\b(?:licence|l)[\s.-]*([123])\b/g, 'l$1')
      .replace(/\b(?:semestre|s)[\s.-]*([12])\b/g, 's$1');
    var motsGuide = demandeGuide ? (requeteCarte.match(/[\p{L}\p{N}]+/gu) || []).filter(function (mot) {
      return !/^(?:d|de|du|des|l|le|la|les|en)$/.test(mot);
    }) : [];
    var matiereGuide = motsGuide.filter(function (mot) {
      return !/^(?:guides?|gratuits?)$/.test(mot);
    });
    var variantes = { qcms: 'qcm', flashcard: 'flashcards', fiches: 'fiche', completes: 'complete' };
    var motsCarte = (requeteCarte.match(/[\p{L}\p{N}]+/gu) || []).map(function (mot) { return Object.hasOwn(variantes, mot) ? variantes[mot] : mot; });
    var formatFichesArret = /\bfiches?\s+(?:(?:d|de l)\s+)?arrets?\b/;
    var demandeFichesArret = formatFichesArret.test(requete);
    var motsFichesArret = demandeFichesArret ? (requeteCarte.replace(formatFichesArret, ' ').match(/[\p{L}\p{N}]+/gu) || []).filter(function (mot) {
      return !/^(?:d|de|du|des|l|le|la|les|en|pour|sur|pdf)$/.test(mot);
    }) : [];
    var demandeCitations = /\bcitations?\b/.test(requete);
    var ancreCitations = '/revisions.html#citations';
    var motsCitations = demandeCitations ? motsCarte.filter(function (mot) {
      return !/^(?:fiche|citations?|d|de|du|des|l|le|la|les|en|pour|sur|pdf)$/.test(mot);
    }) : [];
    var sectionCitationsIndexee = demandeCitations && pages.some(function (item) { return item.u === ancreCitations; });
    var casPratiques = /\bcas\s+pratiques\b/.test(requete) || (/\bcas\s+pratique\b/.test(requete) && /\bs[12]\b/.test(requeteCarte));
    var formatCherche = demandeCitations ? 'Fiches de citations'
      : /\b(?:flashcards?|qcms?)\b/.test(requete) ? 'Flashcards + QCM'
      : demandeFichesArret ? 'Fiches d’arrêt'
      : /\bfiches?\b/.test(requete) ? 'Fiche complète'
      : /\bmajeures?\b/.test(requete) ? 'Majeures préparées'
      : casPratiques ? 'Cas pratiques corrigés' : '';
    return pages.map(function (item) {
      if (item.u === ancreCitations) {
        return demandeCitations && !motsCitations.length ? { item: item, score: 0, priorite: -2 } : null;
      }
      if (sectionCitationsIndexee && item.u === '/revisions.html') return null;
      var citation = item.c === 'Fiches de citations';
      if (citation && (!demandeCitations || !motsCitations.length)) return null;
      var ficheArret = item.c === 'Fiches d’arrêt';
      if (ficheArret && (!demandeFichesArret || !motsFichesArret.length)) return null;
      var avecAncre = item.u.indexOf('#') !== -1;
      var sectionGuide = item.g === true && avecAncre;
      var guide = demandeGuide && (sectionGuide || (matiereGuide.length && typeof item.g === 'string'));
      if (sectionGuide && !guide) return null;
      var arret = motsArret && item.c === 'Arrêt expliqué';
      var carte = avecAncre && !sectionGuide;
      var motsCherches = citation ? motsCitations : ficheArret ? motsFichesArret : guide ? motsGuide : arret ? motsArret : carte ? motsCarte : mots;
      var titre = normalize(item.t), contenu = titre + ' ' + normalize(item.k) + ' ' + normalize(item.c);
      var intituleGuide = guide && !sectionGuide ? normalize(item.g) : '';
      if (intituleGuide) contenu += ' guide gratuit guides gratuits ' + intituleGuide;
      var reperes = carte ? titre.match(/\b(?:l[123]|s[12])\b/g) || [] : [];
      if (!motsCherches.length || !motsCherches.every(function (mot) {
        if (carte && /^(?:l[123]|s[12])$/.test(mot)) return reperes.indexOf(mot) !== -1;
        return contenu.indexOf(mot) !== -1;
      })) return null;
      var score = motsCherches.reduce(function (total, mot) { return total + (titre.indexOf(mot) !== -1 ? 10 : 1); }, 0);
      if (titre.indexOf(carte ? motsCarte.join(' ') : requete) !== -1) score += 20;
      if (intituleGuide && matiereGuide.every(function (mot) { return intituleGuide.indexOf(mot) !== -1; })) score += 20;
      // Une demande de format précis favorise sa carte. Les guides passent d'abord pour une matière seule.
      var nouveauSupport = item.c === 'Majeures préparées' || item.c === 'Cas pratiques corrigés';
      var priorite = sectionGuide ? -2 : guide || arret ? -1 : !carte ? 0 : item.c === formatCherche ? -1 : nouveauSupport ? 2 : 1;
      return { item: item, score: score, priorite: priorite };
    }).filter(Boolean).sort(function (a, b) { return a.priorite - b.priorite || b.score - a.score || a.item.t.localeCompare(b.item.t, 'fr'); })
      .map(function (resultat) { return resultat.item; });
  }
  window.tjdRechercherPages = rechercher;
  function charger() {
    if (index) return Promise.resolve(index);
    if (chargement) return chargement;
    chargement = fetch('/assets/data/search-index.json', { cache: 'no-cache' })
      .then(function (reponse) { if (!reponse.ok) throw new Error('Index indisponible'); return reponse.json(); })
      .then(function (pages) {
        if (!Array.isArray(pages)) throw new Error('Index invalide');
        index = pages.filter(function (item) {
          if (!item || typeof item.t !== 'string' || typeof item.u !== 'string') return false;
          return /^\/(?:[a-z0-9][a-z0-9_-]*\.html)?$/.test(item.u)
            || (item.g === true && (item.u === '/contrats-speciaux-l3.html#programme'
              || item.u === '/ressources-gratuites.html#guides-gratuits'))
            || /^\/revisions\.html#(?:citations(?:-[a-z0-9]+)*|fiche-arret-[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(item.u)
            || /^\/flashcards-qcm\.html#flashcards-qcm-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.u)
            || /^\/formations\.html#(?:cours-)?fiche-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.u)
            || /^\/majeures-preparees\.html\?niveau=l[123]#maj-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.u)
            || /^\/cas-pratiques-corriges\.html\?matiere=cas-pratique-[a-z0-9]+(?:-[a-z0-9]+)*#recueils-cas-pratiques$/.test(item.u);
        });
        chargement = null;
        return index;
      }).catch(function (erreur) { chargement = null; throw erreur; });
    return chargement;
  }
  function buildUI() {
    var overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Recherche');
    overlay.setAttribute('tabindex', '-1');
    overlay.innerHTML = '<div class="search-panel"><div class="search-panel__head">' +
      '<input type="search" class="search-panel__input" placeholder="Cherche une matière ou un arrêt…" aria-label="Rechercher" aria-controls="searchResults" autocomplete="off">' +
      '<button type="button" class="search-panel__close" aria-label="Fermer la recherche">✕</button></div>' +
      '<p class="search-panel__status" role="status" aria-live="polite"></p>' +
      '<div class="search-panel__results" id="searchResults"></div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector('.search-panel__input');
    var results = overlay.querySelector('#searchResults');
    var status = overlay.querySelector('.search-panel__status');
    var closeBtn = overlay.querySelector('.search-panel__close');
    var nombreAffiche = 20;
    function render() {
      results.innerHTML = '';
      if (!index) return;
      if (!input.value.trim()) { status.textContent = 'Écris le nom d’une matière ou d’un arrêt.'; return; }
      var trouves = rechercher(index, input.value);
      status.textContent = trouves.length ? trouves.length + (trouves.length > 1 ? ' résultats.' : ' résultat.') : 'Aucun résultat. Essaie le nom de la matière ou de l’arrêt.';
      trouves.slice(0, nombreAffiche).forEach(function (item) {
        var lien = document.createElement('a'); lien.className = 'search-result'; lien.href = item.u;
        var categorie = document.createElement('span'); categorie.className = 'search-result__cat'; categorie.textContent = item.c;
        var titre = document.createElement('span'); titre.className = 'search-result__title'; titre.textContent = item.t;
        lien.appendChild(categorie); lien.appendChild(titre); results.appendChild(lien);
      });
      if (trouves.length > nombreAffiche) {
        var plus = document.createElement('button'); plus.type = 'button'; plus.className = 'search-panel__more'; plus.textContent = 'Afficher les résultats suivants';
        plus.addEventListener('click', function () {
          var premiereNouvellePosition = nombreAffiche;
          nombreAffiche += 20; render();
          var liens = results.querySelectorAll('a'); if (liens[premiereNouvellePosition]) liens[premiereNouvellePosition].focus();
        });
        results.appendChild(plus);
      }
    }
    function open() {
      input.value = ''; results.innerHTML = ''; nombreAffiche = 20;
      status.textContent = index ? 'Écris le nom d’une matière ou d’un arrêt.' : 'Chargement de la recherche…';
      window.tjdDialogues.ouvrir(overlay, input, document.activeElement);
      charger().then(render).catch(function () {
        if (!overlay.classList.contains('open')) return;
        status.textContent = 'La recherche est indisponible pour le moment. Tu peux ouvrir le catalogue ou le blog.';
        results.innerHTML = '<a class="search-result" href="/formations.html">Ouvrir le catalogue</a><a class="search-result" href="/blog.html">Ouvrir le blog</a>';
      });
    }
    function close() { window.tjdDialogues.fermer(overlay); }
    closeBtn.addEventListener('click', close);
    results.addEventListener('click', function (e) {
      var lien = e.target.closest('a.search-result');
      if (!lien || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      close();
      if (lien.origin !== window.location.origin || lien.pathname !== window.location.pathname || !lien.hash) return;
      // Une fiche masquée par un filtre doit redevenir visible même si son ancre est déjà active.
      if (lien.pathname === '/formations.html' && lien.hash === window.location.hash) {
        e.preventDefault();
        window.dispatchEvent(new Event('hashchange'));
      }
      if (lien.search !== window.location.search) return;
      if (lien.pathname === '/cas-pratiques-corriges.html') {
        var matiere = new URLSearchParams(lien.search).get('matiere');
        var choix = document.getElementById('choixRecueil');
        if (choix && choix.value !== matiere && Array.prototype.some.call(choix.options, function (option) { return option.value === matiere; })) {
          choix.value = matiere;
          choix.dispatchEvent(new Event('change'));
        }
      }
      if (lien.pathname === '/majeures-preparees.html') {
        var cible = document.getElementById(lien.hash.slice(1));
        var filtre = document.querySelector('#grille-majeures input[type="search"]');
        if (cible && cible.hidden && filtre) {
          filtre.value = '';
          filtre.dispatchEvent(new Event('input'));
        }
      }
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    window.tjdOuvrirRecherche = open;
    input.addEventListener('input', function () { nombreAffiche = 20; render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = results.querySelector('.search-result'); if (first) first.click(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
