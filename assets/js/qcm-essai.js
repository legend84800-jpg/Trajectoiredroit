/* QCM en ligne de la page Flashcards + QCM : cinq questions par matière, corrigées dans le navigateur.
   Les données viennent de qcm-essai-donnees.js. Les boutons d'achat utilisent achat.js (attribut data-tjd-produit). */
(function () {
  'use strict';
  var LETTRES = ['A', 'B', 'C', 'D'];

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function demarrer() {
    var racine = document.getElementById('qcm-essai');
    var donnees = window.TJD_QCM_ESSAI;
    if (!racine || !donnees || !donnees.length) return;
    var choix = racine.querySelector('#qcm-essai-matiere');
    var zone = racine.querySelector('#qcm-essai-questions');

    donnees.forEach(function (m, i) {
      var o = el('option', { value: String(i) });
      o.textContent = m.matiere;
      choix.appendChild(o);
    });

    function afficher(index) {
      var m = donnees[index];
      zone.innerHTML = '';
      var form = el('form', { novalidate: 'novalidate' });
      m.questions.forEach(function (q, iq) {
        var plusieurs = q.c.length > 1;
        var bloc = el('fieldset', { style: 'border:0;padding:0;margin:0 0 22px', 'data-question': String(iq) });
        var legende = el('legend', { style: 'font-weight:600;line-height:1.7;color:var(--ink)' },
          (iq + 1) + '. ' + q.q + (plusieurs ? ' <em style="font-weight:400">(plusieurs réponses exactes)</em>' : ''));
        bloc.appendChild(legende);
        q.o.forEach(function (opt, io) {
          var lab = el('label', { style: 'display:flex;align-items:flex-start;gap:10px;padding:6px 0;cursor:pointer;line-height:1.7' });
          var inp = el('input', { type: plusieurs ? 'checkbox' : 'radio', name: 'qcm-essai-' + iq, value: String(io), style: 'margin-top:6px;flex-shrink:0' });
          lab.appendChild(inp);
          lab.appendChild(el('span', null, '<strong>' + LETTRES[io] + '.</strong> ' + opt));
          bloc.appendChild(lab);
        });
        bloc.appendChild(el('div', { 'data-corrige': '', hidden: 'hidden', style: 'margin-top:8px;padding:12px 14px;border-radius:8px;background:var(--surface-2, #f4f1ea);line-height:1.7' }));
        form.appendChild(bloc);
      });
      var bouton = el('button', { type: 'submit', class: 'btn btn--primary' }, '<span>Corriger mes réponses</span>');
      form.appendChild(bouton);
      var bilan = el('div', { 'data-bilan': '', hidden: 'hidden', style: 'margin-top:22px' });
      form.appendChild(bilan);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var justes = 0;
        m.questions.forEach(function (q, iq) {
          var bloc = form.querySelector('[data-question="' + iq + '"]');
          var coches = Array.prototype.map.call(bloc.querySelectorAll('input:checked'), function (x) { return Number(x.value); }).sort();
          var attendu = q.c.slice().sort();
          var ok = coches.length === attendu.length && coches.every(function (v, k) { return v === attendu[k]; });
          if (ok) justes += 1;
          var corrige = bloc.querySelector('[data-corrige]');
          corrige.hidden = false;
          corrige.innerHTML = '<p style="margin:0 0 6px"><strong>' + (ok ? 'Bonne réponse.' : 'À revoir.') + '</strong> Réponse exacte : ' +
            attendu.map(function (k) { return LETTRES[k]; }).join(', ') + '.</p><p style="margin:0">' + q.j + '</p>' +
            '<p style="margin:6px 0 0;font-size:.92em;opacity:.8">Fiche : ' + q.f + '</p>';
          Array.prototype.forEach.call(bloc.querySelectorAll('input'), function (x) { x.disabled = true; });
        });
        bouton.hidden = true;
        bilan.hidden = false;
        bilan.innerHTML = '<p style="font-weight:600;font-size:1.1em;margin:0 0 8px">Tu as ' + justes + ' bonne' + (justes > 1 ? 's' : '') + ' réponse' + (justes > 1 ? 's' : '') + ' sur ' + m.questions.length + '.</p>' +
          '<p style="margin:0 0 14px;line-height:1.8">Le QCM complet de ' + m.matiere + ' contient ' + m.total + ' questions réparties sur ' + m.fiches +
          ' fiches, et chaque question y reçoit une explication comme celles que tu viens de lire. De plus, une grille te permet de noter ton score à la fin de chaque fiche.</p>';
        var actions = el('div', { class: 'flex', style: 'gap:12px;flex-wrap:wrap' });
        var achat = el('button', { type: 'button', class: 'btn btn--primary', 'data-tjd-produit': m.id, style: 'max-width:100%;white-space:normal;text-align:center' },
          '<span>Acheter les flashcards et le QCM de ' + m.matiere + '</span>');
        var encore = el('button', { type: 'button', class: 'btn btn--outline' }, 'Recommencer');
        encore.addEventListener('click', function () { afficher(index); zone.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        actions.appendChild(achat);
        actions.appendChild(encore);
        bilan.appendChild(actions);
      });
      zone.appendChild(form);
    }

    choix.addEventListener('change', function () { afficher(Number(choix.value)); });
    afficher(0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
