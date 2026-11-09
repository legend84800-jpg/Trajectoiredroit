const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const decisions=require('../api/_portalis-decisions');
const interface=require('../assets/js/portalis');
const USER='10000000-0000-4000-8000-000000000001',ID='20000000-0000-4000-8000-000000000001';
const textes=[1,2].map(i=>'Les juges examinent le consentement dans la décision '+i+'. '+('Les motifs expliquent la règle appliquée aux faits. '.repeat(6))+'Par ces motifs, REJETTE le pourvoi.');
const urls=[1,2].map(i=>'https://www.legifrance.gouv.fr/juri/id/JURITEXT00000000000'+i);
const selection=[1,2].map((indice,i)=>({indice,reference:'Cour de cassation, décision du '+indice+' janvier 2020',url:urls[i]}));
const pages=textes.map((texte,i)=>({type:'web_fetch_tool_result',tool_use_id:'fetch'+i,content:{type:'web_fetch_result',url:urls[i],content:{type:'document',source:{type:'text',data:texte}}}}));
test('seuls les textes effectivement récupérés sur un site officiel servent de sujet',()=>{
  const result=decisions.selectionner(selection,pages,2);
  assert.equal(result[0].texte,textes[0]);assert.equal(result[1].url,urls[1]);
  assert.throws(()=>decisions.selectionner(selection,[{type:'web_search_tool_result',content:pages}],2),{code:'arrets_introuvables'});
  assert.throws(()=>decisions.selectionner(selection,[pages[0]],2),{code:'arrets_introuvables'});
  assert.throws(()=>decisions.selectionner([selection[0],selection[0]],pages,2),{code:'arrets_introuvables'});
  for(const url of ['http://www.legifrance.gouv.fr/juri/id/1','https://legifrance.gouv.fr.example.org/juri/id/1','https://user@legifrance.gouv.fr/juri/id/1','https://127.0.0.1/'])assert.equal(decisions.urlOfficielle(url),null);
});
test('une page de recherche sans dispositif et un texte trop court sont écartés',()=>{
  assert.equal(decisions.texteDecision('Résultats de recherche. '.repeat(25)),null);
  assert.equal(decisions.texteDecision('Par ces motifs, REJETTE.'),null);
  assert.equal(decisions.texteDecision('Menu\nTexte intégral\n'+textes[0]+'\nAnalyse\nUn résumé de doctrine.'),'Texte intégral\n'+textes[0]);
});
test('la recherche reprend les blocs signés puis utilise les textes récupérés sans les réécrire',async()=>{
  const payloads=[],recherche={type:'web_search_tool_result',tool_use_id:'search',content:[{encrypted_content:'signature-preservee'}]};
  const result=await decisions.retrouverDecisions(async(_,payload)=>{
    payloads.push(payload);
    return {stop_reason:payloads.length===1?'pause_turn':'end_turn',content:payloads.length===1?[recherche,...pages]:[{type:'text',text:JSON.stringify({decisions:selection,precision:''})}],usage:{input_tokens:100,output_tokens:50}};
  },['Premier','Second']);
  assert.deepEqual(payloads[1].messages.at(-1).content,[recherche,...pages]);
  assert.equal(result.decisions[0].texte,textes[0]);assert.deepEqual(result.usage,{input_tokens:200,output_tokens:100});
  assert.equal(payloads[1].max_tokens,7950);
});
function charger({rechercheErreur=false,dejaTerminee=false}={}){
  const calls=[],relectures=[],fichier=path.join(__dirname,'../api/_portalis-generation.js'),real=require('node:module').createRequire(fichier),module={exports:{}};
  const stubs={
    './_portalis-store':{...real('./_portalis-store'),documents:async()=>[],rpc:async(n,args)=>{calls.push({n,args});if(n==='portalis_etat')return{actif:true,restant:59};if(n==='portalis_reserver')return dejaTerminee?{code:'deja_terminee',reponse:'La réponse déjà préparée.'}:{code:'reservee',formule:'pro'};return true;}},
    './_portalis-corpus':{...real('./_portalis-corpus'),rechercher:async()=>({version:'test',passages:[]})},
    './_portalis-decisions':{...decisions,retrouverDecisions:async()=>{calls.push({n:'recherche'});if(rechercheErreur)throw new (real('./_portalis-store').ErreurPortalis)('arrets_introuvables','Précise les dates.',422);return{decisions:decisions.selectionner(selection,pages,2),usage:{input_tokens:700,output_tokens:200}};}},
    './_portalis-relecture':{relire:async(_,params)=>{relectures.push(params);return{reponse:params.copie,usage:{input_tokens:500,output_tokens:100}};}}
  };
  const requireStub=n=>Object.hasOwn(stubs,n)?stubs[n]:real(n);requireStub.resolve=real.resolve;
  const fetch=async(url,options)=>({ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:1000}:{stop_reason:'end_turn',content:[{type:'text',text:'Le commentaire rédigé compare les deux décisions du sujet.'}],usage:{input_tokens:1000,output_tokens:300}}});
  vm.runInNewContext(fs.readFileSync(fichier,'utf8'),{module,require:requireStub,Buffer,AbortSignal,setTimeout,clearTimeout,URLSearchParams,console:{log(){},error(){}},process:{env:{ANTHROPIC_API_KEY:'fixture'}},fetch});
  return{g:module.exports,calls,relectures};
}
const demande=()=>({exercice:'commentaire-compare',demandeId:ID,arrets:['Poussin','Fragonard']});
test('deux noms courts suffisent et les autres exercices gardent leurs conditions',async()=>{
  const {g}=charger();assert.equal((await g.preparer(demande(),USER)).arrets.length,2);
  for(const arrets of [['Poussin'],['Poussin',' poussin '],['Poussin',null]])assert.throws(()=>g.validerCorps({...demande(),arrets}),{code:'arrets'});
  assert.throws(()=>g.validerCorps({...demande(),exercice:'fiche'}),{code:'arrets'});
  await assert.rejects(g.preparer({exercice:'fiche',demandeId:ID,texte:'Poussin'},USER),{code:'texte_court'});
  assert.equal(interface.volumeDemande({arrets:['Poussin','Fragonard']}).complet,true);
  assert.equal(interface.volumeDemande({arrets:['Poussin','']}).complet,false);
  assert.equal(interface.volumeDemande({mode:'corriger',arrets:['Poussin','Fragonard']}).complet,false);
  assert.deepEqual(interface.construireDemande(demande()).arrets,['Poussin','Fragonard']);
});
test('la recherche et les deux relectures utilisent une réservation et enregistrent tous leurs usages',async()=>{
  const {g,calls,relectures}=charger();const result=await g.generer(demande(),USER);
  assert.equal(calls.filter(c=>c.n==='portalis_reserver').length,1);assert.equal(calls.filter(c=>c.n==='portalis_terminer').length,1);
  assert.equal(relectures.length,2);
  for(const r of relectures)for(const texte of textes)assert.ok(r.message.includes(texte));
  const args=calls.find(c=>c.n==='portalis_terminer').args;assert.equal(args.p_entree,2700);assert.equal(args.p_sortie,700);
  assert.match(result.reponse,/## Arrêts retrouvés/);assert.ok(result.reponse.includes(urls[0]));assert.ok(result.reponse.includes(urls[1]));
});
test('une recherche incomplète rend le crédit et une demande déjà terminée ne relance aucune recherche',async()=>{
  const echec=charger({rechercheErreur:true});await assert.rejects(echec.g.generer(demande(),USER),{code:'arrets_introuvables'});
  assert.equal(echec.calls.filter(c=>c.n==='portalis_echouer').length,1);assert.ok(!echec.calls.some(c=>c.n==='portalis_terminer'));assert.equal(echec.relectures.length,0);
  const repetition=charger({dejaTerminee:true});assert.equal((await repetition.g.generer(demande(),USER)).reponse,'La réponse déjà préparée.');assert.ok(!repetition.calls.some(c=>c.n==='recherche'));
});
