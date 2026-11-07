/* Kit d'essai des majeures préparées (07/11/2026).
   Remplit chaque [data-tjd-essai] avec une carte où l'élève coche deux majeures
   d'une matière, laisse son email et ouvre aussitôt son kit (PDF assemblé par
   /api/kit-essai). L'email part par /api/lead (branche essai) avec un code de
   -15 % valable 48 heures. Rien ne touche au parcours d'achat.
     data-tjd-essai="maj-da-l2-s1"               une matière
     data-tjd-essai="maj-da-l2-s1,maj-da-l2-s2"  menu limité à ces matières
     data-tjd-essai="choix"                      menu des 18 matières (?produit=maj-… présélectionne)
     data-preselection="9"                       majeure déjà cochée (pages de notion)
     data-defaut="maj-da-l2-s1"                  matière affichée d'abord en mode choix
     data-titre, data-texte                      textes propres à la page
   Chaque changement de matière émet l'évènement « tjd-essai-matiere » sur document.
   Mesure Matomo : catégorie Lead, action essai-majeures, nom produit.
   Textes passés par redaction-julien le 07/11/2026. */
(function () {
  'use strict';

  var T = {
    titre: 'Deux majeures offertes, tu choisis lesquelles',
    texte: 'Tu coches deux majeures dans la liste, puis je t’envoie par email ton kit d’essai. Il contient ces deux majeures en entier, rédigées condition par condition.',
    texteCp: ' Tu y trouves aussi un cas pratique corrigé de la matière, où les majeures sont appliquées aux faits de l’énoncé.',
    matiere: 'Ta matière',
    compteur: '{n} majeure{s} cochée{s} sur 2',
    email: 'Ton email',
    bouton: 'Recevoir mon kit d’essai',
    envoi: 'Préparation…',
    rgpd: 'En validant, tu reçois ce kit et les emails de Trajectoire Droit.',
    rgpdLien: 'Politique de confidentialité',
    deux: 'Il faut cocher deux majeures pour recevoir le kit.',
    succesTitre: 'Ton kit est prêt.',
    succes: 'Tu peux l’ouvrir tout de suite avec le bouton ci-dessous. Je te l’envoie aussi à l’adresse {email}, avec un code de -15 % valable 48 heures sur les majeures de cette matière.',
    ouvrir: 'Ouvrir mon kit d’essai',
    erreur: 'L’envoi n’a pas fonctionné. Vérifie ton adresse email, puis réessaie dans quelques secondes.'
  };

  var CSS = [
    '.tjd-ek{box-sizing:border-box;max-width:680px;margin:18px auto 6px;padding:16px;background:var(--gold-bg,#FBF8EE);border:1px solid var(--gold-line,#C9A961);border-radius:var(--r-md,12px);text-align:left;container-type:inline-size}',
    '.tjd-ek *{box-sizing:border-box}',
    '.tjd-ek__tete{display:flex;gap:12px;align-items:flex-start;margin:0 0 12px}',
    '.tjd-ek__icone{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:38px;height:46px;border-radius:5px;background:#fff;border:1px solid var(--gold-line,#C9A961);font:700 1.1rem/1 Georgia,serif;color:var(--navy,#1A2851)}',
    '.tjd-ek__titre{margin:0 0 4px;font-size:1.05rem;line-height:1.3;font-weight:700;color:var(--navy,#1A2851)}',
    '.tjd-ek__texte{margin:0;font-size:.92rem;line-height:1.5;color:var(--body,#475569)}',
    '.tjd-ek__form{display:grid;gap:8px;margin:0}',
    '.tjd-ek__champ{display:block;width:100%;min-height:44px;padding:10px 12px;font:inherit;font-size:16px;color:var(--ink,#0F172A);background:#fff;border:1px solid var(--border-strong,#CBD5E1);border-radius:var(--r-sm,8px)}',
    '.tjd-ek__champ:focus{outline:2px solid var(--navy,#1A2851);outline-offset:1px}',
    '.tjd-ek__liste{max-height:260px;overflow:auto;margin:0;padding:6px 10px;background:#fff;border:1px solid var(--border-strong,#CBD5E1);border-radius:var(--r-sm,8px)}',
    '.tjd-ek__theme{margin:8px 0 2px;font-size:.78rem;font-weight:700;letter-spacing:.02em;color:var(--gold-ink,#8A6D1F);text-transform:uppercase}',
    '.tjd-ek__option{display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:.92rem;line-height:1.4;color:var(--ink,#0F172A);cursor:pointer}',
    '.tjd-ek__option input{margin-top:3px;flex:0 0 auto;width:17px;height:17px;accent-color:var(--navy,#1A2851)}',
    '.tjd-ek__option--off{opacity:.45;cursor:not-allowed}',
    '.tjd-ek__compteur{margin:0;font-size:.82rem;color:var(--muted,#5B6B84)}',
    '.tjd-ek__bouton{display:block;width:100%;min-height:44px;padding:11px 16px;font:inherit;font-size:1rem;font-weight:700;color:#fff;background:var(--navy,#1A2851);border:0;border-radius:var(--r-sm,8px);cursor:pointer;text-align:center;text-decoration:none}',
    '.tjd-ek .tjd-ek__bouton:hover{background:var(--navy-deep,#0F1A35);color:#fff}',
    '.tjd-ek__bouton[disabled]{opacity:.7;cursor:wait}',
    '.tjd-ek__rgpd{margin:0;font-size:.74rem;line-height:1.45;color:var(--muted,#5B6B84)}',
    '.tjd-ek__rgpd a{color:inherit;text-decoration:underline}',
    '.tjd-ek__piege{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}',
    '.tjd-ek__statut{margin:0;font-size:.88rem;line-height:1.5}',
    '.tjd-ek__statut:empty{display:none}',
    '.tjd-ek__statut--erreur{color:#B42318}',
    '.tjd-ek__statut button{margin:6px 6px 0 0;padding:6px 10px;font:inherit;font-size:.85rem;border:1px solid var(--navy,#1A2851);border-radius:6px;background:#fff;color:var(--navy,#1A2851);cursor:pointer}',
    '.tjd-ek__succes strong{display:block;margin-bottom:4px;font-size:1rem;color:var(--emerald,#257952)}',
    '.tjd-ek__succes p{margin:0 0 10px;font-size:.92rem;line-height:1.5;color:var(--body,#475569)}',
    '@container (min-width:520px){.tjd-ek__ligne{display:grid;grid-template-columns:1fr auto;gap:8px}}'
  ].join('\n');

  var DONNEES = null;
  function charger() {
    if (!DONNEES) {
      DONNEES = fetch('/assets/data/essai-majeures.json').then(function (r) { if (!r.ok) throw new Error('donnees'); return r.json(); });
    }
    return DONNEES;
  }

  function el(tag, attrs, texte) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (texte) n.textContent = texte;
    return n;
  }

  function estTestInterne() {
    try {
      if (window.tjdTestInterne === true) return true;
      if (typeof window.tjdEstTestInterne === 'function' && window.tjdEstTestInterne()) return true;
      if (new URLSearchParams(window.location.search).get('tjd_test') === '1') return true;
      return localStorage.getItem('tjd_internal_test') === '1';
    } catch (_) { return false; }
  }

  function mesurer(action, nom) {
    if (estTestInterne() || !window._paq || typeof window._paq.push !== 'function') return;
    window._paq.push(['trackEvent', 'Lead', action, nom]);
  }

  var compteurUid = 0;

  function monter(bloc, data) {
    if (bloc.getAttribute('data-tjd-ek-pret') === '1') return;
    bloc.setAttribute('data-tjd-ek-pret', '1');
    compteurUid += 1;
    var uid = 'tjd-ek-' + compteurUid;
    var valeur = (bloc.getAttribute('data-tjd-essai') || '').trim();
    var niveau = function (id) { var m = /L(\d)/.exec(data[id].titre); return m ? m[1] : '9'; };
    var ids = valeur === 'choix'
      ? Object.keys(data).sort(function (x, y) { return (niveau(x) + data[x].titre).localeCompare(niveau(y) + data[y].titre, 'fr'); })
      : valeur.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return data[s]; });
    if (!ids.length) return;
    var preselection = parseInt(bloc.getAttribute('data-preselection') || '', 10);
    var page = window.location.pathname.split('/').pop().replace('.html', '') || 'accueil';
    var demande = new URLSearchParams(window.location.search).get('produit');
    var defaut = bloc.getAttribute('data-defaut');
    var courant = ids.indexOf(demande) >= 0 ? demande : (ids.indexOf(defaut) >= 0 ? defaut : ids[0]);

    var carte = el('div', { 'class': 'tjd-ek' });
    var tete = el('div', { 'class': 'tjd-ek__tete' });
    tete.appendChild(el('span', { 'class': 'tjd-ek__icone', 'aria-hidden': 'true' }, '2'));
    var textes = el('div');
    textes.appendChild(el('p', { 'class': 'tjd-ek__titre' }, bloc.getAttribute('data-titre') || T.titre));
    var paragraphe = el('p', { 'class': 'tjd-ek__texte' });
    textes.appendChild(paragraphe);
    tete.appendChild(textes);
    carte.appendChild(tete);

    var form = el('form', { 'class': 'tjd-ek__form', novalidate: 'novalidate' });
    var select = null;
    if (ids.length > 1) {
      select = el('select', { 'class': 'tjd-ek__champ', id: uid + '-matiere', 'aria-label': T.matiere });
      ids.forEach(function (id) {
        var o = el('option', { value: id }, data[id].titre + ' · ' + data[id].nb + ' majeures');
        if (id === courant) o.selected = true;
        select.appendChild(o);
      });
      form.appendChild(select);
    }
    var liste = el('div', { 'class': 'tjd-ek__liste', role: 'group', 'aria-label': 'Majeures de la matière' });
    form.appendChild(liste);
    var compteur = el('p', { 'class': 'tjd-ek__compteur', 'aria-live': 'polite' });
    form.appendChild(compteur);
    var ligne = el('div', { 'class': 'tjd-ek__ligne' });
    var input = el('input', { 'class': 'tjd-ek__champ', id: uid + '-email', type: 'email', name: 'email', required: 'required',
      autocomplete: 'email', inputmode: 'email', placeholder: 'ton@email.com', 'aria-label': T.email });
    ligne.appendChild(input);
    var bouton = el('button', { 'class': 'tjd-ek__bouton', type: 'submit' }, T.bouton);
    ligne.appendChild(bouton);
    form.appendChild(ligne);
    var piege = el('div', { 'class': 'tjd-ek__piege', 'aria-hidden': 'true' });
    var champPiege = el('input', { type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off' });
    piege.appendChild(champPiege);
    form.appendChild(piege);
    var rgpd = el('p', { 'class': 'tjd-ek__rgpd' }, T.rgpd + ' ');
    rgpd.appendChild(el('a', { href: '/confidentialite.html' }, T.rgpdLien));
    rgpd.appendChild(document.createTextNode('.'));
    form.appendChild(rgpd);
    var statut = el('p', { 'class': 'tjd-ek__statut', role: 'status', 'aria-live': 'polite' });
    form.appendChild(statut);
    carte.appendChild(form);
    bloc.innerHTML = '';
    bloc.appendChild(carte);

    function coches() {
      return Array.prototype.slice.call(liste.querySelectorAll('input:checked')).map(function (c) { return parseInt(c.value, 10); });
    }
    function majCompteur() {
      var n = coches().length;
      compteur.textContent = T.compteur.replace('{n}', n).replace(/\{s\}/g, n > 1 ? 's' : '');
      Array.prototype.forEach.call(liste.querySelectorAll('input'), function (c) {
        var off = n >= 2 && !c.checked;
        c.disabled = off;
        c.parentNode.classList.toggle('tjd-ek__option--off', off);
      });
    }
    function afficher(id, initial) {
      courant = id;
      var m = data[id];
      paragraphe.textContent = bloc.getAttribute('data-texte') || (T.texte + (m.kit && m.kit.cp ? T.texteCp : ''));
      liste.innerHTML = '';
      var theme = null;
      m.majeures.forEach(function (x) {
        if (x.theme && x.theme !== theme) {
          theme = x.theme;
          liste.appendChild(el('p', { 'class': 'tjd-ek__theme' }, theme.replace(/^Th[èe]mes?\s*[\d et]*\s*[·.:]\s*/, '')));
        }
        var lab = el('label', { 'class': 'tjd-ek__option' });
        var c = el('input', { type: 'checkbox', value: String(x.i) });
        if (x.i === preselection && ids.length === 1) c.checked = true;
        lab.appendChild(c);
        lab.appendChild(el('span', null, x.num + '. ' + x.titre));
        liste.appendChild(lab);
      });
      majCompteur();
      try { document.dispatchEvent(new CustomEvent('tjd-essai-matiere', { detail: { produit: id, data: m, initial: !!initial } })); } catch (_) {}
    }
    liste.addEventListener('change', majCompteur);
    if (select) select.addEventListener('change', function () { afficher(select.value); });
    afficher(courant, !demande);

    var domaineConfirme = '';
    form.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      statut.textContent = '';
      statut.className = 'tjd-ek__statut';
      var choix = coches();
      if (choix.length !== 2) { statut.className += ' tjd-ek__statut--erreur'; statut.textContent = T.deux; return; }
      if (!input.value || !input.checkValidity()) { input.focus(); if (input.reportValidity) input.reportValidity(); return; }
      var email = input.value.trim();
      bouton.disabled = true;
      bouton.textContent = T.envoi;
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, essai: courant, majeures: choix, source: 'essai-majeures-' + page,
          site: champPiege.value, confirmerDomaine: domaineConfirme === email.toLowerCase() })
      }).then(function (reponse) {
        return reponse.json().catch(function () { return {}; }).then(function (d) {
          if (!reponse.ok) { var e = new Error('lead'); e.suggestion = d.suggestion; e.message429 = reponse.status === 429 && d.error; throw e; }
          return d;
        });
      }).then(function (d) {
        mesurer('essai-majeures', courant);
        var succes = el('div', { 'class': 'tjd-ek__succes', role: 'status', 'aria-live': 'polite' });
        succes.appendChild(el('strong', null, T.succesTitre));
        succes.appendChild(el('p', null, T.succes.replace('{email}', email)));
        var lien = el('a', { 'class': 'tjd-ek__bouton', href: d.kit || ('/api/kit-essai?m=' + courant + '&a=' + choix[0] + '&b=' + choix[1]), target: '_blank', rel: 'noopener' }, T.ouvrir);
        lien.addEventListener('click', function () { mesurer('essai-majeures-ouverture', courant); });
        succes.appendChild(lien);
        form.replaceWith(succes);
      }).catch(function (erreur) {
        bouton.disabled = false;
        bouton.textContent = T.bouton;
        statut.className = 'tjd-ek__statut tjd-ek__statut--erreur';
        statut.textContent = (erreur && erreur.message429) || T.erreur;
        if (erreur && erreur.suggestion) {
          statut.textContent = 'Le domaine de ton adresse ressemble à une faute de frappe. Tu peux choisir l’adresse à utiliser. ';
          var corriger = el('button', { type: 'button' }, 'Utiliser ' + erreur.suggestion);
          var garder = el('button', { type: 'button' }, 'Garder mon adresse');
          corriger.addEventListener('click', function () { input.value = erreur.suggestion; domaineConfirme = ''; form.requestSubmit(); });
          garder.addEventListener('click', function () { domaineConfirme = input.value.trim().toLowerCase(); form.requestSubmit(); });
          statut.appendChild(corriger);
          statut.appendChild(garder);
        }
      });
    });

    // Un lien [data-tjd-essai-ouvrir="maj-…"] ailleurs sur la page choisit la matière et descend jusqu'au bloc.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-tjd-essai-ouvrir]');
      if (!a) return;
      var id = a.getAttribute('data-tjd-essai-ouvrir');
      if (ids.indexOf(id) < 0) return;
      e.preventDefault();
      if (select) select.value = id;
      afficher(id);
      bloc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function demarrer() {
    var blocs = document.querySelectorAll('[data-tjd-essai]');
    if (!blocs.length) return;
    if (!document.getElementById('tjd-ek-styles')) {
      var style = document.createElement('style');
      style.id = 'tjd-ek-styles';
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    charger().then(function (data) {
      Array.prototype.forEach.call(blocs, function (b) { monter(b, data); });
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
