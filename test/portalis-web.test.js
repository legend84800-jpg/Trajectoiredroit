const test=require('node:test');
const assert=require('node:assert/strict');
const {OUTIL_WEB,MAX_REPRISES,DELAI_TOTAL,genererAvecRecherche,serialiserTexte}=require('../api/_portalis-web');
const texte='La réponse explique la règle et son application aux faits.';
const payload={model:'modele-fixture',system:'Méthode juridique.',messages:[{role:'user',content:'Un sujet juridique.'}],max_tokens:1000,
  thinking:{type:'adaptive'},output_config:{effort:'high'}};
function fin(content=[{type:'text',text:texte}],usage={input_tokens:100,output_tokens:150}) {
  return {stop_reason:'end_turn',content,usage};
}
function appel(id) {return {type:'server_tool_use',id,name:'web_search',input:{query:'Légifrance article'}};}
function resultat(id,content=[]) {return {type:'web_search_tool_result',tool_use_id:id,content};}
function citation(url='https://www.legifrance.gouv.fr/codes/article_lc/LEGI123',title='Légifrance') {
  return {type:'web_search_result_location',url,title,encrypted_index:'INDEX-PRIVE',cited_text:'EXTRAIT-A-NE-PAS-COPIER'};
}
test('le module ajoute uniquement la recherche native à la génération et conserve le payload initial',async()=>{
  const appels=[];
  const reponse=await genererAvecRecherche(async(...args)=>{appels.push(args);return fin();},payload);
  assert.equal(appels.length,1);assert.equal(appels[0][0],'');
  assert.deepEqual(appels[0][1],{...payload,tools:[OUTIL_WEB]});
  assert.ok(appels[0][2]>0&&appels[0][2]<=DELAI_TOTAL);
  assert.equal(payload.tools,undefined);assert.equal(payload.messages.length,1);
  assert.equal(reponse.reponse,texte);assert.equal(reponse.stop_reason,'end_turn');
  assert.deepEqual(reponse.recherches,{effectuees:0,tentatives:0,reussies:0,erreurs:[]});
});
test('une pause conserve chaque bloc signé et chiffré puis cumule les usages et les textes',async()=>{
  const contenu=Object.freeze([
    Object.freeze({type:'thinking',thinking:'Analyse privée',signature:'SIGNATURE-PRIVEE'}),
    Object.freeze({type:'redacted_thinking',data:'DONNEE-PRIVEE'}),
    Object.freeze({type:'text',text:'La règle a été recherchée.'}),appel('a'),
    resultat('a',[{type:'web_search_result',url:'https://www.legifrance.gouv.fr/',title:'Légifrance',encrypted_content:'CONTENU-CHIFFRE'}])
  ]);
  const pause={stop_reason:'pause_turn',content:contenu,usage:{input_tokens:70,output_tokens:100,cache_read_input_tokens:20,server_tool_use:{web_search_requests:1}}};
  const finTour=fin([{type:'text',text:texte,citations:[citation()]}],{input_tokens:140,output_tokens:200,cache_read_input_tokens:30,server_tool_use:{web_search_requests:1}});
  const appels=[];let temps=1000;
  const sortie=await genererAvecRecherche(async(endpoint,p,delai)=>{appels.push({endpoint,p,delai});temps+=5000;return appels.length===1?pause:finTour;},payload,{maintenant:()=>temps});
  assert.equal(appels.length,2);assert.deepEqual(appels[0].p.tools,[OUTIL_WEB]);
  assert.deepEqual(appels[1].p.tools,[{...OUTIL_WEB,max_uses:4}]);assert.equal(appels[1].p.max_tokens,900);
  assert.equal(appels[1].delai,DELAI_TOTAL-5000);
  assert.strictEqual(appels[1].p.messages.at(-1).content,contenu);
  assert.deepEqual(appels[1].p.messages[0],payload.messages[0]);
  assert.deepEqual(sortie.usage,{input_tokens:210,output_tokens:300,cache_read_input_tokens:50,server_tool_use:{web_search_requests:2}});
  assert.match(sortie.reponse,/La règle a été recherchée\./);assert.match(sortie.reponse,/\[Légifrance\]\(https:/);
  assert.doesNotMatch(sortie.reponse,/SIGNATURE|DONNEE-PRIVEE|CONTENU-CHIFFRE|INDEX-PRIVE|EXTRAIT-A-NE-PAS-COPIER/);
});
test('deux reprises au maximum gardent tout l’historique sans ajouter de message utilisateur',async()=>{
  const historiques=[];
  const sortie=await genererAvecRecherche(async(endpoint,p)=>{
    historiques.push(p.messages);
    return historiques.length<3?{stop_reason:'pause_turn',content:[appel('a'+historiques.length)],usage:{input_tokens:10,output_tokens:20,server_tool_use:{web_search_requests:1}}}:fin();
  },payload);
  assert.equal(historiques.length,MAX_REPRISES+1);assert.equal(historiques[2].length,3);
  assert.deepEqual(historiques[2].map(m=>m.role),['user','assistant','assistant']);assert.equal(sortie.usage.output_tokens,190);
});
test('un tour encore en pause après deux reprises est rejeté',async()=>{
  let n=0;
  await assert.rejects(genererAvecRecherche(async()=>{n++;return {stop_reason:'pause_turn',content:[{type:'text',text:texte}],usage:{input_tokens:1,output_tokens:1}};},payload),/reponse_incomplete/);
  assert.equal(n,3);
});
test('les recherches restantes diminuent et aucune reprise ne réinitialise le plafond global',async()=>{
  const plafonds=[];
  await assert.rejects(genererAvecRecherche(async(endpoint,p)=>{
    plafonds.push(p.tools[0].max_uses);
    return {stop_reason:'pause_turn',content:[appel('a'+plafonds.length)],usage:{input_tokens:10,output_tokens:20,server_tool_use:{web_search_requests:plafonds.length===1?3:2}}};
  },payload),/reponse_incomplete/);
  assert.deepEqual(plafonds,[5,2]);
});
test('les résultats terminés limitent les reprises même si le compteur de recherches manque',async()=>{
  let n=0;
  await assert.rejects(genererAvecRecherche(async()=>{n++;return {stop_reason:'pause_turn',content:Array.from({length:5},(_,i)=>[appel('a'+i),resultat('a'+i)]).flat(),usage:{input_tokens:1,output_tokens:1}};},payload),/reponse_incomplete/);
  assert.equal(n,1);
});
test('quatre recherches terminées permettent de reprendre le cinquième appel en attente',async()=>{
  const plafonds=[];
  const pause={stop_reason:'pause_turn',content:[...Array.from({length:4},(_,i)=>[appel('a'+i),resultat('a'+i)]).flat(),appel('a4')],
    usage:{input_tokens:10,output_tokens:20,server_tool_use:{web_search_requests:4}}};
  const sortie=await genererAvecRecherche(async(endpoint,p)=>{
    plafonds.push(p.tools[0].max_uses);
    return plafonds.length===1?pause:fin([resultat('a4'),{type:'text',text:texte}],{input_tokens:10,output_tokens:20,server_tool_use:{web_search_requests:1}});
  },payload);
  assert.deepEqual(plafonds,[5,1]);assert.equal(sortie.recherches.tentatives,5);assert.equal(sortie.recherches.reussies,5);
  assert.equal(sortie.usage.server_tool_use.web_search_requests,5);
});
test('les appels en attente ne consomment pas le budget avant leurs résultats',async()=>{
  const plafonds=[];
  const sortie=await genererAvecRecherche(async(endpoint,p)=>{
    plafonds.push(p.tools[0].max_uses);
    return plafonds.length===1?{stop_reason:'pause_turn',content:Array.from({length:5},(_,i)=>appel('a'+i)),usage:{input_tokens:1,output_tokens:1}}:
      fin([...Array.from({length:5},(_,i)=>resultat('a'+i)),{type:'text',text:texte}],{input_tokens:10,output_tokens:20,server_tool_use:{web_search_requests:5}});
  },payload);
  assert.deepEqual(plafonds,[5,5]);assert.equal(sortie.recherches.reussies,5);
});
test('la somme des jetons de sortie conserve le plafond de la formule',async()=>{
  let n=0;
  await assert.rejects(genererAvecRecherche(async()=>{n++;return {stop_reason:'pause_turn',content:[{type:'text',text:texte}],usage:{input_tokens:1,output_tokens:1000}};},payload),/reponse_incomplete/);
  assert.equal(n,1);
  await assert.rejects(genererAvecRecherche(async()=>fin(undefined,{input_tokens:1,output_tokens:1001}),payload),/reponse_incomplete/);
});
test('le délai est partagé par toutes les reprises et reste plafonné à 162 secondes',async()=>{
  let temps=0,n=0;const delais=[];
  await assert.rejects(genererAvecRecherche(async(endpoint,p,delai)=>{delais.push(delai);n++;temps+=90000;return {stop_reason:'pause_turn',content:[{type:'text',text:texte}],usage:{input_tokens:1,output_tokens:1}};},payload,{timeoutMs:999999,maintenant:()=>temps}),{name:'TimeoutError'});
  assert.equal(n,2);assert.deepEqual(delais,[162000,72000]);
});
test('une recherche indisponible garde la réponse utile avec un avis et un statut explicite',async()=>{
  const sortie=await genererAvecRecherche(async()=>fin([
    appel('a'),resultat('a',{type:'web_search_tool_result_error',error_code:'unavailable'}),{type:'text',text:texte}
  ],{input_tokens:10,output_tokens:20,server_tool_use:{web_search_requests:0}}),payload);
  assert.match(sortie.reponse,/recherche Internet a rencontré une erreur/);
  assert.deepEqual(sortie.recherches,{effectuees:0,tentatives:1,reussies:0,erreurs:['unavailable']});
  assert.match(sortie.reponse,/La réponse explique/);
});
test('les erreurs de recherche pendant les pauses restent signalées dans le résultat final',async()=>{
  let n=0;
  const sortie=await genererAvecRecherche(async()=>++n===1?{
    stop_reason:'pause_turn',content:[appel('a'),resultat('a',{type:'web_search_tool_result_error',error_code:'too_many_requests'})],usage:{input_tokens:1,output_tokens:1}
  }:fin(),payload);
  assert.deepEqual(sortie.recherches.erreurs,['too_many_requests']);assert.match(sortie.reponse,/restent à vérifier/);
});
test('une recherche sans résultat est distincte d’une erreur et ne crée aucune citation',async()=>{
  const sortie=await genererAvecRecherche(async()=>fin([appel('a'),resultat('a'),{type:'text',text:texte}],{input_tokens:1,output_tokens:1,server_tool_use:{web_search_requests:1}}),payload);
  assert.deepEqual(sortie.recherches.erreurs,[]);assert.equal(sortie.recherches.reussies,1);
  assert.equal(sortie.reponse,texte);
});
test('les réponses tronquées, sans texte ou en attente d’un outil client sont rejetées',async()=>{
  for(const stop_reason of ['max_tokens','tool_use','refusal',undefined])
    await assert.rejects(genererAvecRecherche(async()=>({...fin(),stop_reason}),payload),/reponse_incomplete/);
  await assert.rejects(genererAvecRecherche(async()=>fin([appel('a')]),payload),/reponse_incomplete/);
  await assert.rejects(genererAvecRecherche(async()=>fin([{type:'text',text:'Bref.'}]),payload),/reponse_incomplete/);
  await assert.rejects(genererAvecRecherche(async()=>fin([{type:'text',text:'',citations:[citation()]}]),payload),/reponse_incomplete/);
});
test('les citations sont ajoutées au passage et dédupliquées sans recopier leur extrait',()=>{
  const source=citation();
  const sortie=serialiserTexte([{type:'text',text:texte,citations:[source,{...source},citation('https://www.courdecassation.fr/decision','Cour de cassation')]}]);
  assert.equal((sortie.match(/\[Légifrance\]/g)||[]).length,1);assert.match(sortie,/Cour de cassation/);
  assert.doesNotMatch(sortie,/INDEX-PRIVE|EXTRAIT-A-NE-PAS-COPIER/);
});
test('les fragments de citation conservent la ponctuation et les paragraphes du texte original',()=>{
  const sortie=serialiserTexte([
    {type:'text',text:'Texte sourcé',citations:[citation('https://example.org/source','Source')]},
    {type:'text',text:'. Explication.\n\nSuite.'}
  ]);
  assert.equal(sortie,'Texte sourcé [Source](https://example.org/source). Explication.\n\nSuite.');
  assert.doesNotMatch(sortie,/\n\n\./);
});
test('les citations précèdent les blancs finaux et les fragments gardent leurs séparateurs',()=>{
  const sortie=serialiserTexte([
    {type:'text',text:'  Un texte sourcé \n\n',citations:[citation('https://example.org/source','Source')]},
    {type:'text',text:'Une phrase '},
    {type:'text',text:'qui continue'},
    {type:'text',text:' avec son espace'},
    {type:'text',text:', puis sa ponctuation.  '}
  ]);
  assert.equal(sortie,'Un texte sourcé [Source](https://example.org/source) \n\nUne phrase qui continue avec son espace, puis sa ponctuation.');
});
test('deux parties autonomes sans séparateur fourni gardent un changement de paragraphe',()=>{
  assert.equal(serialiserTexte([{type:'text',text:'Première partie.'},{type:'text',text:'Deuxième partie.'}]),'Première partie.\n\nDeuxième partie.');
});
test('les titres hostiles sont échappés et les parenthèses des URL sont encodées',()=>{
  const sortie=serialiserTexte([{type:'text',text:texte,citations:[citation('https://example.org/article(test)?a=(b)','Titre](javascript:alert(1)) <img> **gras**')]}]);
  assert.match(sortie,/Titre\\\]\\\(javascript/);assert.match(sortie,/<img>/);
  assert.match(sortie,/https:\/\/example\.org\/article%28test%29\?a=%28b%29/);
  assert.doesNotMatch(sortie,/&lt;img&gt;|\]\(javascript:/);
  assert.match(serialiserTexte([{type:'text',text:texte,citations:[citation(undefined,'Droit & procédures <2026>')]}]),/Droit & procédures <2026>/);
});
test('seuls les liens HTTP et HTTPS sans identifiants ni caractères de contrôle sont publiés',()=>{
  const interdits=['javascript:alert(1)','data:text/html,x','file:///etc/passwd','https://nom:secret@example.org/','https://nom@example.org/',
    'https://example.org/\nattaque','https://example.org/a b','//example.org/','malforme'];
  for(const url of interdits)assert.equal(serialiserTexte([{type:'text',text:texte,citations:[citation(url)]}]),texte,url);
  assert.match(serialiserTexte([{type:'text',text:texte,citations:[citation('http://example.org/source','')]}]),/\[example\.org\]\(http:/);
});
test('les autres types de citation et les blocs de recherche ne deviennent jamais du texte publié',()=>{
  const sortie=serialiserTexte([resultat('a',[{type:'web_search_result',title:'SECRET',encrypted_content:'DONNEE'}]),
    {type:'thinking',thinking:'SECRET'}, {type:'text',text:texte,citations:[{...citation(),type:'char_location'}]}]);
  assert.equal(sortie,texte);assert.equal(serialiserTexte(null),'');
});
test('les usages invalides et les configurations incorrectes échouent avant faux succès',async()=>{
  for(const output_tokens of [-1,NaN,1.5,'2'])
    await assert.rejects(genererAvecRecherche(async()=>fin(undefined,{input_tokens:1,output_tokens}),payload),/usage_invalide/);
  for(const p of [{...payload,max_tokens:0},{...payload,messages:null}])
    await assert.rejects(genererAvecRecherche(async()=>fin(),p),/configuration_recherche/);
});
test('une erreur de transport interrompt les reprises et remonte intacte au gestionnaire de crédit',async()=>{
  const erreur=new Error('modele_503');let n=0;
  await assert.rejects(genererAvecRecherche(async()=>{n++;throw erreur;},payload),e=>e===erreur);
  assert.equal(n,1);
});
