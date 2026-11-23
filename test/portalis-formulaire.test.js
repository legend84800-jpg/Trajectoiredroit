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
function navigateur({search='?mode=corriger',connecte=true,abonnement,horlogeSimulee=false}={}){
  const nodes=new Map(),posts=[],stockage=new Map(),minuteries=new Map();
  let changementSession,instant=0,numeroPDF=0,echecImport=false;
  class DateSimulee extends Date{static now(){return instant;}}
  function planifier(callback,delai){
    const id=Symbol();
    minuteries.set(id,{callback,heure:instant+delai});
    return id;
  }
  function avancer(delai){
    instant+=delai;
    for(const [id,minuterie] of [...minuteries]){
      if(minuterie.heure>instant||!minuteries.delete(id))continue;
      minuterie.callback();
    }
  }
  function node(id){
    if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,disabled:false,textContent:'',style:{},events:{},dataset:{},children:[],classList:{toggle(){}},
      addEventListener(n,fn){this.events[n]=fn;},replaceChildren(){this.children=[];},append(...a){this.children.push(...a);},click(){this.events.click?.();},focus(){},scrollIntoView(){},setAttribute(){}});
    return nodes.get(id);
  }
  node('modeRediger').checked=true;node('arretsTexte').checked=true;node('exercice').value='fiche';
  const session={user:{id:'10000000-0000-4000-8000-000000000001'},access_token:'fixture'},state=abonnement||{actif:true,formule:'classique',restant:60,recharges:0};
  const choix=['portalis','classique','pro'].map(code=>{const n=node('choisir-'+code);n.dataset.choisir=code;return n;});
  const document={getElementById:node,querySelectorAll:s=>s==='input[name="mode"]'?[node('modeRediger'),node('modeCorriger')]:s==='input[name="saisieArrets"]'?[node('arretsTexte'),node('arretsNoms')]:s==='[data-choisir]'?choix:[],createElement:tag=>node('element-'+nodes.size+'-'+tag),createTextNode:text=>({textContent:text})};
  const storage={getItem:k=>stockage.get(k)||null,setItem:(k,v)=>stockage.set(k,v),removeItem:k=>stockage.delete(k)};
  const sb={auth:{onAuthStateChange(fn){changementSession=fn;},getSession:async()=>({data:{session:connecte?session:null}})},
    storage:{from:()=>({uploadToSignedUrl:async()=>({})})}};
  const location={search,pathname:'/portalis.html'};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/portalis.js'),'utf8'),{document,location,localStorage:storage,sessionStorage:storage,AbortController,URLSearchParams,Intl,console,
    Date:horlogeSimulee?DateSimulee:Date,setTimeout:horlogeSimulee?planifier:setTimeout,clearTimeout:horlogeSimulee?id=>minuteries.delete(id):clearTimeout,
    crypto:{randomUUID:()=> '20000000-0000-4000-8000-000000000001'},window:{supabase:{createClient:()=>sb},location},fetch:async(url,options)=>{
    const body=options.body&&JSON.parse(options.body);if(body)posts.push(body);
    if(body?.action==='upload'){const id=`pdf-${++numeroPDF}`;return {ok:true,json:async()=>({id,chemin:id,token:'fixture'})};}
    if(body?.action==='importer'){
      if(echecImport){echecImport=false;return {ok:false,json:async()=>({code:'pdf',erreur:'Lecture du fichier impossible.'})};}
      return {ok:true,json:async()=>({id:body.documentId,pages:1,caracteres:100})};
    }
    const data=url.includes('configuration')?{abonnementsOuverts:true,formules:{portalis:{nom:'Portalis IA',prix:800,recharges:{}},classique:{nom:'Classique',prix:1200,recharges:{}},pro:{nom:'Pro',prix:1800,recharges:{}}}}:url==='/api/create-checkout'?{termine:true,etat:{...state,formule:'pro'}}:body?{reponse:'Une correction complète.\n\n## Estimation indicative · 14/20',etat:{...state,restant:59}}:state;
    return {ok:true,json:async()=>data};
  }});
  return {node,posts,avancer,echouerProchainImport:()=>{echecImport=true;},deconnecter:()=>changementSession('SIGNED_OUT',null)};
}
const attendre=()=>new Promise(r=>setImmediate(r));
test('deux noms déclenchent le commentaire comparé sans texte collé et restent propres au compte connecté',async()=>{
  const {node,posts,deconnecter}=navigateur({search:'?exercice=commentaire-compare'});await attendre();
  assert.equal(node('choixArrets').hidden,false);assert.equal(node('nomsArrets').hidden,true);
  node('arretsNoms').checked=true;node('arretsNoms').events.change();assert.equal(node('nomsArrets').hidden,false);
  node('arret1').value='Poussin';node('arret1').events.input();assert.equal(node('generer').disabled,true);
  node('arret2').value='Fragonard';node('arret2').events.input();assert.equal(node('generer').disabled,false);
  node('exercice').value='fiche';node('exercice').events.change();assert.equal(node('choixArrets').hidden,true);assert.equal(node('generer').disabled,true);
  node('exercice').value='commentaire-compare';node('exercice').events.change();assert.equal(node('generer').disabled,false);
  await node('exerciceForm').events.submit({preventDefault(){}});assert.equal(posts.length,1);assert.equal(posts[0].texte,'');assert.deepEqual(posts[0].arrets,['Poussin','Fragonard']);assert.match(node('quota').textContent,/59 réponses/);
  deconnecter();await new Promise(r=>setTimeout(r,5));assert.equal(node('arret1').value,'');assert.equal(node('arret2').value,'');
});
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
test('une copie PDF expirée se remplace sur sa ligne et conserve le sujet, la copie et les autres fichiers',async()=>{
  const {node,posts,avancer,echouerProchainImport}=navigateur({horlogeSimulee:true});
  await attendre();
  const selectionner=async(id,nom)=>{
    node(id).files=[{name:nom,size:1000}];
    await node(id).events.change();
  };
  const boutonRemplacer=()=>node('documentsCopie').children[0].children[1];
  node('texte').value='Voici le sujet déjà saisi pour ce devoir.';
  node('copie').value='Voici la copie déjà saisie pour ce devoir.';
  await selectionner('pdfCopie','copie.pdf');
  avancer(10000);
  await selectionner('pdf','sujet.pdf');
  assert.equal(node('generer').disabled,false);

  avancer(3590000);
  assert.equal(node('documentsCopie').children[0].children[0].children[0].textContent,'PDF expiré');
  assert.equal(boutonRemplacer().textContent,'Remplacer le PDF');
  assert.equal(node('generer').disabled,true);
  await node('exerciceForm').events.submit({preventDefault(){}});
  assert.equal(posts.some(post=>post.action==='generer'),false);

  node('modeCorriger').checked=false;node('modeRediger').events.change();
  assert.equal(node('generer').disabled,false);
  node('modeCorriger').checked=true;node('modeCorriger').events.change();
  assert.equal(node('generer').disabled,true);

  echouerProchainImport();
  node('pdfRemplacement').value='copie.pdf';
  boutonRemplacer().events.click();
  assert.equal(node('pdfRemplacement').value,'');
  await selectionner('pdfRemplacement','copie-reessai.pdf');
  assert.equal(node('documentsCopie').children[0].children[0].textContent,'copie.pdf');
  assert.equal(node('generer').disabled,true);
  boutonRemplacer().events.click();await selectionner('pdfRemplacement','copie-renouvelee.pdf');
  assert.equal(node('documentsCopie').children.length,1);
  assert.equal(node('documentsCopie').children[0].children[0].textContent,'copie-renouvelee.pdf · 1 page');
  assert.equal(node('documents').children[0].children[0].textContent,'sujet.pdf · 1 page');
  assert.equal(node('generer').disabled,false);

  await node('exerciceForm').events.submit({preventDefault(){}});
  const demandes=posts.filter(post=>post.action==='generer');
  assert.equal(demandes.length,1);
  assert.deepEqual(demandes[0].documents,['pdf-2']);
  assert.deepEqual(demandes[0].documentsCopie,['pdf-4']);
  assert.equal(demandes[0].texte,'Voici le sujet déjà saisi pour ce devoir.');
  assert.equal(demandes[0].copie,'Voici la copie déjà saisie pour ce devoir.');

  avancer(3600000);
  const ligne=node('documentsCopie').children[0];
  const retrait=ligne.children[2].events.click();
  assert.equal(ligne.children[1].disabled,true);
  await retrait;
  assert.equal(node('documentsCopie').children.length,0);
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
