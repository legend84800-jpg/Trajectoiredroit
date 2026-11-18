/* Formulaire des deux majeures offertes, commun aux pages du site. */
(function () {
  'use strict';

  var CSS = [
    '#essai-majeures{scroll-margin-top:100px}',
    '.tjd-ek{box-sizing:border-box;max-width:680px;margin:22px auto 6px;padding:22px 22px 18px;background:var(--white,#fff);border:1px solid var(--border,#E2E8F0);border-radius:var(--r-lg,14px);text-align:left;container-type:inline-size}',
    '.tjd-ek *{box-sizing:border-box}',
    '.tjd-ek__titre{margin:0 0 6px;font-family:"Spectral",Georgia,serif;font-size:1.35rem;line-height:1.3;font-weight:600;color:var(--navy,#1A2851)}',
    '.tjd-ek__texte{margin:0 0 14px;font-size:.92rem;line-height:1.5;color:var(--body,#475569)}',
    '.tjd-ek__form{display:grid;gap:10px;margin:0}',
    '.tjd-ek__ligne{display:grid;gap:8px}',
    '.tjd-ek__champ{display:block;width:100%;min-width:0;min-height:44px;padding:10px 12px;font:inherit;font-size:16px;color:var(--ink,#0F172A);background:var(--white,#fff);border:1px solid var(--border-strong,#CBD5E1);border-radius:var(--r-sm,8px)}',
    '.tjd-ek__champ:focus{outline:2px solid var(--navy,#1A2851);outline-offset:1px}',
    '.tjd-ek__bouton{display:block;width:100%;min-height:44px;padding:11px 16px;font:inherit;font-size:1rem;font-weight:700;color:#fff;background:#1A2851;border:0;border-radius:var(--r-sm,8px);cursor:pointer;text-align:center;text-decoration:none}',
    '.tjd-ek .tjd-ek__bouton:hover{background:#0F1A35;color:#fff}',
    '.tjd-ek .tjd-ek__bouton:focus-visible{outline:2px solid var(--ink,#0F172A);outline-offset:2px}',
    '.tjd-ek__bouton[disabled]{opacity:.7;cursor:wait}',
    '.tjd-ek__rgpd{margin:0;font-size:.78rem;line-height:1.45;color:var(--muted,#5B6B84)}',
    '.tjd-ek__rgpd a{color:inherit;text-decoration:underline}',
    '.tjd-ek__piege{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}',
    '.tjd-ek__statut{margin:0;font-size:.88rem;line-height:1.5;overflow-wrap:anywhere}',
    '.tjd-ek__statut:empty{margin:0;line-height:0}',
    '.tjd-ek__statut--erreur{color:var(--error,#B42318)}',
    '.tjd-ek__succes p{margin:0 0 10px;font-size:.92rem;line-height:1.5;color:var(--body,#475569);overflow-wrap:anywhere}',
    '@container (min-width:520px){.tjd-ek__ligne{grid-template-columns:minmax(0,1fr) auto}}'
  ].join('\n');

  var LABEL_BOUTON = 'Recevoir les deux majeures';
  var CAMPAGNE = 'kit-essai-majeures';
  var CATEGORIE = 'majeures-preparees';

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

  function monter(bloc) {
    if (bloc.getAttribute('data-tjd-ek-pret') === '1') return;
    bloc.setAttribute('data-tjd-ek-pret', '1');

    var page = window.location.pathname.split('/').pop().replace('.html', '') || 'accueil';
    var carte = el('div', { 'class': 'tjd-ek' });
    carte.appendChild(el('h2', { 'class': 'tjd-ek__titre' }, 'Deux majeures offertes'));
    var intro = el('p', { 'class': 'tjd-ek__texte' }, 'Laisse ton adresse email pour recevoir les deux majeures.');
    carte.appendChild(intro);

    var form = el('form', { 'class': 'tjd-ek__form' });
    var ligne = el('div', { 'class': 'tjd-ek__ligne' });
    var input = el('input', {
      'class': 'tjd-ek__champ', type: 'email', name: 'email', required: '',
      autocomplete: 'email', inputmode: 'email', placeholder: 'Ton adresse email', 'aria-label': 'Ton adresse email'
    });
    var bouton = el('button', { 'class': 'tjd-ek__bouton', type: 'submit' }, LABEL_BOUTON);
    ligne.append(input, bouton);
    form.appendChild(ligne);

    var piege = el('div', { 'class': 'tjd-ek__piege', 'aria-hidden': 'true' });
    var champPiege = el('input', { type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off' });
    piege.appendChild(champPiege);
    form.appendChild(piege);

    var rgpd = el('p', { 'class': 'tjd-ek__rgpd' }, 'En validant, tu reçois aussi les emails de Trajectoire Droit. ');
    rgpd.append(el('a', { href: '/confidentialite.html' }, 'Politique de confidentialité'), '.');
    var statut = el('p', { 'class': 'tjd-ek__statut', role: 'status' });
    form.append(rgpd, statut);
    carte.appendChild(form);
    bloc.replaceChildren(carte);

    var domaineAConfirmer = '';
    form.addEventListener('submit', async function (evenement) {
      evenement.preventDefault();
      if (bouton.disabled) return;
      var email = input.value.trim();
      statut.textContent = '';
      bouton.disabled = true;
      bouton.textContent = 'Envoi…';

      try {
        var reponse = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email, essai: true, source: 'essai-majeures-' + page,
            site: champPiege.value, confirmerDomaine: domaineAConfirmer === email.toLowerCase()
          })
        });
        var d = await reponse.json();
        if (reponse.status === 409 && d.suggestion) {
          domaineAConfirmer = email.toLowerCase();
          statut.textContent = 'Vérifie ton adresse email. Tu voulais peut-être écrire ' + d.suggestion + '. Pour garder ton adresse, valide à nouveau.';
          input.focus();
          return;
        }
        if (reponse.status === 429) {
          statut.textContent = d.error;
          return;
        }
        if (!reponse.ok || !d.kit) throw new Error('lead');

        if (d.envoye) {
          mesurer('essai-majeures', CATEGORIE);
          try {
            if (!estTestInterne() && localStorage.getItem('tjd_consent') === 'granted' && typeof window.fbq === 'function') {
              window.fbq('track', 'Lead', { content_name: CAMPAGNE, content_category: CATEGORIE });
            }
          } catch (_) {}
        }
        var succes = el('div', { 'class': 'tjd-ek__succes', role: 'status' });
        if (d.envoye) succes.appendChild(el('p', null, 'Les deux majeures ont été envoyées à ' + email + '.'));
        var lien = el('a', { 'class': 'tjd-ek__bouton', href: d.kit, target: '_blank', rel: 'noopener' }, 'Ouvrir les deux majeures');
        lien.addEventListener('click', function () { mesurer('essai-majeures-ouverture', CATEGORIE); });
        succes.appendChild(lien);
        intro.remove();
        form.replaceWith(succes);
        lien.focus();
      } catch (_) {
        statut.textContent = 'L’envoi a échoué. Réessaie dans quelques secondes.';
      } finally {
        statut.classList.toggle('tjd-ek__statut--erreur', Boolean(statut.textContent));
        bouton.disabled = false;
        bouton.textContent = LABEL_BOUTON;
      }
    });
  }

  function demarrer() {
    var blocs = document.querySelectorAll('[data-tjd-essai]');
    if (!blocs.length) return;
    var style = el('style', { id: 'tjd-ek-styles' }, CSS);
    document.head.appendChild(style);
    blocs.forEach(monter);

    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-tjd-essai-ouvrir]');
      if (a) mesurer('essai-majeures-ouvrir', a.getAttribute('data-emplacement') || 'page');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
