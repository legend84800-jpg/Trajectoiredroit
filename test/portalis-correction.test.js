const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const correction=require('../api/_portalis-correction');
const config=require('../api/_portalis-config');
const USER='10000000-0000-4000-8000-000000000001',ID='20000000-0000-4000-8000-000000000001',PDF='30000000-0000-4000-8000-000000000001';
const sujet='Sujet fourni. Explique la réponse du juge à partir de cette décision.';
const copie='La Cour rejette la demande pour le motif indiqué dans la décision.';
const feedback='## Lecture de ta copie\n\n> '+copie+'\n\nLe passage doit être confronté au dispositif fourni.';
const critere=(intitule,obtenu,maximum,justification)=>({intitule,maximum,justification,retraits:obtenu<maximum?[{points:maximum-obtenu,motif:justification}]:[]});
const proposition=()=>({origine:'propose',extraitBareme:'',criteres:[critere('Droit',6,8,'Le passage discuté conserve une règle exacte.'),critere('Méthode',4,6,'Une étape de procédure manque.'),critere('Raisonnement',3,4,'Le lien avec les faits reste à préciser.'),critere('Expression',2,2,'La phrase est compréhensible.')],appreciation:'Cette estimation porte sur le travail fourni.'});
function charger({docs=[],rpc,fetch}={}){
  const fichier=path.join(__dirname,'../api/_portalis-generation.js'),real=require('node:module').createRequire(fichier),module={exports:{}};
  const store={...real('./_portalis-store'),documents:async(_user,ids)=>docs.filter(d=>ids.includes(d.id)),rpc:rpc||(async()=>({}))};
  const requireStub=n=>n==='./_portalis-store'?store:n==='./_portalis-corpus'?{...real(n),rechercher:async()=>({version:'test',passages:[]})}:real(n);requireStub.resolve=real.resolve;
  vm.runInNewContext(fs.readFileSync(fichier,'utf8'),{module,require:requireStub,Buffer,AbortSignal,setTimeout,clearTimeout,URLSearchParams,console:{error(){}},process:{env:{ANTHROPIC_API_KEY:'fixture'}},fetch});return module.exports;
}
const demande=extra=>({mode:'corriger',exercice:'fiche',demandeId:ID,texte:sujet,copie,...extra});
test('la correction demande le sujet et la copie séparément pour les cinq exercices',async()=>{
  const g=charger();
  for(const exercice of ['fiche','commentaire','commentaire-compare','cas','dissertation']){
    const p=await g.preparer(demande({exercice}),USER);
    assert.match(p.messageBase,/<sujet>[\s\S]*Sujet fourni/);assert.match(p.messageBase,/<copie_etudiant>[\s\S]*repere="C1-p1-1"/);
    assert.equal(p.sourcesCopie[0],copie);assert.equal(p.mode,'corriger');
    await assert.rejects(g.preparer(demande({exercice,texte:''}),USER),{code:'sujet_requis'});
    await assert.rejects(g.preparer(demande({exercice,copie:''}),USER),{code:'copie_requise'});
  }
});
test('les rôles PDF et leurs pages sont attribués selon la demande puis inclus dans les limites',async()=>{
  const date=new Date().toISOString(),docs=[{id:PDF,texte:'Une copie PDF sur la deuxième page.\fLe second passage de cette copie.',pages:2,cree_le:date},{id:ID,texte:sujet,pages:1,cree_le:date}];
  const g=charger({docs});const p=await g.preparer(demande({texte:'',copie:'',documents:[ID],documentsCopie:[PDF]}),USER);
  assert.match(p.messageBase,/<sujet>[\s\S]*Sujet fourni/);assert.match(p.messageBase,/<copie_etudiant>[\s\S]*numero="2"[\s\S]*C1-p2-1/);
  assert.equal(p.sourcesCopie.length,1);assert.equal(p.sourcesCopie[0],docs[0].texte);
  docs[0].pages=15;await assert.rejects(g.preparer(demande({texte:'',copie:'',documents:[ID],documentsCopie:[PDF]}),USER),{code:'pages'});
  docs[0].pages=2;docs[0].texte='x'.repeat(29999);await assert.rejects(g.preparer(demande({documentsCopie:[PDF]}),USER),{code:'caracteres'});
});
test('des documents absents ou partagés entre les deux rôles sont refusés',async()=>{
  const g=charger();assert.throws(()=>g.validerCorps(demande({documents:[ID],documentsCopie:[ID]})),{code:'documents'});
  assert.throws(()=>g.validerCorps(demande({mode:'autre'})),{code:'mode'});
  assert.throws(()=>g.validerCorps(demande({copie:{texte:copie}})),{code:'copie'});
  assert.throws(()=>g.validerCorps(demande({mode:'rediger'})),{code:'mode'});
  await assert.rejects(g.preparer(demande({documentsCopie:[PDF]}),USER),{code:'document_expire'});
  assert.throws(()=>g.validerCorps(demande({copie:'x'.repeat(30000)})),{code:'caracteres'});
});
test('la modification de la copie ou de son rôle change la demande réservée',async()=>{
  const g=charger();const a=await g.preparer(demande(),USER),b=await g.preparer(demande({copie:copie+' Une précision.'}),USER);
  assert.notEqual(a.empreinte,b.empreinte);
  const c=await g.preparer({exercice:'fiche',demandeId:ID,texte:sujet+'\n'+copie},USER);assert.notEqual(a.empreinte,c.empreinte);
});
test('les citations du rapport doivent provenir de la copie et rester continues',()=>{
  assert.doesNotThrow(()=>correction.verifierCitations(feedback,[copie]));
  assert.throws(()=>correction.verifierCitations('> '+sujet,[copie]),/citation_copie_inexacte/);
  assert.throws(()=>correction.verifierCitations('> La Cour […] dans la décision.',[copie]),/citation_copie_inexacte/);
  assert.throws(()=>correction.verifierCitations('Une correction sans extrait.',[copie]),/citations_copie_absentes/);
});
test('la note sur 20 est calculée à partir des critères et le barème fourni est contrôlé dans le sujet',()=>{
  const e=proposition();assert.deepEqual(correction.verifierEvaluation(e,[sujet]),{total:15,maximum:20,note:15});
  assert.match(correction.rendreEvaluation(e,[sujet]),/15\/20/);
  const texte='Barème complet sur 30 points. Le premier critère vaut 30 points.';
  const fourni={origine:'fourni',extraitBareme:texte,criteres:[critere('Travail',25,30,'La réponse comporte les éléments attendus.')],appreciation:'Estimation selon le barème joint.'};
  assert.equal(correction.verifierEvaluation(fourni,[texte]).note,16.67);
  assert.throws(()=>correction.verifierEvaluation(fourni,[sujet]),/bareme_fourni_absent/);
  assert.match(correction.rendreEvaluation(fourni,[texte]),/25\/30/);
  e.criteres[0].retraits[0].points=9;assert.throws(()=>correction.verifierEvaluation(e,[sujet]),/retrait_invalide/);
  e.criteres[0].retraits[0].points=2;e.criteres[0].maximum=10;assert.throws(()=>correction.verifierEvaluation(e,[sujet]),/bareme_propose_invalide/);
});
test('un critère sans retrait garde tous ses points et les décimales sont calculées sans perte arbitraire',()=>{
  const e=proposition();e.criteres=e.criteres.map(c=>({...c,retraits:[]}));assert.equal(correction.verifierEvaluation(e,[sujet]).note,20);
  e.criteres[0].retraits=[{points:.5,motif:''}];assert.throws(()=>correction.verifierEvaluation(e,[sujet]),/retrait_invalide/);
  const texte='Barème complet, un critère de 0,3 point.';
  const d={origine:'fourni',extraitBareme:texte,criteres:[{intitule:'Un critère',maximum:.3,justification:'Deux défauts précis.',retraits:[{points:.1,motif:'Une condition manque.'},{points:.2,motif:'Une application manque.'}]}],appreciation:'Le barème porte ici sur ce seul travail.'};
  assert.equal(correction.verifierEvaluation(d,[texte]).note,0);
});
test('un barème partiel complété garde les critères proposés visibles',()=>{
  const texte='Barème partiel. Introduction sur 5 points.';
  const e={origine:'mixte',extraitBareme:texte,hypotheses:'Les développements sont évalués sur les 15 points complémentaires proposés.',criteres:[{origine:'fourni',...critere('Introduction',4,5,'La question est formulée.')},{origine:'propose',...critere('Développement',10,15,'Un argument reste à expliquer.')}],appreciation:'La note dépend aussi des critères complémentaires proposés.'};
  assert.equal(correction.verifierEvaluation(e,[texte]).note,14);
  assert.match(correction.rendreEvaluation(e,[texte]),/Critère complémentaire proposé/);
  delete e.hypotheses;assert.throws(()=>correction.verifierEvaluation(e,[texte]),/bareme_mixte_invalide/);
});
test('une lecture insuffisante ne devient pas une note nulle',()=>{
  const e={origine:'non_estimable',extraitBareme:'',criteres:[],appreciation:'Une page du développement manque dans le document disponible.'};
  assert.equal(correction.verifierEvaluation(e,[]).note,null);assert.match(correction.rendreEvaluation(e,[]),/Estimation indisponible/);assert.doesNotMatch(correction.rendreEvaluation(e,[]),/0\/20/);
});
async function cycle({citation=feedback,evaluation=proposition(),inputTokens=100}={}){
  const calls=[],payloads=[];let messages=0;
  const g=charger({rpc:async(n,args)=>{calls.push({n,args});if(n==='portalis_etat')return{actif:true};if(n==='portalis_reserver')return{code:'reservee',formule:'classique'};return true;},fetch:async(url,options)=>{
    const payload=JSON.parse(options.body);payloads.push(payload);
    if(url.endsWith('count_tokens'))return new Response(JSON.stringify({input_tokens:inputTokens}));
    messages++;const rapport={reperes:[{reference:'Sujet',points:[{statut:'constate',enonce:'Le sujet est fourni.',extrait:sujet}]}],corrections:[],blocages:[],evaluation:messages===3?evaluation:null};
    return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:messages===1?citation:JSON.stringify(rapport)}],usage:{input_tokens:100,output_tokens:500}}));
  }});
  let result,error;try{result=await g.generer(demande(),USER);}catch(e){error=e;}
  return {result,error,calls,payloads};
}
test('la correction utilise une réservation, deux relectures et une note calculée',async()=>{
  const {result,error,calls,payloads}=await cycle();assert.equal(error,undefined);assert.match(result.reponse,/15\/20/);
  for(const n of ['portalis_reserver','portalis_terminer'])assert.equal(calls.filter(c=>c.n===n).length,1);
  assert.equal(calls.filter(c=>c.n==='portalis_prolonger_relecture').length,2);assert.equal(calls.filter(c=>c.n==='portalis_echouer').length,0);
  assert.equal(calls.find(c=>c.n==='portalis_terminer').args.p_sortie,1500);
  assert.equal(payloads.filter(p=>p.stream).length,3);
  assert.equal(payloads.filter(p=>p.output_config?.format?.type==='json_schema').length,2);
  assert.equal(config.budgetSortie('fiche','classique'),8000);assert.equal(config.budgetSortie('fiche','classique','corriger'),48000);
});
test('seule la note calculée est affichée et les citations de la copie restent intactes',async()=>{
  const texte=feedback+'\n\n## Ancienne analyse\n\nUne remarque utile.\n\n## Estimation de la copie\n\nAncienne note 10/20.\n\n### Détail ancien\n\nUne justification devenue fausse.\n\n## Reprises\n\nLe prochain devoir.\n\n> ## Note écrite dans la copie\n> Ancienne appréciation de l’enseignant.';
  const net=correction.retirerEvaluation(texte);
  assert.doesNotMatch(net,/Ancienne note 10\/20|justification devenue fausse/);assert.match(net,/Ancienne analyse/);assert.match(net,/prochain devoir/);assert.match(net,/> ## Note écrite dans la copie/);
  const {result,error}=await cycle({citation:feedback+'\n\n## Note indicative\n\n10/20'});assert.equal(error,undefined);assert.doesNotMatch(result.reponse,/10\/20/);assert.equal((result.reponse.match(/## Estimation indicative/g)||[]).length,1);
});
test('une citation inventée ou une évaluation invalide restitue le crédit et conserve le rapport privé',async()=>{
  for(const opts of [{citation:'## Remarques\n\n> Un passage inventé de la copie.'},{evaluation:{...proposition(),origine:'fourni',extraitBareme:'Un faux barème absent du sujet'}}]){
    const {result,error,calls}=await cycle(opts);assert.equal(result,undefined);assert.equal(error.code,'generation_echouee');
    assert.equal(calls.filter(c=>c.n==='portalis_echouer').length,1);assert.equal(calls.filter(c=>c.n==='portalis_terminer').length,0);
  }
});
test('la correction peut lire une copie et son sujet plus longs que la rédaction seule',async()=>{
  const {error,result}=await cycle({inputTokens:30000});assert.equal(error,undefined);assert.match(result.reponse,/15\/20/);
  const {error:refus,calls}=await cycle({inputTokens:40001});assert.equal(refus.code,'volume');assert.equal(calls.filter(c=>c.n==='portalis_reserver').length,0);
  const g=charger({fetch:async()=>new Response(JSON.stringify({input_tokens:30000})),rpc:async n=>{if(n==='portalis_etat')return {actif:true};assert.fail('réservation avant le contrôle du volume');}});
  await assert.rejects(g.generer({exercice:'fiche',demandeId:ID,texte:sujet},USER),{code:'volume'});
});
test('la relecture du commentaire comparé garde les distinctions de conviction et de visa sans imposer une nouvelle copie',()=>{
  const s=correction.consignesRelecture('',true,'commentaire-compare');
  assert.match(s,/Un visa indique/);assert.match(s,/ne peut pas être de Poussin/);assert.match(s,/un seul critère/);
  assert.doesNotMatch(s,/La copie emploie la troisième personne/);
});
