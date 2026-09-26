const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function res() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

const session = {
  mode: 'payment', payment_status: 'paid', amount_total: 1499,
  metadata: { produitIds: 'fiche-da-l2-s1', internalTest: '0' },
};

async function tester(data, corps = {}) {
  const stripe = require('../api/_stripe');
  const supabase = require('../api/_supabase');
  const oldStripe = stripe.creerClientStripe;
  const oldInsert = supabase.insererSiAbsent;
  const oldKey = process.env.STRIPE_SECRET_KEY;
  const inserts = [];
  stripe.creerClientStripe = () => ({ checkout: { sessions: { retrieve: async () => data } } });
  supabase.insererSiAbsent = async (...args) => { inserts.push(args); return [{ session_hash: 'ok' }]; };
  process.env.STRIPE_SECRET_KEY = 'sk_test_factice';
  const modulePath = require.resolve('../api/motivation-achat');
  delete require.cache[modulePath];
  const handler = require('../api/motivation-achat');
  const response = res();
  try {
    await handler({ method: 'POST', headers: { origin: 'https://trajectoiredroit.com' },
      body: { session_id: 'cs_test_test123', declencheur: 'td', resultat: 'comprendre', ...corps } }, response);
  } finally {
    stripe.creerClientStripe = oldStripe;
    supabase.insererSiAbsent = oldInsert;
    delete require.cache[modulePath];
    if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldKey;
  }
  return { response, inserts };
}

test('enregistre uniquement après achat de fiche confirmé, sans email ni session brute', async () => {
  const { response, inserts } = await tester(session, { resultat_precision: 'Préparer un cas pratique' });
  assert.equal(response.code, 200);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][0], 'motivations_achats');
  assert.match(inserts[0][1].session_hash, /^[a-f0-9]{64}$/);
  assert.equal(inserts[0][1].mode, 'test');
  assert.equal(inserts[0][1].resultat_precision, 'Préparer un cas pratique');
  assert.equal(JSON.stringify(inserts[0][1]).includes('cs_test_'), false);
});

test('refuse commande impayée, stage, test interne et réponse invalide', async () => {
  for (const candidate of [
    { ...session, payment_status: 'unpaid' },
    { ...session, metadata: { produitIds: 'stage-methode' } },
    { ...session, metadata: { produitIds: 'fiche-da-l2-s1', internalTest: '1' } },
    { ...session, amount_total: 0 },
  ]) {
    const { response, inserts } = await tester(candidate);
    assert.equal(response.code, 404);
    assert.equal(inserts.length, 0);
  }
  const invalid = await tester(session, { declencheur: 'invente' });
  assert.equal(invalid.response.code, 400);
  assert.equal(invalid.inserts.length, 0);
});

test('le questionnaire est dans le bloc caché avant confirmation', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'merci-achat.html'), 'utf8');
  const blockStart = html.indexOf('<div id="purchaseConfirmedContent" hidden>');
  const formIndex = html.indexOf('<form id="achatRetourForm">');
  const blockEnd = html.indexOf('<div id="purchasePendingCard"', blockStart);
  assert.ok(blockStart >= 0 && formIndex > blockStart && (blockEnd < 0 || formIndex < blockEnd));
  assert.match(html, /afficherAchatConfirme\(\);[\s\S]*?afficherRetourSiEligible\(d\)/);
  assert.match(html, /if \(!d \|\| d\.montant == null\) throw new Error\('paiement_non_confirme'\)/);
});
