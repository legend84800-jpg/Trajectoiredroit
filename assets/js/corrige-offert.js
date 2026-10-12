/* Cas pratique corrigé offert contre un email (lot C du chantier conversion, 10/10/2026).
   Remplit chaque [data-tjd-corrige-offert] avec un formulaire compact. data-matiere
   présélectionne la matière (id cas-pratique-* de api/_produits.js). Le formulaire poste
   { email, source, matiere } vers /api/lead, qui inscrit le contact dans Brevo et envoie
   le PDF par email. Autonome, sans dépendance, styles injectés une seule fois.
   Textes passés par redaction-julien le 10/10/2026. */
(function () {
  'use strict';

  var MATIERES = [
    ['Licence 1', [
      ['cas-pratique-intro-droit-l1', 'Introduction au droit L1 S1'],
      ['cas-pratique-personnes-l1', 'Droit des personnes L1'],
      ['cas-pratique-famille-l1-s2', 'Droit de la famille L1 S2'],
      ['cas-pratique-penal-general-l1', 'Droit pénal général L1 S2']
    ]],
    ['Licence 2', [
      ['cas-pratique-da-l2-s1', 'Droit administratif L2 S1'],
      ['cas-pratique-da-l2-s2', 'Droit administratif L2 S2'],
      ['cas-pratique-contrats-l2-s1', 'Droit des contrats L2 S1'],
      ['cas-pratique-obligations-l2-s2', 'Droit des obligations L2 S2'],
      ['cas-pratique-penal-l2-s1', 'Droit pénal L2 S1'],
      ['cas-pratique-biens-l2', 'Droit des biens L2']
    ]],
    ['Licence 3', [
      ['cas-pratique-commercial-l3-s1', 'Droit commercial L3 S1'],
      ['cas-pratique-commercial-l3-s2', 'Droit commercial L3 S2'],
      ['cas-pratique-contrats-speciaux-l3', 'Contrats spéciaux L3'],
      ['cas-pratique-societes-l3', 'Droit des sociétés L3'],
      ['cas-pratique-societes-l3-s2', 'Droit des sociétés L3 S2'],
      ['cas-pratique-travail-l3', 'Droit du travail L3'],
      ['cas-pratique-procedure-penale-l3', 'Procédure pénale L3']
    ]]
  ];

  var TEXTES = {
    titre: 'Un cas pratique corrigé offert, en PDF',
    intro: 'Tu choisis ta matière, et tu reçois par email un cas pratique complet, avec son énoncé et son corrigé.',
    matiere: 'Matière',
    choisir: 'Choisis ta matière',
    email: 'Ton email',
    bouton: 'Recevoir le corrigé',
    envoi: 'Envoi…',
    rgpd: 'En validant, tu reçois ce corrigé et les emails de Trajectoire Droit. Tu peux te désinscrire en un clic.',
    rgpdLien: 'Politique de confidentialité',
    succesTitre: 'C’est envoyé.',
    succes: 'Le PDF part à l’adresse {email}. Si tu ne le vois pas d’ici quelques minutes, il se trouve sans doute dans les spams ou dans l’onglet Promotions.',
    erreur: 'L’envoi n’a pas fonctionné. Vérifie ton adresse email, puis réessaie dans quelques secondes.'
  };

  var CSS = [
    '.tjd-co{box-sizing:border-box;max-width:640px;margin:24px auto;padding:20px 18px;background:var(--gold-bg,#FBF8EE);border:1px solid var(--gold-line,#C9A961);border-radius:var(--r-md,12px);font-family:inherit;color:var(--ink,#0F172A)}',
    '.tjd-co *{box-sizing:border-box}',
    '.tjd-co__titre{margin:0 0 6px;font-size:1.15rem;line-height:1.3;font-weight:700;color:var(--navy,#1A2851)}',
    '.tjd-co__intro{margin:0 0 14px;font-size:.95rem;line-height:1.5;color:var(--body,#475569)}',
    '.tjd-co__form{display:grid;gap:10px;margin:0}',
    '.tjd-co__label{display:block;margin:0 0 4px;font-size:.8rem;font-weight:600;color:var(--navy,#1A2851)}',
    '.tjd-co__champ{display:block;width:100%;min-height:44px;padding:10px 12px;font:inherit;font-size:16px;color:var(--ink,#0F172A);background:#fff;border:1px solid var(--border-strong,#CBD5E1);border-radius:var(--r-sm,8px)}',
    '.tjd-co__champ:focus{outline:2px solid var(--navy,#1A2851);outline-offset:1px;border-color:var(--navy,#1A2851)}',
    '.tjd-co__bouton{display:block;width:100%;min-height:46px;padding:12px 16px;font:inherit;font-size:1rem;font-weight:700;color:#fff;background:var(--navy,#1A2851);border:0;border-radius:var(--r-sm,8px);cursor:pointer}',
    '.tjd-co .tjd-co__bouton:hover{background:var(--navy-deep,#0F1A35);color:#fff}',
    '.tjd-co__bouton[disabled]{opacity:.7;cursor:wait}',
    '.tjd-co__rgpd{margin:2px 0 0;font-size:.75rem;line-height:1.45;color:var(--muted,#5B6B84)}',
    '.tjd-co__rgpd a{color:inherit;text-decoration:underline}',
    '.tjd-co__piege{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}',
    '.tjd-co__statut{margin:0;font-size:.9rem;line-height:1.5}',
    '.tjd-co__statut--erreur{color:#B42318}',
    '.tjd-co__succes{padding:4px 0}',
    '.tjd-co__succes strong{display:block;margin-bottom:4px;font-size:1.05rem;color:var(--emerald,#257952)}',
    '.tjd-co__succes p{margin:0;font-size:.95rem;line-height:1.5;color:var(--body,#475569)}',
    '.tjd-co{container-type:inline-size}',
    '@media (min-width:600px){.tjd-co{padding:24px 26px}}',
    '@container (min-width:500px){.tjd-co__form{grid-template-columns:1fr 1fr;align-items:end}.tjd-co__ligne--large,.tjd-co__rgpd,.tjd-co__statut{grid-column:1 / -1}}'
  ].join('\n');

  function injecterStyles() {
    if (document.getElementById('tjd-co-styles')) return;
    var style = document.createElement('style');
    style.id = 'tjd-co-styles';
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

  var compteur = 0;
  var cataloguePromesse;
  function catalogue() {
    if (!cataloguePromesse) cataloguePromesse = fetch('/api/corriges-offerts')
      .then(function (r) { if (!r.ok) throw new Error('catalogue'); return r.json(); })
      .then(function (d) { return Array.isArray(d.offres) ? d.offres : []; })
      .catch(function () { return []; });
    return cataloguePromesse;
  }

  function montrerSuite(bloc, id) {
    bloc.setAttribute('data-matiere-suite', id);
    catalogue().then(function (offres) {
      if (bloc.getAttribute('data-matiere-suite') !== id) return;
      var offre = offres.find(function (o) { return o.id === id; });
      bloc.innerHTML = '';
      bloc.hidden = !offre;
      if (!offre) return;
      bloc.appendChild(el('h3', { 'class': 'tjd-co__titre' }, 'Pour continuer en ' + offre.matiere));
      bloc.appendChild(el('p', { 'class': 'tjd-co__intro' }, 'Le PDF offert contient un cas pratique, avec son énoncé et son corrigé complet.'));
      bloc.appendChild(el('p', { 'class': 'tjd-co__intro' }, 'Le recueil complet réunit ' + offre.cas + ' cas pratiques, dont celui qui est offert, et ' + offre.partiels + ' sujets de partiel. Tous sont corrigés avec la même méthode. Tu disposes donc de ' + (offre.cas - 1) + ' autres cas et de ' + offre.partiels + ' sujets de partiel pour t’entraîner sur les autres thèmes du cours.'));
      bloc.appendChild(el('a', { href: offre.url, 'class': 'tjd-co__bouton', style: 'text-align:center;text-decoration:none' }, 'Voir le recueil complet · ' + (offre.prix / 100).toFixed(2).replace('.', ',') + ' €'));
    });
  }

  function monter(bloc) {
    if (bloc.hasAttribute('data-exercice')) return;
    if (bloc.getAttribute('data-tjd-co-pret') === '1') return;
    bloc.setAttribute('data-tjd-co-pret', '1');
    compteur += 1;
    var uid = 'tjd-co-' + compteur;
    var preselection = bloc.getAttribute('data-matiere') || '';
    if (!preselection) {
      try { preselection = new URLSearchParams(window.location.search).get('matiere') || ''; } catch (_) {}
    }
    var sourcePage = bloc.getAttribute('data-source')
      || ('corrige-offert-' + (window.location.pathname.split('/').pop().replace('.html', '') || 'accueil'));

    var carte = el('div', { 'class': 'tjd-co' });
    carte.appendChild(el('p', { 'class': 'tjd-co__titre' }, TEXTES.titre));
    carte.appendChild(el('p', { 'class': 'tjd-co__intro' }, TEXTES.intro));

    var form = el('form', { 'class': 'tjd-co__form', novalidate: 'novalidate' });

    var ligneMatiere = el('div', { 'class': 'tjd-co__ligne' });
    ligneMatiere.appendChild(el('label', { 'class': 'tjd-co__label', 'for': uid + '-matiere' }, TEXTES.matiere));
    var select = el('select', { 'class': 'tjd-co__champ', id: uid + '-matiere', name: 'matiere', required: 'required' });
    var vide = el('option', { value: '' }, TEXTES.choisir);
    select.appendChild(vide);
    var trouvee = false;
    MATIERES.forEach(function (groupe) {
      var og = el('optgroup', { label: groupe[0] });
      groupe[1].forEach(function (m) {
        var opt = el('option', { value: m[0] }, m[1]);
        if (m[0] === preselection) { opt.selected = true; trouvee = true; }
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
    if (!trouvee) vide.selected = true;
    ligneMatiere.appendChild(select);
    form.appendChild(ligneMatiere);

    var ligneEmail = el('div', { 'class': 'tjd-co__ligne' });
    ligneEmail.appendChild(el('label', { 'class': 'tjd-co__label', 'for': uid + '-email' }, TEXTES.email));
    var input = el('input', {
      'class': 'tjd-co__champ', id: uid + '-email', type: 'email', name: 'email',
      required: 'required', autocomplete: 'email', inputmode: 'email', placeholder: 'ton@email.com'
    });
    ligneEmail.appendChild(input);
    form.appendChild(ligneEmail);

    var piege = el('div', { 'class': 'tjd-co__piege', 'aria-hidden': 'true' });
    var champPiege = el('input', { type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off' });
    piege.appendChild(champPiege);
    form.appendChild(piege);

    var ligneBouton = el('div', { 'class': 'tjd-co__ligne tjd-co__ligne--large' });
    var bouton = el('button', { 'class': 'tjd-co__bouton', type: 'submit' }, TEXTES.bouton);
    ligneBouton.appendChild(bouton);
    form.appendChild(ligneBouton);

    var rgpd = el('p', { 'class': 'tjd-co__rgpd' }, TEXTES.rgpd + ' ');
    rgpd.appendChild(el('a', { href: '/confidentialite.html' }, TEXTES.rgpdLien));
    rgpd.appendChild(document.createTextNode('.'));
    form.appendChild(rgpd);

    var statut = el('p', { 'class': 'tjd-co__statut', role: 'status', 'aria-live': 'polite' });
    var domaineConfirme = '';
    form.appendChild(statut);

    carte.appendChild(form);
    var suite = el('section', { 'class': 'tjd-co__suite', style: 'margin-top:22px;padding-top:18px;border-top:1px solid var(--gold-line,#C9A961)' });
    suite.hidden = true;
    carte.appendChild(suite);
    select.addEventListener('change', function () { montrerSuite(suite, select.value); });
    if (trouvee) montrerSuite(suite, select.value);
    bloc.innerHTML = '';
    bloc.appendChild(carte);

    form.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      statut.textContent = '';
      statut.className = 'tjd-co__statut';
      if (!select.value) { select.focus(); select.reportValidity && select.reportValidity(); return; }
      if (!input.value || !input.checkValidity()) { input.focus(); input.reportValidity && input.reportValidity(); return; }

      var matiere = select.value;
      var email = input.value.trim();
      bouton.disabled = true;
      bouton.textContent = TEXTES.envoi;

      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: sourcePage, matiere: matiere, site: champPiege.value, confirmerDomaine: domaineConfirme === email })
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
          window._paq.push(['trackEvent', 'lead', 'corrige-offert', matiere]);
        }
        var succes = el('div', { 'class': 'tjd-co__succes', role: 'status', 'aria-live': 'polite' });
        succes.appendChild(el('strong', null, TEXTES.succesTitre));
        succes.appendChild(el('p', null, TEXTES.succes.replace('{email}', email)));
        form.replaceWith(succes);
      }).catch(function (erreur) {
        bouton.disabled = false;
        bouton.textContent = TEXTES.bouton;
        statut.className = 'tjd-co__statut tjd-co__statut--erreur';
        statut.textContent = (erreur && erreur.message429) || TEXTES.erreur;
        if (erreur && erreur.suggestion) {
          statut.textContent = 'Le domaine de ton adresse ressemble à une faute de frappe. Tu peux choisir l’adresse à utiliser. ';
          var corriger = el('button', {type:'button'}, 'Utiliser '+erreur.suggestion), garder = el('button', {type:'button'}, 'Garder mon adresse');
          corriger.addEventListener('click', function(){input.value=erreur.suggestion;domaineConfirme='';form.requestSubmit();});
          garder.addEventListener('click', function(){domaineConfirme=input.value.trim().toLowerCase();form.requestSubmit();});
          statut.appendChild(corriger);statut.appendChild(garder);
        }
      });
    });
  }

  function demarrer() {
    var blocs = document.querySelectorAll('[data-tjd-corrige-offert]');
    if (!blocs.length) return;
    injecterStyles();
    Array.prototype.forEach.call(blocs, monter);
  }

  window.tjdCorrigeOffert = { monter: function (bloc) { injecterStyles(); monter(bloc); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
