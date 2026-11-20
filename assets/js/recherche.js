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
    var requeteCarte = requete
      .replace(/\bl([123])s([12])\b/g, 'l$1 s$2')
      .replace(/\b(?:licence|l)[\s.-]*([123])\b/g, 'l$1')
      .replace(/\b(?:semestre|s)[\s.-]*([12])\b/g, 's$1');
    var variantes = { qcms: 'qcm', flashcard: 'flashcards', fiches: 'fiche', completes: 'complete' };
    var motsCarte = (requeteCarte.match(/[\p{L}\p{N}]+/gu) || []).map(function (mot) { return Object.hasOwn(variantes, mot) ? variantes[mot] : mot; });
    var formatCherche = /\b(?:flashcards?|qcms?)\b/.test(requete) ? 'Flashcards + QCM'
      : /\bfiches?\b/.test(requete) && !/\bfiches?\s+(?:d\s+)?arrets?\b/.test(requete) ? 'Fiche complète' : '';
    return pages.map(function (item) {
      var carte = item.u.indexOf('#') !== -1;
      var motsCherches = carte ? motsCarte : mots;
      var titre = normalize(item.t), contenu = titre + ' ' + normalize(item.k) + ' ' + normalize(item.c);
      var reperes = carte ? titre.match(/\b(?:l[123]|s[12])\b/g) || [] : [];
      if (!motsCherches.length || !motsCherches.every(function (mot) {
        if (carte && /^(?:l[123]|s[12])$/.test(mot)) return reperes.indexOf(mot) !== -1;
        return contenu.indexOf(mot) !== -1;
      })) return null;
      var score = motsCherches.reduce(function (total, mot) { return total + (titre.indexOf(mot) !== -1 ? 10 : 1); }, 0);
      if (titre.indexOf(carte ? motsCarte.join(' ') : requete) !== -1) score += 20;
      // Une demande de format précis favorise sa carte. Les guides passent d'abord pour une matière seule.
      var priorite = carte ? (item.c === formatCherche ? -1 : 1) : 0;
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
            || /^\/flashcards-qcm\.html#flashcards-qcm-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.u)
            || /^\/formations\.html#(?:cours-)?fiche-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.u);
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
      // Une fiche masquée par un filtre doit redevenir visible même si son ancre est déjà active.
      if (lien.pathname === '/formations.html' && lien.origin === window.location.origin
        && lien.pathname === window.location.pathname && lien.hash && lien.hash === window.location.hash) {
        e.preventDefault();
        window.dispatchEvent(new Event('hashchange'));
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
