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
  if(file==='api/_portalis-generation.js'&&!Object.hasOwn(stubs,'./_portalis-corpus')) {
    const corpus=require('../api/_portalis-corpus');
    stubs={...stubs,'./_portalis-corpus':{...corpus,rechercher:async()=>({version:'fixture-vide',passages:[]})}};
  }
  const module={exports:{}};
  const realRequire=require('node:module').createRequire(path.join(root,file));
  const requireStub=name=>Object.hasOwn(stubs,name)?stubs[name]:realRequire(name);
  requireStub.resolve=realRequire.resolve;
  vm.runInNewContext(lire(file),{require:requireStub,module,console:{error(){},log(){}},Buffer,AbortSignal,URLSearchParams,setTimeout,clearTimeout,process:{env:{ANTHROPIC_API_KEY:'fixture'}},...globals});
  return module.exports;
}
function chargerStore(fetch){
  return charger('api/_portalis-store.js',{}, {fetch,process:{env:{
    SUPABASE_URL:'https://supabase.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture'
  }}});
}
test('les RPC sans résultat acceptent HTTP 204 et conservent les résultats JSON',async()=>{
  const responses=[new Response(null,{status:204}),new Response('false'),new Response('true'),new Response('{"actif":true,"restant":60}'),new Response('')];
  const store=chargerStore(async()=>responses.shift());
  assert.equal(await store.rpc('portalis_synchroniser',{}),null);
  assert.equal(await store.rpc('portalis_echouer',{}),false);
  assert.equal(await store.rpc('portalis_terminer',{}),true);
  assert.equal((await store.rpc('portalis_etat',{})).restant,60);
  await assert.rejects(store.rpc('portalis_etat',{}),{name:'SyntaxError'});
});
test('un paiement Pro crédite sa période après une synchronisation HTTP 204',async()=>{
  const calls=[];
  const store=chargerStore(async(url,options)=>{
    calls.push({name:url.split('/').pop(),args:JSON.parse(options.body)});
    return new Response(null,{status:204});
  });
  const billing=charger('api/_portalis-billing.js',{'./_portalis-store':store});
  const metadata={portalis:'abonnement',supabase_user_id:USER,formule:'pro'};
  const stripe={
    checkout:{sessions:{retrieve:async()=>({metadata,payment_status:'paid',subscription:'sub_fixture',customer:'cus_fixture'})}},
    subscriptions:{retrieve:async()=>({id:'sub_fixture',metadata,status:'active',customer:'cus_fixture',created:1760000000,
      latest_invoice:'in_fixture',items:{data:[{current_period_start:1760000000,current_period_end:1762592000}]}})},
    invoices:{retrieve:async()=>({id:'in_fixture',subscription:'sub_fixture',status:'paid',currency:'eur',amount_paid:1800,
      billing_reason:'subscription_create',lines:{data:[{amount:1800,period:{start:1760000000,end:1762592000}}]}})}
  };
  assert.equal(await billing.synchroniserSession(stripe,'cs_live_fixture',USER),true);
  assert.deepEqual(calls.map(call=>call.name),['portalis_synchroniser','portalis_crediter_periode']);
  assert.equal(calls[1].args.p_formule,'pro');
  assert.equal(calls[1].args.p_facture,'in_fixture');
});
test('les anciens liens conduisent à Portalis et le compte retrouve son espace',()=>{
  const redirects=JSON.parse(lire('vercel.json')).redirects;
  for(const source of ['/outil-fiche-arret.html','/outil-fiche-arret'])assert.equal(redirects.find(r=>r.source===source).destination,'/portalis.html');
  assert.match(lire('mon-compte.html'),/href="portalis.html#espace"/);
  assert.match(lire('index.html'),/href="portalis.html(?:#[^"]*)?"/);
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
  }}},{fetch:async url=>({ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:100}:{stop_reason:'max_tokens',content:[{type:'thinking',thinking:'Réflexion privée.'},{type:'text',text:'Une réponse coupée qui ne doit pas être facturée.'}],usage:{input_tokens:100,output_tokens:3000}}})});
  await assert.rejects(generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet suffisamment long pour être traité.'},USER),{code:'generation_echouee'});
  assert.ok(calls.includes('portalis_echouer'));assert.ok(!calls.includes('portalis_terminer'));
});
test('une recherche en pause reprend sous la même réservation et enregistre les usages cumulés',async()=>{
  const calls=[],payloads=[];
  const pause={stop_reason:'pause_turn',content:[{type:'server_tool_use',id:'srv1',name:'web_search',input:{query:'article 1117 Legifrance'}},
    {type:'web_search_tool_result',tool_use_id:'srv1',content:[{type:'web_search_result',url:'https://www.legifrance.gouv.fr/',encrypted_content:'contenu-prive'}]}],
    usage:{input_tokens:100,output_tokens:50,server_tool_use:{web_search_requests:1}}};
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async(name,args)=>{
    calls.push({name,args});if(name==='portalis_etat')return{actif:true};if(name==='portalis_reserver')return{code:'reservee',formule:'portalis'};return true;
  }}},{fetch:async(url,options)=>{
    const p=JSON.parse(options.body);payloads.push(p);
    return{ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:100}:payloads.length===2?pause:
      {stop_reason:'end_turn',content:[{type:'text',text:'La règle est expliquée avec sa source officielle.',citations:[{type:'web_search_result_location',title:'Légifrance',url:'https://www.legifrance.gouv.fr/'}]}],usage:{input_tokens:200,output_tokens:80}}};
  }});
  const result=await generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet de droit des contrats suffisamment long.'},USER);
  assert.equal(calls.filter(c=>c.name==='portalis_reserver').length,1);
  assert.equal(calls.filter(c=>c.name==='portalis_terminer').length,1);
  assert.ok(!calls.some(c=>c.name==='portalis_echouer'));
  assert.deepEqual(payloads[2].messages.at(-1).content,pause.content);
  assert.equal(payloads[2].tools[0].max_uses,4);
  const termine=calls.find(c=>c.name==='portalis_terminer').args;
  assert.equal(termine.p_entree,300);assert.equal(termine.p_sortie,130);
  assert.match(result.reponse,/\[Légifrance\]\(https:\/\/www\.legifrance\.gouv\.fr\/\)/);
  assert.equal(termine.p_reponse,result.reponse);
});
test('une recherche qui reste en pause restitue un seul crédit et conserve aucune réponse partielle',async()=>{
  const calls=[];
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async(name)=>{
    calls.push(name);if(name==='portalis_etat')return{actif:true};if(name==='portalis_reserver')return{code:'reservee',formule:'portalis'};return true;
  }}},{fetch:async url=>({ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:100}:
    {stop_reason:'pause_turn',content:[{type:'text',text:'Une analyse provisoire en cours de recherche.'}],usage:{input_tokens:20,output_tokens:10}}})});
  await assert.rejects(generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet juridique suffisamment long pour être traité.'},USER),{code:'generation_echouee'});
  assert.equal(calls.filter(n=>n==='portalis_reserver').length,1);
  assert.equal(calls.filter(n=>n==='portalis_echouer').length,1);
  assert.ok(!calls.includes('portalis_terminer'));
});
test('les douze combinaisons utilisent le budget et l’effort de la formule réservée',async t=>{
  const {budgetSortie}=require('../api/_portalis-config');
  const systemes=new Map();
  for(const exercice of ['fiche','commentaire','cas','dissertation'])for(const [formule,effort,index] of [['portalis','low',0],['classique','medium',1],['pro','high',2]])await t.test(`${exercice} ${formule}`,async()=>{
    const calls=[],payloads=[],timeouts=[];
    const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async(name)=>{
      calls.push(name);if(name==='portalis_etat')return{actif:true};if(name==='portalis_reserver')return{code:'reservee',formule};return true;
    }}},{AbortSignal:{timeout:ms=>{timeouts.push(ms);return undefined;}},fetch:async(url,options)=>{payloads.push(JSON.parse(options.body));return{ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:100}:{stop_reason:'end_turn',content:[{type:'thinking',thinking:'Réflexion privée.'},{type:'text',text:'Une première partie complète pour cet exercice.'},{type:'redacted_thinking',data:'fixture'},{type:'text',text:'Une seconde partie qui termine la réponse.'}],usage:{input_tokens:100,output_tokens:300}}};}});
    const result=await generation.generer({exercice,demandeId:ID,texte:'Un sujet suffisamment long pour être traité.',formule:'pro',effort:'max',max_tokens:99999},USER);
    const budget=(exercice==='fiche'?[6000,8000,10000]:[12000,14000,24000])[index];
    assert.equal(budgetSortie(exercice,formule),budget);
    assert.equal(payloads[1].model,'claude-sonnet-5-5');assert.equal(payloads[1].output_config.effort,effort);assert.equal(payloads[1].max_tokens,budget);
    assert.equal(payloads[1].system,payloads[0].system);assert.deepEqual(payloads[1].messages,payloads[0].messages);
    if(systemes.has(exercice))assert.equal(payloads[1].system,systemes.get(exercice));else systemes.set(exercice,payloads[1].system);
    assert.doesNotMatch(payloads[1].system,/900\s*mots/i);assert.equal(timeouts[0],15000);assert.ok(timeouts[1]>0&&timeouts[1]<=162000);
    assert.equal(payloads[0].tools,undefined);assert.equal(payloads[1].tools[0].name,'web_search');
    assert.equal(result.reponse,'Une première partie complète pour cet exercice.\n\nUne seconde partie qui termine la réponse.');
    assert.ok(calls.includes('portalis_terminer'));assert.ok(!calls.includes('portalis_echouer'));
  });
  assert.throws(()=>budgetSortie('inconnu','pro'),{message:'configuration_budget'});
  assert.throws(()=>budgetSortie('cas','inconnu'),{message:'configuration_budget'});
});
test('le dossier conserve les documents dans l’ordre demandé, les pages connues et la date UTC',async()=>{
  const id2='20000000-0000-4000-8000-000000000002';
  const anciens={id:ID,pages:2,texte:'Un ancien PDF sans séparateur de pages.',cree_le:new Date().toISOString()};
  const recent={id:id2,pages:2,texte:'Première page du PDF récent.\fSeconde page du PDF récent.',cree_le:new Date().toISOString()};
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[anciens,recent]}});
  const body={exercice:'cas',demandeId:ID,texte:'Le sujet saisi par l’étudiant.',question:'Que faut-il en déduire ?',documents:[id2,ID]};
  const result=await generation.preparer(body,USER),message=result.messages[0].content;
  assert.match(message,/<date_preparation_utc>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/date_preparation_utc>/);
  assert.ok(message.indexOf('origine="texte_saisi"')<message.indexOf(`id="${id2}"`));
  assert.ok(message.indexOf(`id="${id2}"`)<message.indexOf(`id="${ID}"`));
  assert.match(message,/<page numero="1">\nPremière page du PDF récent\./);
  assert.match(message,/<page numero="2">\nSeconde page du PDF récent\./);
  assert.doesNotMatch(message,/\f/);
  const ancien=message.slice(message.indexOf(`<document origine="pdf" id="${ID}"`),message.indexOf('</dossier>'));
  assert.match(ancien,/pages="2"/);assert.doesNotMatch(ancien,/<page /);
  assert.equal((message.match(/<document /g)||[]).length,3);
  assert.equal((await generation.preparer(body,USER)).empreinte,result.empreinte);
});
test('les limites portent sur le texte brut et conservent les frontières des pages vides',async()=>{
  const doc={id:ID,pages:3,texte:'a'.repeat(14999)+'\f'+'b'.repeat(14999)+'\f',cree_le:new Date().toISOString()};
  const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[doc]}});
  const body={exercice:'fiche',demandeId:ID,documents:[ID]};
  const result=await generation.preparer(body,USER);
  assert.ok(result.messages[0].content.length>30000);assert.match(result.messages[0].content,/<page numero="3">\n\n<\/page>/);
  doc.texte+='x';await assert.rejects(generation.preparer(body,USER),{code:'caracteres'});
  const config=require('../api/_portalis-config');
  assert.equal(config.LIMITES.reponses,60);assert.equal(config.LIMITES.pages,15);assert.equal(config.LIMITES.caracteres,30000);assert.equal(config.LIMITES.jetonsEntree,20000);
  assert.deepEqual(Object.values(config.FORMULES).map(p=>p.prix),[800,1200,1800]);
  assert.equal(JSON.parse(lire('vercel.json')).functions['api/generer.js'].maxDuration,240);
});
test('la borne de 20 000 jetons et les comptes non entiers sont vérifiés avant réservation',async t=>{
  for(const inputTokens of [20000,20001,19999.5,'20000',null])await t.test(String(inputTokens),async()=>{
    const calls=[],urls=[];
    const generation=charger('api/_portalis-generation.js',{'./_portalis-store':{...require('../api/_portalis-store'),documents:async()=>[],rpc:async name=>{
      calls.push(name);if(name==='portalis_etat')return{actif:true};if(name==='portalis_reserver')return{code:'reservee',formule:'portalis'};return true;
    }}},{fetch:async url=>{urls.push(url);return{ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:inputTokens}:{stop_reason:'end_turn',content:[{type:'text',text:'Une réponse complète et utile pour cet exercice.'}],usage:{input_tokens:inputTokens,output_tokens:300}}};}});
    const promise=generation.generer({exercice:'cas',demandeId:ID,texte:'Un sujet suffisamment long pour être traité.'},USER);
    if(inputTokens===20000){await promise;assert.ok(calls.includes('portalis_reserver'));assert.equal(urls.length,2);}
    else{await assert.rejects(promise,{code:'volume'});assert.deepEqual(calls,['portalis_etat']);assert.equal(urls.length,1);}
  });
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
      if(aborted)throw new Error('aborted');return{ok:true,json:async()=>({abonnementsOuverts:true,formules:Object.fromEntries(['portalis','classique','pro'].map(code=>[code,{prix:900,nom:code,recharges:{}}]))})};
    }});
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(aborted,false);assert.match(prices[0].textContent,/9/);assert.equal(node('paiementMessage').hidden,true);assert.ok(choices.every(button=>!button.disabled));
});
test('un retour Checkout appartenant à un autre compte ne peut pas être synchronisé',async()=>{
  const billing=require('../api/_portalis-billing');
  const stripe={checkout:{sessions:{retrieve:async()=>({metadata:{portalis:'abonnement',supabase_user_id:USER}})}}};
  await assert.rejects(billing.synchroniserSession(stripe,'cs_live_fixture','autre'),{code:'paiement'});
});
test('le résultat du modèle est affiché comme texte et les sessions suivent le choix de persistance',()=>{
  const js=lire('assets/js/portalis.js');new vm.Script(js);
  assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML/);
  const {rendreMarkdown,delaiRequete}=require('../assets/js/portalis');
  const doc={createTextNode:text=>({tag:'#text',textContent:text}),createElement:tag=>({tag,style:{},children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];},get textContent(){return this.children.map(n=>n.textContent).join('');},set textContent(text){this.children=[{tag:'#text',textContent:text}];}})};
  const parent=doc.createElement('section');
  rendreMarkdown(parent,'## Une solution expliquée\n\nUn **principe précis** et son *application*.\n\n1. Une condition\n2. Une conséquence\n\n<script>alert(1)</script>',doc);
  const all=[];function visit(node){all.push(node);for(const child of node.children||[])visit(child);}visit(parent);
  assert.ok(all.some(node=>/^h[1-6]$/.test(node.tag)));assert.ok(all.some(node=>node.tag==='strong'&&node.textContent==='principe précis'));
  assert.ok(all.some(node=>node.tag==='em'&&node.textContent==='application'));assert.equal(all.filter(node=>node.tag==='li').length,2);
  assert.ok(all.some(node=>node.tag==='#text'&&node.textContent==='<script>alert(1)</script>'));assert.ok(!all.some(node=>node.tag==='script'));
  assert.equal(delaiRequete({action:'generer'}),225000);assert.equal(delaiRequete({action:'importer'}),115000);
  assert.match(js,/tjd-compte-rester-connecte/);assert.match(js,/sessionStorage/);
  const account=lire('assets/js/compte.js');new vm.Script(account);
  for(const [,id]of account.matchAll(/document\.getElementById\("([^"]+)"\)/g))assert.ok(lire('mon-compte.html').includes(`id="${id}"`),id);
});
function pdfFixture(pages,vides=[]){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',''];
  const kids=[];
  for(let i=0;i<pages;i++){
    const num=objects.length+1;kids.push(`${num} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 ${3+pages*2} 0 R >> >> /Contents ${num+1} 0 R >>`);
    const text=vides.includes(i+1)?'':`BT /F1 12 Tf 40 740 Td (Document juridique de test suffisamment long. Page ${i+1}.) Tj ET`;
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
  assert.equal(doc.texte.split('\f').length,15);assert.doesNotMatch(doc.texte,/<page /);
  assert.match(doc.texte.split('\f')[0],/Page 1\./);assert.match(doc.texte.split('\f')[14],/Page 15\./);
  const vide=await extrairePDF(pdfFixture(3,[1,3]));
  assert.equal(vide.texte.split('\f').length,3);assert.equal(vide.texte.split('\f')[0],'');assert.equal(vide.texte.split('\f')[2],'');assert.match(vide.texte.split('\f')[1],/Page 2\./);
  await assert.rejects(extrairePDF(pdfFixture(16)),{message:'pages'});
});

test('une offre fermée ne crée aucun paiement même avec un compte confirmé',async()=>{
  const store=require('../api/_portalis-store');
  const checkout=charger('api/_portalis-checkout.js',{
    './_portalis-config':{...require('../api/_portalis-config'),ABONNEMENTS_OUVERTS:false},
    './_portalis-store':{...store,authentifier:async()=>({id:USER})},
    './_stripe':{creerClientStripe(){assert.fail('Paiement créé pour une offre fermée');}}
  }).checkout;
  const r=res();await checkout({headers:{}},r,{mode:'subscription',formule:'portalis',accordConditions:true});
  assert.equal(r.statusCode,503);assert.equal(r.payload.code,'offre_en_preparation');
});
test('le paiement utilise le tarif mensuel serveur et le propriétaire confirmé',async()=>{
  for(const [formule,montant] of [['portalis',800],['classique',1200],['pro',1800]]){
    let priceData,sessionData;
    const stripe={
      customers:{create:async()=>({id:'cus_fixture'})},
      subscriptions:{list:async()=>({data:[]})},
      products:{create:async()=>({id:'prod_fixture'})},
      prices:{list:async()=>({data:[]}),create:async data=>{priceData=data;return{id:'price_fixture'};}},
      checkout:{sessions:{create:async data=>{sessionData=data;return{url:'https://checkout.stripe.com/c/pay/fixture'};}}}
    };
    const checkout=charger('api/_portalis-checkout.js',{
      './_portalis-config':{...require('../api/_portalis-config'),ABONNEMENTS_OUVERTS:true},
      './_portalis-store':{...require('../api/_portalis-store'),authentifier:async()=>({id:USER,email:'fixture@example.test'}),
        service:async()=>({json:async()=>[]}),rpc:async()=>({actif:false})},
      './_stripe':{creerClientStripe:()=>stripe}
    }).checkout;
    const r=res();await checkout({headers:{}},r,{mode:'subscription',formule,accordConditions:true,prix:1,supabaseUserId:ID});
    assert.equal(r.statusCode,200);assert.equal(priceData.unit_amount,montant);assert.equal(priceData.currency,'eur');
    assert.equal(priceData.recurring.interval,'month');assert.equal(sessionData.mode,'subscription');
    assert.equal(sessionData.metadata.supabase_user_id,USER);assert.equal(sessionData.locale,'fr');
    assert.equal(sessionData.wallet_options.link.display,'never');
  }
});

test('les recharges utilisent leur prix serveur et restent liées à la formule active',async()=>{
  for(const [formule,nombre,montant] of [['portalis',20,300],['portalis',60,800],['classique',20,400],['classique',60,1100],['pro',20,600],['pro',60,1600]]){
    let priceData,sessionData;const stripe={
      products:{create:async()=>({id:'prod_fixture'})},
      prices:{list:async()=>({data:[]}),create:async data=>{priceData=data;return{id:'price_fixture'};}},
      checkout:{sessions:{create:async data=>{sessionData=data;return{url:'https://checkout.stripe.com/c/pay/fixture'};}}}
    };
    let active=formule;
    const checkout=charger('api/_portalis-checkout.js',{
      './_portalis-store':{...require('../api/_portalis-store'),authentifier:async()=>({id:USER}),
        service:async()=>({json:async()=>[{stripe_customer_id:'cus_fixture'}]}),rpc:async()=>({actif:true,formule:active})},
      './_stripe':{creerClientStripe:()=>stripe}
    }).checkout;
    const r=res();await checkout({headers:{}},r,{type:'portalis_recharge',formule,nombre,prix:1,supabaseUserId:ID});
    assert.equal(r.statusCode,200);assert.equal(priceData.unit_amount,montant);assert.equal(priceData.currency,'eur');
    assert.equal(priceData.recurring,undefined);assert.equal(sessionData.mode,'payment');
    assert.equal(sessionData.metadata.nombre,String(nombre));assert.equal(sessionData.metadata.supabase_user_id,USER);
    active='autre';const refuse=res();await checkout({headers:{}},refuse,{type:'portalis_recharge',formule,nombre});
    assert.equal(refuse.statusCode,403);assert.equal(refuse.payload.code,'abonnement_requis');
  }
});
