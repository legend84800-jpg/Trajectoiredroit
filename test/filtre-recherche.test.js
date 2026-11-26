const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync(require.resolve('../assets/js/filtre-recherche.js'), 'utf8');

function element(attributs = {}) {
  return Object.assign(new EventTarget(), {
    style: {},
    hidden: false,
    textContent: '',
    getAttribute(nom) { return attributs[nom] ?? null; },
    setAttribute(nom, valeur) { attributs[nom] = valeur; },
    append(...enfants) { this.enfants = enfants; },
    click() { this.dispatchEvent(new Event('click')); },
    focus() { this.cibleDuFocus = true; }
  });
}

function simulerCatalogue() {
  const champ = element({ 'data-filtre-recherche': '#grille' });
  const grille = element();
  let niveauActif = 'TOUT';
  const definitions = [
    ['adm-s1', 'L2', 'Droit administratif (S1)', 'L2 · PDF', 'Étude poursuivie au S2.'],
    ['adm-s2', 'L2', 'Droit administratif (S2)', 'L2 · PDF'],
    ['contrats', 'L3', 'Contrats spéciaux', 'L3 · Semestre 1 · PDF'],
    ['commercial', 'L2,L3', 'Droit commercial', 'L2 et L3 · Semestre 1 · PDF']
  ];
  const cartes = definitions.map(([id, niveau, titre, meta, description = '']) => Object.assign(element({
    'data-niveau': niveau, tabindex: '-1'
  }), {
    id,
    querySelector(selecteur) {
      return { '.product__title': { textContent: titre }, '.product__meta': { textContent: meta } }[selecteur];
    },
    textContent: [titre, meta, description].join(' '),
    classList: {
      contains: nom => nom === 'hors-niveau' && niveauActif !== 'TOUT' && !niveau.split(',').includes(niveauActif)
    }
  }));
  grille.querySelectorAll = () => cartes;
  grille.prepend = enfant => { grille.enfant = enfant; };
  const onglets = Object.fromEntries(['TOUT', 'L1', 'L2', 'L3'].map(niveau => {
    const onglet = element({ 'data-niveau-onglet': niveau });
    onglet.addEventListener('click', () => {
      niveauActif = niveau;
      champ.dispatchEvent(new Event('input'));
    });
    return [niveau, onglet];
  }));
  champ.value = '';
  runInNewContext(source, {
    window: {},
    document: {
      querySelectorAll: selecteur => selecteur === '[data-filtre-recherche]' ? [champ] : Object.values(onglets),
      querySelector: () => grille,
      createElement: () => element()
    }
  });

  return {
    chercher(texte) { champ.value = texte; champ.dispatchEvent(new Event('input')); },
    resultats: () => cartes.filter(carte => !carte.hidden && !carte.classList.contains('hors-niveau')).map(carte => carte.id),
    onglets,
    suggestion: grille.enfant.enfants[1],
    aucunResultat: grille.enfant.enfants[0],
    carteAuFocus: () => cartes.find(carte => carte.cibleDuFocus)?.id
  };
}

test('la recherche associe la matière au semestre porté par le titre ou les métadonnées', () => {
  const catalogue = simulerCatalogue();
  for (const [requete, resultats] of [
    ['administratif', ['adm-s1', 'adm-s2']],
    ['droit administratif S2', ['adm-s2']],
    ['administratif S2', ['adm-s2']],
    ['DROIT ADMINISTRATIF semestre 2', ['adm-s2']],
    ['S.1 administratif', ['adm-s1']],
    ['administratif L2S2', ['adm-s2']],
    ['contrats speciaux semestre 1', ['contrats']],
    ['contrats spéciaux s2', []]
  ]) {
    catalogue.chercher(requete);
    assert.deepEqual(catalogue.resultats(), resultats, requete);
  }
  assert.equal(catalogue.aucunResultat.hidden, false);
});

test('le niveau actif s’applique aussi aux résultats qualifiés par semestre', () => {
  const catalogue = simulerCatalogue();
  catalogue.onglets.L1.click();
  catalogue.chercher('administratif S2');
  assert.deepEqual(catalogue.resultats(), []);
  assert.equal(catalogue.suggestion.textContent, 'Voir le résultat en L2');
  assert.equal(catalogue.aucunResultat.hidden, true);
  catalogue.suggestion.click();
  assert.deepEqual(catalogue.resultats(), ['adm-s2']);
  assert.equal(catalogue.carteAuFocus(), 'adm-s2');

  catalogue.onglets.L1.click();
  catalogue.chercher('commercial L2 S1');
  assert.equal(catalogue.suggestion.textContent, 'Voir le résultat en L2');
});
