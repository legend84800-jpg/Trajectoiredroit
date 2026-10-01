const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'merci-achat.html'), 'utf8');
const debut = page.indexOf('    function envoyerMesures(d) {');
const fin = page.indexOf('    // Suggestions de compléments', debut);
assert.ok(debut >= 0 && fin > debut);

function mesures(interne) {
  const evenements = [];
  const commandes = [];
  const stockage = new Map();
  const gtag = (...args) => evenements.push(args);
  const contexte = vm.createContext({
    window: { tjdTestInterne: interne, gtag, _paq: commandes },
    gtag,
    sessionId: 'cs_test_mesure_achat',
    dejaEnvoye: false,
    sessionStorage: { setItem: (cle, valeur) => stockage.set(cle, valeur) },
  });
  vm.runInContext(page.slice(debut, fin), contexte);
  return { envoyer: contexte.envoyerMesures, evenements, commandes, stockage };
}

test('un achat de test interne reste absent de GA4 et Matomo', () => {
  const m = mesures(true);
  m.envoyer({ montant: 79, devise: 'EUR', produitIds: ['pack-l2'] });
  assert.equal(m.evenements.length, 0);
  assert.equal(m.commandes.length, 0);
  assert.equal(m.stockage.size, 0);
});

test('un achat confirmé transmet son montant et son produit une seule fois', () => {
  const m = mesures(false);
  const achat = { montant: 79, devise: 'EUR', produitIds: ['pack-l2'] };
  m.envoyer(achat);
  m.envoyer(achat);
  assert.equal(m.evenements.length, 1);
  assert.equal(m.commandes.length, 1);
  const [type, nom, donnees] = m.evenements[0];
  assert.equal(type, 'event');
  assert.equal(nom, 'purchase');
  assert.equal(donnees.value, 79);
  assert.equal(donnees.currency, 'EUR');
  assert.equal(donnees.transaction_id, 'cs_test_mesure_achat');
  assert.equal(donnees.items[0].item_id, 'pack-l2');
  assert.equal(m.commandes[0][0], 'trackEcommerceOrder');
  assert.equal(m.commandes[0][2], 79);
});
