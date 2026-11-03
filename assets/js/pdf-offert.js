/* PDF offert en premier écran contre un email (03/11/2026).
   Remplit chaque [data-tjd-pdf-offert] avec une carte compacte placée sous l'en-tête
   des pages gratuites. Le type choisit la branche de /api/lead :
     fiche     data-id = slug de api/_fiches-arrets.json (pages « arrêt expliqué »)
     exercice  data-id = id de api/_corriges-exercices.json
     matiere   data-id = id cas-pratique-* (sans data-id, un menu propose les matières)
   data-titre et data-texte portent les textes de la page, passés par redaction-julien.
   Mesure Matomo : catégorie Lead, action pdf-premier-ecran, nom type:id.
   Autonome, sans dépendance, styles injectés une seule fois. */
(function () {
  'use strict';

  var TEXTES = {
    email: 'Ton email',
    bouton: 'Recevoir le PDF',
    envoi: 'Envoi…',
    choisir: 'Choisis ta matière',
    rgpd: 'En validant, tu reçois ce PDF et les emails de Trajectoire Droit.',
    rgpdLien: 'Politique de confidentialité',
    succesTitre: 'C’est envoyé.',
    succes: 'Le PDF part à l’adresse {email}. Si tu ne le vois pas d’ici quelques minutes, il se trouve sans doute dans les spams ou dans l’onglet Promotions.',
    erreur: 'L’envoi n’a pas fonctionné. Vérifie ton adresse email, puis réessaie dans quelques secondes.'
  };

  var CSS = [
    '.tjd-po{box-sizing:border-box;max-width:680px;margin:18px auto 6px;padding:16px 16px 14px;background:var(--gold-bg,#FBF8EE);border:1px solid var(--gold-line,#C9A961);border-radius:var(--r-md,12px);font-family:inherit;color:var(--ink,#0F172A);text-align:left;container-type:inline-size}',
    '.tjd-po *{box-sizing:border-box}',
    '.tjd-po__tete{display:flex;gap:12px;align-items:flex-start;margin:0 0 10px}',
    '.tjd-po__icone{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:38px;height:46px;border-radius:5px;background:#fff;border:1px solid var(--gold-line,#C9A961);font:700 .7rem/1 Arial,sans-serif;color:#9B1C2C;letter-spacing:.04em}',
    '.tjd-po__titre{margin:0 0 4px;font-size:1.05rem;line-height:1.3;font-weight:700;color:var(--navy,#1A2851)}',
    '.tjd-po__texte{margin:0;font-size:.92rem;line-height:1.5;color:var(--body,#475569)}',
    '.tjd-po__form{display:grid;gap:8px;margin:0}',
    '.tjd-po__champ{display:block;width:100%;min-height:44px;padding:10px 12px;font:inherit;font-size:16px;color:var(--ink,#0F172A);background:#fff;border:1px solid var(--border-strong,#CBD5E1);border-radius:var(--r-sm,8px)}',
    '.tjd-po__champ:focus{outline:2px solid var(--navy,#1A2851);outline-offset:1px;border-color:var(--navy,#1A2851)}',
    '.tjd-po__bouton{display:block;width:100%;min-height:44px;padding:11px 16px;font:inherit;font-size:1rem;font-weight:700;color:#fff;background:var(--navy,#1A2851);border:0;border-radius:var(--r-sm,8px);cursor:pointer;white-space:nowrap}',
    '.tjd-po .tjd-po__bouton:hover{background:var(--navy-deep,#0F1A35);color:#fff}',
    '.tjd-po__bouton[disabled]{opacity:.7;cursor:wait}',
    '.tjd-po__rgpd{margin:0;font-size:.74rem;line-height:1.45;color:var(--muted,#5B6B84)}',
    '.tjd-po__rgpd a{color:inherit;text-decoration:underline}',
    '.tjd-po__piege{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}',
    '.tjd-po__statut{margin:0;font-size:.88rem;line-height:1.5}',
    '.tjd-po__statut:empty{display:none}',
    '.tjd-po__statut--erreur{color:#B42318}',
    '.tjd-po__statut button{margin:6px 6px 0 0;padding:6px 10px;font:inherit;font-size:.85rem;border:1px solid var(--navy,#1A2851);border-radius:6px;background:#fff;color:var(--navy,#1A2851);cursor:pointer}',
    '.tjd-po__succes strong{display:block;margin-bottom:4px;font-size:1rem;color:var(--emerald,#257952)}',
    '.tjd-po__succes p{margin:0;font-size:.92rem;line-height:1.5;color:var(--body,#475569)}',
    '@container (min-width:520px){.tjd-po__form{grid-template-columns:1fr auto}.tjd-po__form--menu{grid-template-columns:1fr 1fr auto}.tjd-po__rgpd,.tjd-po__statut{grid-column:1 / -1}}'
  ].join('\n');

  function injecterStyles() {
    if (document.getElementById('tjd-po-styles')) return;
    var style = document.createElement('style');
    style.id = 'tjd-po-styles';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function estTestInterne() {
    try {
      if (window.tjdTestInterne === true) return true;
      if (typeof window.tjdEstTestInterne === 'function' && window.tjdEstTestInterne()) return true;
      if (new URLSearchParams(window.location.search).get('tjd_test') === '1') return true;
      return localStorage.getItem('tjd_internal_test') === '1';
    } catch (_) {
      return false;
    }
  }

  function el(tag, attrs, texte) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (texte) n.textContent = texte;
    return n;
  }

  function mesurer(action, nom) {
    if (estTestInterne() || !window._paq || typeof window._paq.push !== 'function') return;
    window._paq.push(['trackEvent', 'Lead', action, nom]);
  }

  var compteur = 0;

  function monter(bloc) {
    if (bloc.getAttribute('data-tjd-po-pret') === '1') return;
    var type = bloc.getAttribute('data-tjd-pdf-offert');
    if (['fiche', 'exercice', 'matiere'].indexOf(type) < 0) return;
    bloc.setAttribute('data-tjd-po-pret', '1');
    compteur += 1;
    var uid = 'tjd-po-' + compteur;
    var id = bloc.getAttribute('data-id') || '';
    var page = window.location.pathname.split('/').pop().replace('.html', '') || 'accueil';

    var carte = el('div', { 'class': 'tjd-po' });
    var tete = el('div', { 'class': 'tjd-po__tete' });
    tete.appendChild(el('span', { 'class': 'tjd-po__icone', 'aria-hidden': 'true' }, 'PDF'));
    var textes = el('div');
    textes.appendChild(el('p', { 'class': 'tjd-po__titre' }, bloc.getAttribute('data-titre') || ''));
    textes.appendChild(el('p', { 'class': 'tjd-po__texte' }, bloc.getAttribute('data-texte') || ''));
    tete.appendChild(textes);
    carte.appendChild(tete);

    var form = el('form', { 'class': 'tjd-po__form', novalidate: 'novalidate' });
    var select = null;
    if (type === 'matiere' && !id) {
      form.className += ' tjd-po__form--menu';
      select = el('select', { 'class': 'tjd-po__champ', id: uid + '-matiere', name: 'matiere', required: 'required', 'aria-label': TEXTES.choisir });
      select.appendChild(el('option', { value: '' }, TEXTES.choisir));
      form.appendChild(select);
      fetch('/api/corriges-offerts').then(function (r) { return r.ok ? r.json() : { offres: [] }; })
        .then(function (d) {
          (d.offres || []).forEach(function (o) { select.appendChild(el('option', { value: o.id }, o.matiere)); });
        }).catch(function () {});
    }
    var input = el('input', {
      'class': 'tjd-po__champ', id: uid + '-email', type: 'email', name: 'email', required: 'required',
      autocomplete: 'email', inputmode: 'email', placeholder: 'ton@email.com', 'aria-label': TEXTES.email
    });
    form.appendChild(input);
    var piege = el('div', { 'class': 'tjd-po__piege', 'aria-hidden': 'true' });
    var champPiege = el('input', { type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off' });
    piege.appendChild(champPiege);
    form.appendChild(piege);
    var bouton = el('button', { 'class': 'tjd-po__bouton', type: 'submit' }, bloc.getAttribute('data-bouton') || TEXTES.bouton);
    form.appendChild(bouton);
    var rgpd = el('p', { 'class': 'tjd-po__rgpd' }, TEXTES.rgpd + ' ');
    rgpd.appendChild(el('a', { href: '/confidentialite.html' }, TEXTES.rgpdLien));
    rgpd.appendChild(document.createTextNode('.'));
    form.appendChild(rgpd);
    var statut = el('p', { 'class': 'tjd-po__statut', role: 'status', 'aria-live': 'polite' });
    form.appendChild(statut);
    carte.appendChild(form);
    bloc.innerHTML = '';
    bloc.appendChild(carte);

    var domaineConfirme = '';
    var libelle = bouton.textContent;
    form.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      statut.textContent = '';
      statut.className = 'tjd-po__statut';
      var valeur = select ? select.value : id;
      if (!valeur) { select.focus(); if (select.reportValidity) select.reportValidity(); return; }
      if (!input.value || !input.checkValidity()) { input.focus(); if (input.reportValidity) input.reportValidity(); return; }
      var email = input.value.trim();
      var corps = { email: email, source: 'pdf-premier-ecran-' + page, site: champPiege.value, confirmerDomaine: domaineConfirme === email.toLowerCase() };
      corps[type] = valeur;
      bouton.disabled = true;
      bouton.textContent = TEXTES.envoi;

      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps)
      }).then(function (reponse) {
        return reponse.json().catch(function () { return {}; }).then(function (donnees) {
          if (!reponse.ok) {
            var e = new Error('lead');
            e.suggestion = donnees.suggestion;
            e.message429 = reponse.status === 429 && donnees && donnees.error;
            throw e;
          }
          return donnees;
        });
      }).then(function () {
        mesurer('pdf-premier-ecran', type + ':' + valeur);
        var succes = el('div', { 'class': 'tjd-po__succes', role: 'status', 'aria-live': 'polite' });
        succes.appendChild(el('strong', null, TEXTES.succesTitre));
        succes.appendChild(el('p', null, TEXTES.succes.replace('{email}', email)));
        form.replaceWith(succes);
      }).catch(function (erreur) {
        bouton.disabled = false;
        bouton.textContent = libelle;
        statut.className = 'tjd-po__statut tjd-po__statut--erreur';
        statut.textContent = (erreur && erreur.message429) || TEXTES.erreur;
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
  }

  function demarrer() {
    var blocs = document.querySelectorAll('[data-tjd-pdf-offert]');
    if (!blocs.length) return;
    injecterStyles();
    Array.prototype.forEach.call(blocs, monter);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
