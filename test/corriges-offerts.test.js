const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const catalogue = require('../api/corriges-offerts');
const lead = require('../api/lead');
const produits = require('../api/_produits');
const { donneesAchat } = require('../api/stripe-webhook')._test;

test('la suite du corrigé gratuit désigne le même recueil et son prix actuel', () => {
  const offres = catalogue.offres();
  assert.equal(offres.length, 17);
  for (const offre of offres) {
    const url = new URL(offre.url, 'https://trajectoiredroit.com');
    assert.equal(url.searchParams.get('matiere'), offre.id);
    assert.equal(url.hash, '#recueils-cas-pratiques');
    assert.equal(url.searchParams.get('utm_source'), null);
    assert.equal(offre.prix, produits[offre.id].prix);
    const email = lead.construireEmailCorrigeOffert(offre.id);
    assert.ok(email.texte.includes(`${offre.cas + offre.partiels} exercices corrigés`));
    assert.ok(email.texte.includes(`produit=${offre.id}`));
  }
});

test('l’attribution de l’email subsiste après navigation et atteint les données d’achat', () => {
  const mail = lead.construireEmailCorrigeOffert('cas-pratique-contrats-l2-s1');
  const lien = mail.texte.split('\n').find(l => l.startsWith('https://trajectoiredroit.com/corriges'));
  const url = new URL(lien);
  const stockage = () => { const data = new Map(); return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}; };
  const window = {location:{search:url.search,pathname:url.pathname},sessionStorage:stockage(),localStorage:stockage()};
  const source = fs.readFileSync(path.join(__dirname,'../assets/js/main.js'),'utf8').split('/* ----- SKIP LINK')[0];
  const sandbox = {window,document:{referrer:'https://app.brevo.com/'},URLSearchParams,Date};
  vm.runInNewContext(source,sandbox);
  window.location = {search:'',pathname:'/cas-pratiques-corriges.html'};
  vm.runInNewContext(source,sandbox);
  const metadata = {};
  for (const [snake,camel] of [['utm_source','utmSource'],['utm_medium','utmMedium'],['utm_campaign','utmCampaign'],['utm_content','utmContent']]) metadata[camel] = window.sessionStorage.getItem('tjd_'+snake);
  const achat = donneesAchat({id:'session-test-simulee',metadata},'fixture@example.invalid',['cas-pratique-contrats-l2-s1'],'14.99',false);
  assert.equal(achat.utm_medium,'email');
  assert.equal(achat.utm_campaign,'corrige-offert');
  assert.equal(achat.utm_content,'recueil-cas-pratique-contrats-l2-s1');
});
