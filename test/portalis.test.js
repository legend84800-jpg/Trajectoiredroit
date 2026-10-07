const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const lire=f=>fs.readFileSync(path.join(root,f),'utf8');
const USER='10000000-0000-4000-8000-000000000001';
const ID='20000000-0000-4000-8000-000000000001';
const res=()=>({headers:{},setHeader(n,v){this.headers[n]=v;},status(c){this.statusCode=c;return this;},json(p){this.payload=p;return this;},end(){}});
function charger(file,stubs,globals={}){
  const module={exports:{}};
  const realRequire=require('node:module').createRequire(path.join(root,file));
  const requireStub=name=>Object.hasOwn(stubs,name)?stubs[name]:realRequire(name);
  requireStub.resolve=realRequire.resolve;
  vm.runInNewContext(lire(file),{require:requireStub,module,console:{error(){},log(){}},Buffer,AbortSignal,URLSearchParams,setTimeout,clearTimeout,process:{env:{ANTHROPIC_API_KEY:'fixture'}},...globals});
  return module.exports;
}
test('les anciens liens conduisent à Portalis et le compte retrouve son espace',()=>{
  const redirects=JSON.parse(lire('vercel.json')).redirects;
  for(const source of ['/outil-fiche-arret.html','/outil-fiche-arret'])assert.equal(redirects.find(r=>r.source===source).destination,'/portalis.html');
  assert.match(lire('mon-compte.html'),/href="portalis.html#espace"/);
  assert.match(lire('index.html'),/href="portalis.html"/);
  assert.match(lire('sitemap.xml'),/https:\/\/trajectoiredroit.com\/portalis.html/);
});
test('la génération et le paiement refusent une identité fournie par le navigateur sans JWT',async()=>{
  const store=require('../api/_portalis-store');
  const denied=()=>{throw new store.ErreurPortalis('connexion_requise','Connexion requise',401);};
  const handler=charger('api/generer.js',{'./_portalis-store':{...store,authentifier:denied}});
  const result=res();await handler({method:'POST',headers:{},body:{supabaseUserId:USER}},result);assert.equal(result.statusCode,401);
  const checkout=charger('api/_portalis-checkout.js',{'./_portalis-store':{...store,authentifier:denied},'./_stripe':{creerClientStripe(){assert.fail('Stripe appelé avant Auth');}}}).checkout;
  for(const body of [{type:'portal',supabaseUserId:USER},{mode:'subscription',formule:'pro'},{type:'portalis_recharge',nombre:60}]){
    const r=res();await checkout({headers:{}},r,body);assert.equal(r.statusCode,401);
  }
});
test('les limites incluent documents et consigne, les pages du PDF viennent du serveur',async()=>{
  const doc={id:ID,pages:15,texte:'Texte du PDF suffisamment long.',cree_le:new Date().toISOString()};
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[doc]}});
  await assert.rejects(generation.preparer({exercice:'fiche',demandeId:ID,texte:'a'.repeat(2001),documents:[ID]},USER),{code:'pages'});
  await assert.rejects(generation.preparer({exercice:'fiche',demandeId:ID,texte:'a'.repeat(29999),documents:[ID]},USER),{code:'caracteres'});
  assert.throws(()=>generation.validerCorps({exercice:'cas',demandeId:ID,question:'a'.repeat(2001)}),{code:'consigne'});
  assert.throws(()=>generation.validerCorps({exercice:'cas',demandeId:ID,documents:[ID,ID]}),{code:'documents'});
  await assert.rejects(generation.preparer({exercice:'fiche',demandeId:ID,texte:'',documents:[]},USER),{code:'document_expire'});
});
test('une réponse tronquée restitue la réservation et ne se termine jamais',async()=>{
  const calls=[];
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async(name)=>{
    calls.push(name);if(name==='portalis_etat')return{actif:true};if(name==='portalis_reserver')return{code:'reservee',formule:'portalis'};return true;
  }}},{fetch:async url=>({ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:100}:{stop_reason:'max_tokens',content:[{type:'text',text:'Une réponse coupée qui ne doit pas être facturée.'}],usage:{input_tokens:100,output_tokens:3000}}})});
  await assert.rejects(generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet suffisamment long pour être traité.'},USER),{code:'generation_echouee'});
  assert.ok(calls.includes('portalis_echouer'));assert.ok(!calls.includes('portalis_terminer'));
});
test('le serveur choisit le niveau de réflexion et les plafonds de la formule payée',async()=>{
  const calls=[],payloads=[];
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async(name)=>{
    calls.push(name);if(name==='portalis_etat')return{actif:true};if(name==='portalis_reserver')return{code:'reservee',formule:'classique'};return true;
  }}},{fetch:async(url,options)=>{payloads.push(JSON.parse(options.body));return{ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:100}:{stop_reason:'end_turn',content:[{type:'text',text:'Une réponse complète et utile pour cet exercice.'}],usage:{input_tokens:100,output_tokens:300}}};}});
  await generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet suffisamment long pour être traité.',formule:'pro',effort:'max',max_tokens:99999},USER);
  assert.equal(payloads[1].model,'claude-sonnet-5-5');assert.equal(payloads[1].output_config.effort,'medium');assert.equal(payloads[1].max_tokens,5000);
  assert.ok(calls.includes('portalis_terminer'));assert.ok(!calls.includes('portalis_echouer'));
});
test('un dossier trop dense est rejeté avant réservation et génération',async()=>{
  const calls=[];
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async name=>{calls.push(name);return{actif:true};}}},
    {fetch:async()=>({ok:true,json:async()=>({input_tokens:20001})})});
  await assert.rejects(generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet suffisamment long pour être traité.'},USER),{code:'volume'});
  assert.deepEqual(calls,['portalis_etat']);
});
test('un compteur indisponible après réussite ne rembourse pas une réponse déjà enregistrée',async()=>{
  let statuses=0;const calls=[];
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async name=>{
    calls.push(name);if(name==='portalis_etat'){if(++statuses>1)throw new Error('indisponible');return{actif:true};}
    if(name==='portalis_reserver')return{code:'reservee',formule:'portalis'};return true;
  }}},{fetch:async url=>({ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:100}:{stop_reason:'end_turn',content:[{type:'text',text:'Une réponse complète et utile pour cet exercice.'}],usage:{input_tokens:100,output_tokens:300}}})});
  const result=await generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet suffisamment long pour être traité.'},USER);
  assert.equal(result.etat,null);assert.match(result.reponse,/complète/);assert.ok(!calls.includes('portalis_echouer'));
});
test('seule une facture de période payée ouvre le quota, les proratas sont ignorés',async()=>{
  const calls=[];const config=require('../api/_portalis-config');
  const billing=charger('api/_portalis-billing.js',{'./_portalis-store':{...require('../api/_portalis-store'),rpc:async(name,args)=>calls.push({name,args})},
    './_portalis-config':{...config,FORMULES:{portalis:{prix:900,recharges:{20:300}}}}});
  const subscription={id:'sub_fixture',metadata:{portalis:'abonnement',supabase_user_id:USER,formule:'portalis'}};
  let invoice={id:'in_fixture',subscription:'sub_fixture',status:'open',currency:'eur',billing_reason:'subscription_cycle',amount_paid:900,lines:{data:[{amount:900,period:{start:100,end:200}}]}};
  const stripe={invoices:{retrieve:async()=>invoice}};
  assert.equal(await billing.crediterFacture(stripe,invoice,subscription),false);assert.equal(calls.length,0);
  invoice={...invoice,status:'paid'};await billing.crediterFacture(stripe,invoice,subscription);
  assert.equal(calls[0].name,'portalis_crediter_periode');assert.equal(calls[0].args.p_facture,'in_fixture');
  invoice={...invoice,billing_reason:'subscription_update'};await billing.crediterFacture(stripe,invoice,subscription);assert.equal(calls.length,1);
});
test('le chargement public des tarifs survit à la première notification de session vide',async()=>{
  const nodes=new Map();
  function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',hidden:id==='paiementMessage',disabled:false,textContent:'',classList:{toggle(){}},addEventListener(){},replaceChildren(){},focus(){},scrollIntoView(){}});return nodes.get(id);}
  const prices=['portalis','classique','pro'].map(code=>({...node(code),dataset:{price:code}}));
  const choices=['portalis','classique','pro'].map(code=>({dataset:{choisir:code},addEventListener(){}}));
  let aborted=false;
  const sb={auth:{onAuthStateChange(cb){cb('INITIAL_SESSION',null);},getSession:async()=>({data:{session:null}})}};
  const location={search:'',pathname:'/portalis.html'};
  const storage={getItem(){return null;},removeItem(){},setItem(){}};
  const document={getElementById:node,querySelectorAll:selector=>selector==='[data-price]'?prices:selector==='[data-choisir]'?choices:[]};
  vm.runInNewContext(lire('assets/js/portalis.js'),{document,location,localStorage:storage,sessionStorage:storage,AbortController,URLSearchParams,Intl,console,
    setTimeout,clearTimeout,window:{supabase:{createClient:()=>sb},location},fetch:async(_url,options)=>{
      await new Promise(resolve=>setTimeout(resolve,15));aborted=options.signal.aborted;
      if(aborted)throw new Error('aborted');return{ok:true,json:async()=>({formules:Object.fromEntries(['portalis','classique','pro'].map(code=>[code,{prix:900,nom:code,recharges:{}}]))})};
    }});
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(aborted,false);assert.match(prices[0].textContent,/9/);assert.equal(node('paiementMessage').hidden,true);
});
test('un retour Checkout appartenant à un autre compte ne peut pas être synchronisé',async()=>{
  const billing=require('../api/_portalis-billing');
  const stripe={checkout:{sessions:{retrieve:async()=>({metadata:{portalis:'abonnement',supabase_user_id:USER}})}}};
  await assert.rejects(billing.synchroniserSession(stripe,'cs_live_fixture','autre'),{code:'paiement'});
});
test('le résultat du modèle est affiché comme texte et les sessions suivent le choix de persistance',()=>{
  const js=lire('assets/js/portalis.js');new vm.Script(js);
  assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML/);assert.match(js,/\.textContent=block/);
  assert.match(js,/tjd-compte-rester-connecte/);assert.match(js,/sessionStorage/);
  const account=lire('assets/js/compte.js');new vm.Script(account);
  for(const [,id]of account.matchAll(/document\.getElementById\("([^"]+)"\)/g))assert.ok(lire('mon-compte.html').includes(`id="${id}"`),id);
});
function pdfFixture(pages){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',''];
  const kids=[];
  for(let i=0;i<pages;i++){
    const num=objects.length+1;kids.push(`${num} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 ${3+pages*2} 0 R >> >> /Contents ${num+1} 0 R >>`);
    const text='BT /F1 12 Tf 40 740 Td (Document juridique de test suffisamment long.) Tj ET';
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let text='%PDF-1.4\n';const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(n=>{text+=`${String(n).padStart(10,'0')} 00000 n \n`;});
  text+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
test('le lecteur PDF accepte 15 pages et refuse 16 pages dans le worker isolé',async()=>{
  const {extrairePDF}=require('../api/_portalis-generation');
  const doc=await extrairePDF(pdfFixture(15));assert.equal(doc.pages,15);assert.ok(doc.texte.length>20);
  await assert.rejects(extrairePDF(pdfFixture(16)),{message:'pages'});
});
