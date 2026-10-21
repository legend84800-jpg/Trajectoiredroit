const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const attribution=require('../api/_atelier-attribution');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/achat.js'),'utf8');
const start=source.indexOf('  function ajouterRecuComportement(');
const helper=source.slice(start,source.indexOf('  // Ouvre',start));
const receipt='acb3.00000000-0000-4000-8000-000000000001.1792600000.1792686400.'+'a'.repeat(43);
function apply({behavior=true,purpose=true,internal=false,value=receipt,throws=false}={}){
 const body={produitId:'produit',comportementReceipt:'ancien'};
 const window={tjdCookieConsent:{getPreferences:()=>({behavior}),allowsPurchaseLink:()=>purpose},AtelierComportement:{getPurchaseReceipt(){if(throws)throw new Error('indisponible');return value;}}};
 vm.runInNewContext(helper+'ajouterRecuComportement(body)',{window,body,estTestInterne:()=>internal});
 return body;
}
test('la référence de visite exige le choix actualisé au moment du départ vers Stripe',()=>{
 assert.equal(apply().comportementReceipt,receipt);
 for(const options of [{behavior:false},{purpose:false},{internal:true},{value:null},{value:'email@exemple.fr'},{throws:true}]){
  const body=apply(options);assert.equal(body.comportementReceipt,undefined);assert.equal(body.produitId,'produit');
 }
});
test('la métadonnée de rapprochement reste limitée à sa forme et à la marque du serveur',()=>{
 assert.deepEqual(attribution({comportementReceipt:receipt,atelierBrand:'philo',purchaseConfirmed:true,amount:1}),{atelierBrand:'tjd',comportementReceipt:receipt});
 for(const value of [receipt+'.extra','acb3.email@example.com',receipt.replace('acb3.','acb4.'),''])assert.equal(attribution({comportementReceipt:value}).comportementReceipt,undefined);
});
