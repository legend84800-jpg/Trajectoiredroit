/* Plan détaillé du commentaire offert contre un email (test des pages d'arrêts du 20/10/2026).
   Remplit chaque [data-tjd-plan] avec un formulaire compact. data-plan donne l'identifiant
   de l'arrêt (clé de api/_plans-commentaires.json) et data-arret son nom affiché
   (« l'arrêt Manoukian »). Le formulaire poste { email, source, plan } vers /api/lead, qui
   inscrit le contact dans Brevo et envoie le PDF par email. Modèle de corrige-offert.js.
   Textes passés par redaction-julien le 20/10/2026. */
(function () {
  'use strict';

  var TEXTES = {
    titre: 'Le plan détaillé du commentaire, envoyé gratuitement par email',
    intro: 'Je t’envoie par email le plan du commentaire de {arret}. Il donne la problématique avec l’annonce du plan, puis le paragraphe qui présente chacune des deux parties. Tu peux donc t’en servir pour construire ta propre copie avant le TD.',
    email: 'Ton email',
    bouton: 'Recevoir le plan',
    envoi: 'Envoi…',
    rgpd: 'En validant, tu reçois ce plan et les emails de Trajectoire Droit.',
    rgpdLien: 'Politique de confidentialité',
    succesTitre: 'C’est envoyé.',
    succes: 'Le plan part à l’adresse {email}. Si tu ne le vois pas d’ici quelques minutes, il se trouve sans doute dans les spams ou dans l’onglet Promotions.',
    erreur: 'L’envoi n’a pas fonctionné. Vérifie ton adresse email, puis réessaie dans quelques secondes.'
  };

  var CSS = [
    '.tjd-pc{box-sizing:border-box;margin:28px 0;padding:20px 18px;background:var(--gold-bg,#FBF8EE);border:1px solid var(--gold-line,#C9A961);border-radius:var(--r-md,12px);font-family:inherit;color:var(--ink,#0F172A);scroll-margin-top:90px}',
    '.tjd-pc *{box-sizing:border-box}',
    '.tjd-pc__titre{margin:0 0 6px;font-size:1.15rem;line-height:1.3;font-weight:700;color:var(--navy,#1A2851)}',
    '.tjd-pc__intro{margin:0 0 14px;font-size:.95rem;line-height:1.5;color:var(--body,#475569)}',
    '.tjd-pc__form{display:grid;gap:10px;margin:0}',
    '.tjd-pc__label{display:block;margin:0 0 4px;font-size:.8rem;font-weight:600;color:var(--navy,#1A2851)}',
    '.tjd-pc__champ{display:block;width:100%;min-height:44px;padding:10px 12px;font:inherit;font-size:16px;color:var(--ink,#0F172A);background:#fff;border:1px solid var(--border-strong,#CBD5E1);border-radius:var(--r-sm,8px)}',
    '.tjd-pc__champ:focus{outline:2px solid var(--navy,#1A2851);outline-offset:1px;border-color:var(--navy,#1A2851)}',
    '.tjd-pc__bouton{display:block;width:100%;min-height:46px;padding:12px 16px;font:inherit;font-size:1rem;font-weight:700;color:#fff;background:var(--navy,#1A2851);border:0;border-radius:var(--r-sm,8px);cursor:pointer}',
    '.tjd-pc .tjd-pc__bouton:hover{background:var(--navy-deep,#0F1A35);color:#fff}',
    '.tjd-pc__bouton[disabled]{opacity:.7;cursor:wait}',
    '.tjd-pc__rgpd{margin:2px 0 0;font-size:.75rem;line-height:1.45;color:var(--muted,#5B6B84)}',
    '.tjd-pc__rgpd a{color:inherit;text-decoration:underline}',
    '.tjd-pc__piege{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}',
    '.tjd-pc__statut{margin:0;font-size:.9rem;line-height:1.5}',
    '.tjd-pc__statut--erreur{color:#B42318}',
    '.tjd-pc__statut button{margin:6px 6px 0 0;padding:6px 10px;font:inherit;font-size:.85rem;border:1px solid var(--navy,#1A2851);border-radius:6px;background:#fff;color:var(--navy,#1A2851);cursor:pointer}',
    '.tjd-pc__succes strong{display:block;margin-bottom:4px;font-size:1.05rem;color:var(--emerald,#257952)}',
    '.tjd-pc__succes p{margin:0;font-size:.95rem;line-height:1.5;color:var(--body,#475569)}',
    '@media (min-width:600px){.tjd-pc{padding:24px 26px}.tjd-pc__form{grid-template-columns:1fr auto;align-items:end}.tjd-pc__rgpd,.tjd-pc__statut{grid-column:1 / -1}}'
  ].join('\n');

  function injecterStyles() {
    if (document.getElementById('tjd-pc-styles')) return;
    var style = document.createElement('style');
    style.id = 'tjd-pc-styles';
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

  function monter(bloc, index) {
    if (bloc.getAttribute('data-tjd-pc-pret') === '1') return;
    bloc.setAttribute('data-tjd-pc-pret', '1');
    var plan = bloc.getAttribute('data-plan') || '';
    var arret = bloc.getAttribute('data-arret') || 'cet arrêt';
    var uid = 'tjd-pc-' + index;

    var carte = el('div', { 'class': 'tjd-pc' });
    carte.appendChild(el('p', { 'class': 'tjd-pc__titre' }, TEXTES.titre));
    carte.appendChild(el('p', { 'class': 'tjd-pc__intro' }, TEXTES.intro.replace('{arret}', arret)));

    var form = el('form', { 'class': 'tjd-pc__form', novalidate: 'novalidate' });
    var ligneEmail = el('div');
    ligneEmail.appendChild(el('label', { 'class': 'tjd-pc__label', 'for': uid + '-email' }, TEXTES.email));
    var input = el('input', {
      'class': 'tjd-pc__champ', id: uid + '-email', type: 'email', name: 'email',
      required: 'required', autocomplete: 'email', inputmode: 'email', placeholder: 'ton@email.com'
    });
    ligneEmail.appendChild(input);
    form.appendChild(ligneEmail);

    var piege = el('div', { 'class': 'tjd-pc__piege', 'aria-hidden': 'true' });
    var champPiege = el('input', { type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off' });
    piege.appendChild(champPiege);
    form.appendChild(piege);

    var bouton = el('button', { 'class': 'tjd-pc__bouton', type: 'submit' }, TEXTES.bouton);
    form.appendChild(bouton);

    var rgpd = el('p', { 'class': 'tjd-pc__rgpd' }, TEXTES.rgpd + ' ');
    rgpd.appendChild(el('a', { href: '/confidentialite.html' }, TEXTES.rgpdLien));
    rgpd.appendChild(document.createTextNode('.'));
    form.appendChild(rgpd);

    var statut = el('p', { 'class': 'tjd-pc__statut', role: 'status', 'aria-live': 'polite' });
    form.appendChild(statut);
    carte.appendChild(form);
    bloc.innerHTML = '';
    bloc.appendChild(carte);

    var domaineConfirme = '';
    form.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      statut.textContent = '';
      statut.className = 'tjd-pc__statut';
      if (!input.value || !input.checkValidity()) { input.focus(); input.reportValidity && input.reportValidity(); return; }
      var email = input.value.trim();
      bouton.disabled = true;
      bouton.textContent = TEXTES.envoi;

      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'plan-commentaire', plan: plan, site: champPiege.value,
          confirmerDomaine: domaineConfirme === email.toLowerCase() })
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
        if (!estTestInterne() && window._paq && typeof window._paq.push === 'function') {
          window._paq.push(['trackEvent', 'lead', 'plan-commentaire', plan]);
        }
        var succes = el('div', { 'class': 'tjd-pc__succes', role: 'status', 'aria-live': 'polite' });
        succes.appendChild(el('strong', null, TEXTES.succesTitre));
        succes.appendChild(el('p', null, TEXTES.succes.replace('{email}', email)));
        form.replaceWith(succes);
      }).catch(function (erreur) {
        bouton.disabled = false;
        bouton.textContent = TEXTES.bouton;
        statut.className = 'tjd-pc__statut tjd-pc__statut--erreur';
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
    var blocs = document.querySelectorAll('[data-tjd-plan]');
    if (!blocs.length) return;
    injecterStyles();
    Array.prototype.forEach.call(blocs, monter);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
