const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {volumeDemande,construireDemande,delaiRequete}=require('../assets/js/portalis');
test('le volume et le contenu envoyé suivent les rôles actifs sans perdre les documents de la copie',()=>{
  const documents=[{id:'sujet',role:'sujet',caracteres:100,pages:1},{id:'copie',role:'copie',caracteres:200,pages:2}];
  const entree={mode:'corriger',texte:'a'.repeat(2001),copie:'b'.repeat(4001),question:'Une consigne',documents};
  assert.deepEqual(volumeDemande(entree),{chars:6314,pages:8,complet:true});
  const r=construireDemande({...entree,exercice:'cas',demandeId:'test'});assert.deepEqual(r.documents,['sujet']);assert.deepEqual(r.documentsCopie,['copie']);assert.equal(r.copie,entree.copie);
  const rediger={...entree,mode:'rediger'};assert.deepEqual(volumeDemande(rediger),{chars:2113,pages:3,complet:true});
  assert.equal(construireDemande(rediger).copie,undefined);assert.equal(construireDemande(rediger).documentsCopie,undefined);assert.equal(documents.length,2);
  assert.equal(volumeDemande({mode:'corriger',texte:'x'.repeat(30),copie:''}).complet,false);
  assert.equal(volumeDemande({mode:'corriger',texte:'',copie:'x'.repeat(30),question:'Un sujet dans le mauvais champ'}).complet,false);
  assert.equal(delaiRequete({action:'generer',mode:'corriger',exercice:'fiche'}),775000);
});
function navigateur({search='?mode=corriger',connecte=true,abonnement}={}){
  const nodes=new Map(),posts=[],stockage=new Map();let changementSession;
  function node(id){
    if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,disabled:false,textContent:'',style:{},events:{},dataset:{},children:[],classList:{toggle(){}},
      addEventListener(n,fn){this.events[n]=fn;},replaceChildren(){this.children=[];},append(...a){this.children.push(...a);},focus(){},scrollIntoView(){},setAttribute(){}});
    return nodes.get(id);
  }
  node('modeRediger').checked=true;node('exercice').value='fiche';
  const session={user:{id:'10000000-0000-4000-8000-000000000001'},access_token:'fixture'},state=abonnement||{actif:true,formule:'classique',restant:60,recharges:0};
  const choix=['portalis','classique','pro'].map(code=>{const n=node('choisir-'+code);n.dataset.choisir=code;return n;});
  const document={getElementById:node,querySelectorAll:s=>s==='input[name="mode"]'?[node('modeRediger'),node('modeCorriger')]:s==='[data-choisir]'?choix:[],createElement:tag=>node('element-'+nodes.size+'-'+tag),createTextNode:text=>({textContent:text})};
  const storage={getItem:k=>stockage.get(k)||null,setItem:(k,v)=>stockage.set(k,v),removeItem:k=>stockage.delete(k)};
  const sb={auth:{onAuthStateChange(fn){changementSession=fn;},getSession:async()=>({data:{session:connecte?session:null}})}};
  const location={search,pathname:'/portalis.html'};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/portalis.js'),'utf8'),{document,location,localStorage:storage,sessionStorage:storage,AbortController,URLSearchParams,Intl,console,setTimeout,clearTimeout,crypto:{randomUUID:()=> '20000000-0000-4000-8000-000000000001'},window:{supabase:{createClient:()=>sb},location},fetch:async(url,options)=>{
    const body=options.body&&JSON.parse(options.body);if(body)posts.push(body);
    const data=url.includes('configuration')?{abonnementsOuverts:true,formules:{portalis:{nom:'Portalis IA',prix:800,recharges:{}},classique:{nom:'Classique',prix:1200,recharges:{}},pro:{nom:'Pro',prix:1800,recharges:{}}}}:url==='/api/create-checkout'?{termine:true,etat:{...state,formule:'pro'}}:body?{reponse:'Une correction complète.\n\n## Estimation indicative · 14/20',etat:{...state,restant:59}}:state;
    return {ok:true,json:async()=>data};
  }});
  return {node,posts,deconnecter:()=>changementSession('SIGNED_OUT',null)};
}
const attendre=()=>new Promise(r=>setImmediate(r));
test('le formulaire corrige une copie avec son sujet, garde les saisies au changement de mode et débite une seule réponse',async()=>{
  const {node,posts,deconnecter}=navigateur();await attendre();
  assert.equal(node('copieZone').hidden,false);assert.equal(node('generer').textContent,'Corriger ma copie');assert.equal(node('generer').disabled,true);
  node('texte').value='Un sujet suffisamment détaillé pour ce devoir.';node('texte').events.input();assert.equal(node('generer').disabled,true);
  node('copie').value='Le travail rédigé par l’étudiant sur ce sujet.';node('copie').events.input();assert.equal(node('generer').disabled,false);
  node('modeCorriger').checked=false;node('modeRediger').events.change();assert.equal(node('copieZone').hidden,true);assert.equal(node('copie').value,'Le travail rédigé par l’étudiant sur ce sujet.');
  node('modeCorriger').checked=true;node('modeCorriger').events.change();assert.equal(node('copieZone').hidden,false);
  await node('exerciceForm').events.submit({preventDefault(){}});
  assert.equal(posts.length,1);assert.equal(posts[0].mode,'corriger');assert.equal(posts[0].texte,node('texte').value);assert.equal(posts[0].copie,node('copie').value);
  assert.equal(node('resultat').hidden,false);assert.match(node('quota').textContent,/59 réponses/);
  deconnecter();await new Promise(r=>setTimeout(r,5));assert.equal(node('copie').value,'');assert.equal(node('texte').value,'');assert.equal(node('resultat').hidden,true);
});
test('un visiteur peut découvrir les deux modes avant connexion sans lancer de génération',async()=>{
  const {node,posts}=navigateur({connecte:false});await attendre();
  assert.equal(node('modeCorriger').disabled,false);assert.equal(node('champs').disabled,true);assert.equal(node('copieZone').hidden,false);
  await node('exerciceForm').events.submit({preventDefault(){}});assert.equal(posts.length,0);
});
test('un abonné voit les 10 euros de différence avant de payer et retrouve ses 53 réponses en Pro',async()=>{
  const {node,posts}=navigateur({search:'',abonnement:{actif:true,formule:'portalis',restant:53,recharges:0,renouvellement:'2026-12-07T08:41:45Z'}});await attendre();
  assert.equal(node('choisir-portalis').disabled,true);assert.equal(node('choisir-pro').textContent,'Passer à Pro');
  node('choisir-pro').events.click();
  assert.match(node('choixDetail').textContent,/10,00.*période en cours/);assert.match(node('choixDetail').textContent,/18,00.*par mois/);
  assert.match(node('choixCompte').textContent,/réponses restantes sont conservées/);assert.match(node('choixCompte').textContent,/7 décembre 2026/);
  node('conditions').checked=true;node('payer').events.click();await attendre();
  assert.equal(posts.length,1);assert.equal(posts[0].montantChangement,1000);assert.equal(posts[0].formule,'pro');
  assert.match(node('quota').textContent,/53 réponses/);assert.equal(node('choisir-pro').disabled,true);assert.equal(node('payer').disabled,true);
  assert.equal(node('paiementMessage').textContent,'Ta nouvelle formule est disponible.');
});
