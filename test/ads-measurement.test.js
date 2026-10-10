const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const page = fs.readFileSync(path.join(__dirname, '..', 'merci-achat.html'), 'utf8');
const debut = page.indexOf('    function envoyerMetaSiPret() {');
const fin = page.indexOf('    function verifierSession(', debut);
assert.ok(debut >= 0 && fin > debut);

function pixel(interne, donnees) {
  const evenements = [];
  const fbq = (...args) => evenements.push(args);
  const contexte = vm.createContext({ window: { tjdTestInterne: interne, fbq }, fbq,
    metaEnvoye: false, donneesSession: donnees, sessionId: 'cs_live_factice' });
  vm.runInContext(page.slice(debut, fin), contexte);
  return { envoyer: contexte.envoyerMetaSiPret, evenements };
}

test('le Pixel ignore un paiement interne même lorsque Meta est chargé', () => {
  const p = pixel(true, { montant: 79, devise: 'EUR' });
  p.envoyer(); assert.equal(p.evenements.length, 0);
});

test('le Pixel ignore le drapeau serveur après un changement de navigateur', () => {
  const p = pixel(false, { montant: 79, devise: 'EUR', internalTest: true });
  p.envoyer(); assert.equal(p.evenements.length, 0);
});

test('le Pixel attend une valeur positive puis envoie un achat unique', () => {
  for (const montant of [0, null, undefined]) {
    const p = pixel(false, { montant, devise: 'EUR' });
    p.envoyer(); assert.equal(p.evenements.length, 0);
  }
  const p = pixel(false, { montant: 79, devise: 'EUR' });
  p.envoyer(); p.envoyer();
  assert.equal(p.evenements.length, 1);
  assert.equal(p.evenements[0][1], 'Purchase');
  assert.equal(p.evenements[0][2].value, 79);
  assert.equal(p.evenements[0][3].eventID, 'cs_live_factice');
});

const { traiterAchatPaye } = require('../api/stripe-webhook')._test;
function session(variantes = {}) {
  return { id: 'cs_live_factice', livemode: true, mode: 'payment', amount_total: 7900,
    metadata: { produitIds: 'pack-l2', source: 'site', consentMarketing: '1' },
    customer_details: { email: 'acheteur@example.com' }, discounts: [], ...variantes };
}
async function achat(s) {
  let livraisons = 0; const meta = [];
  await traiterAchatPaye(s, { origin: 'https://trajectoiredroit.com', downloadSecret: 'factice',
    operations: { insererSiAbsent: async () => [{ id: 1 }], supprimer: async () => [],
      envoyerEmail: async () => { livraisons++; }, envoyerAchatMeta: async x => { meta.push(x); },
      creerContactBrevoAchat: async () => ({ estNouveau: true }), recupererCodePromo: async () => null } });
  return { livraisons, meta };
}

test('CAPI garde la livraison mais exclut les tests et les accès gratuits', async () => {
  const base = session();
  const variantes = [
    { metadata: { ...base.metadata, internalTest: '1' } },
    { metadata: { ...base.metadata, source: 'test_interne' } },
    { livemode: false }, { amount_total: 0 },
    { metadata: { ...base.metadata, consentMarketing: '0' } }
  ];
  for (const variante of variantes) {
    const r = await achat(session(variante));
    assert.equal(r.livraisons, 1); assert.equal(r.meta.length, 0);
  }
  const reel = await achat(session());
  assert.equal(reel.meta.length, 1); assert.equal(reel.meta[0].montantEuros, '79.00');
});

test('session-info transmet le statut interne sans divulguer les métadonnées', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'session-info.js'), 'utf8');
  for (const [variante, interne] of [
    [{}, false], [{ livemode: false }, true],
    [{ metadata: { internalTest: '1' } }, true],
    [{ metadata: { source: 'test_interne' } }, true]
  ]) {
    const data = { payment_status: 'paid', livemode: true, amount_total: 7900,
      currency: 'eur', metadata: { produitIds: 'pack-l2' }, ...variante };
    const contexte = vm.createContext({ module: { exports: {} }, console,
      process: { env: { STRIPE_SECRET_KEY: 'sk_live_factice' } },
      require: nom => nom === './_stripe'
        ? { creerClientStripe: () => ({ checkout: { sessions: { retrieve: async () => data } } }) }
        : { suggererComplements: () => [] } });
    vm.runInContext(source, contexte);
    let statut; let reponse;
    const res = { status: code => { statut = code; return res; }, json: x => { reponse = x; } };
    await contexte.module.exports({ query: { session_id: 'cs_live_factice' } }, res);
    assert.equal(statut, 200); assert.equal(reponse.internalTest, interne);
    assert.equal(reponse.montant, 79); assert.equal(reponse.metadata, undefined);
  }
});
