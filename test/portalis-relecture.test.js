const test=require('node:test'),assert=require('node:assert/strict');
const {appliquerCorrections,verifierReperes,relire,verifierTitres}=require('../api/_portalis-relecture');
const titresQualifies=[
  "## I. L'admission encadrée de l'erreur du vendeur sur l'authenticité",
  "### A. La reconnaissance légitime de l'authenticité comme qualité substantielle",
  "### B. L'exigence nécessaire d'une recherche de la conviction du vendeur",
  "## II. L'exclusion rigoureuse de l'erreur par l'aléa accepté",
  "### A. La caractérisation précise de l'aléa entré dans le champ contractuel",
  "### B. Le maintien cohérent de la vente après la dissipation de l'incertitude"
];
const titresSansQualification=new Map([
  [1,"### A. La reconnaissance de l'authenticité comme qualité substantielle invocable par le vendeur"],
  [2,"### B. L'exigence d'une recherche de la conviction erronée du vendeur"],
  [4,"### A. La caractérisation de l'aléa entré dans le champ contractuel"],
  [5,"### B. Le maintien de la vente après la dissipation de l'incertitude"]
]);
test('les six titres qualifient leur nom d’action, y compris les sous-parties',()=>{
  assert.doesNotThrow(()=>verifierTitres(titresQualifies.join('\n\n')));
  for(const [index,titre] of titresSansQualification){
    const titres=[...titresQualifies];titres[index]=titre;
    assert.throws(()=>verifierTitres(titres.join('\n\n')),{message:'relecture_incomplete',raison:'titre_non_qualifie_'+(index+1)});
  }
});
test('la qualification suit le groupe entier d’un nom d’action composé',()=>{
  for(const action of ['mise en œuvre','mise en oeuvre','prise en compte','remise en cause','mise à l’écart']){
    assert.doesNotThrow(()=>verifierTitres('**I. La '+action+' limitée de la règle**'));
    assert.throws(()=>verifierTitres('I. La '+action+' de la règle'),{message:'relecture_incomplete',raison:'titre_non_qualifie_1'});
  }
});
test('les corrections suivent leurs passages exacts et conservent le développement',()=>{
  const texte='Premier paragraphe à conserver.\n\nUn passage à reprendre.\n\nDernier paragraphe à conserver.';
  const resultat=appliquerCorrections(texte,{corrections:[{avant:'Un passage à reprendre.',apres:'Le passage corrigé explique le raisonnement.'}],blocages:[]});
  assert.equal(resultat,'Premier paragraphe à conserver.\n\nLe passage corrigé explique le raisonnement.\n\nDernier paragraphe à conserver.');
});
test('un passage ambigu ou absent arrête la correction',()=>{
  for(const avant of ['Phrase répétée.','Passage absent.'])assert.throws(()=>appliquerCorrections('Phrase répétée. Phrase répétée.',{corrections:[{avant,apres:'Correction.'}],blocages:[]}),/correction_ambigue/);
  assert.throws(()=>appliquerCorrections('Un texte suffisamment long pour une relecture.',{corrections:[],blocages:['Une décision manque.']}),/relecture_incomplete/);
});
test('les repères citent le dossier avec un statut identifié',()=>{
  const message="La Cour demande de rechercher la conviction de l'acheteur.\nLes faits restent à examiner.";
  const rapport={reperes:[{reference:'Décision de test',points:[{statut:'a_rechercher',enonce:'La conviction reste à rechercher.',extrait:'La Cour demande de rechercher la conviction de l’acheteur.'}]}]};
  assert.doesNotThrow(()=>verifierReperes(rapport,message));
  const point=rapport.reperes[0].points[0];
  point.extrait='Une phrase inventée qui figure seulement dans la copie.';
  assert.throws(()=>verifierReperes(rapport,message),/extrait_absent/);
  point.extrait=message;point.statut='inconnu';
  assert.throws(()=>verifierReperes(rapport,message),/reperes_invalides/);
  assert.throws(()=>verifierReperes({reperes:[]},message),/reperes_absents/);
  assert.doesNotThrow(()=>verifierReperes({reperes:[{reference:'Décision',points:[{statut:'solution',enonce:'La Cour rejette le pourvoi.',extrait:'REJETTE le pourvoi'}]}]},'Par ces motifs, REJETTE le pourvoi.'));
});
test('la relecture accepte le dossier accompagné de la copie et refuse le dépassement avant tout appel payant',async()=>{
  const message='Le juge doit rechercher la conviction du vendeur avant de statuer sur sa demande.';
  const copie='Une copie complète dont les affirmations sont vérifiées à partir du dossier.';
  for(const volume of [30000,40000,40001]){
    const appels=[];
    const anthropic=async(endpoint)=>{
      appels.push(endpoint);
      if(endpoint==='/count_tokens')return{input_tokens:volume};
      return{stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({reperes:[{reference:'Décision',points:[{statut:'a_rechercher',enonce:'La conviction reste à rechercher.',extrait:message}]}],corrections:[],blocages:[]})}],usage:{input_tokens:volume,output_tokens:100}};
    };
    const traitement=relire(anthropic,{message,copie,budget:2000,effort:'medium',timeoutMs:15000});
    if(volume<=40000){assert.equal((await traitement).reponse,copie);assert.deepEqual(appels,['/count_tokens','']);}
    else{await assert.rejects(traitement,/volume_relecture/);assert.deepEqual(appels,['/count_tokens']);}
  }
});

const message='La Cour demande de rechercher la conviction du vendeur avant de statuer.';
const copie='La conviction du vendeur est déjà prouvée. Le juge doit examiner les éléments du dossier.';
const rapportValide=()=>({reperes:[{reference:'Décision',points:[{statut:'a_rechercher',enonce:'La conviction reste à rechercher.',extrait:message}]}],
  corrections:[{avant:'La conviction du vendeur est déjà prouvée.',apres:'La conviction du vendeur reste à rechercher.'}],blocages:[]});
test('un rapport inutilisable est repris sur la copie originale et ses deux usages restent comptés',async()=>{
  for(const defaut of ['json','blocages','correction_ambigue']){
    const requetes=[];
    const anthropic=async(endpoint,payload)=>{
      if(endpoint==='/count_tokens')return{input_tokens:500};
      requetes.push(payload);
      const rapport=rapportValide();
      if(requetes.length===1){
        if(defaut==='blocages')rapport.blocages=['Le passage doit être reformulé avant sa livraison.'];
        if(defaut==='correction_ambigue')rapport.corrections.push({avant:'Un passage absent du texte.',apres:'Une correction.'});
      }
      return{stop_reason:'end_turn',content:[{type:'text',text:requetes.length===1&&defaut==='json'?'{"corrections":[':JSON.stringify(rapport)}],usage:{input_tokens:500,output_tokens:700}};
    };
    const r=await relire(anthropic,{message,copie,budget:3000,effort:'low',timeoutMs:15000});
    assert.equal(r.reponse,'La conviction du vendeur reste à rechercher. Le juge doit examiner les éléments du dossier.');
    assert.deepEqual(r.usage,{input_tokens:1000,output_tokens:1400});
    assert.deepEqual(requetes.map(p=>p.max_tokens),[3000,2300]);
    assert.match(requetes[1].messages[0].content,/<rapport_a_reprendre>/);
    assert.ok(requetes.every(p=>p.messages[0].content.includes(copie)));
    assert.equal(requetes[0].output_config.format.type,'json_schema');
  }
});
test('un blocage confirmé ou une citation inventée restent des échecs après la reprise',async()=>{
  for(const defaut of ['blocages','extrait_absent']){
    let appels=0;
    const anthropic=async endpoint=>{
      if(endpoint==='/count_tokens')return{input_tokens:500};
      appels++;
      const rapport=rapportValide();
      if(defaut==='blocages')rapport.blocages=['La seconde décision manque dans le dossier.'];
      else rapport.reperes[0].points[0].extrait='Cette phrase ne figure dans aucun document du sujet.';
      return{stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(rapport)}],usage:{input_tokens:500,output_tokens:500}};
    };
    await assert.rejects(relire(anthropic,{message,copie,budget:3000,effort:'low',timeoutMs:15000}),
      defaut==='blocages'?{message:'relecture_incomplete',raison:'blocages'}:{message:'extrait_absent'});
    assert.equal(appels,2);
  }
});
test('une relecture tronquée garde sa cause précise et ne dépasse pas le budget pour réessayer',async()=>{
  let appels=0;
  const anthropic=async endpoint=>{
    if(endpoint==='/count_tokens')return{input_tokens:500};
    appels++;
    return{stop_reason:'max_tokens',content:[{type:'text',text:'{"reperes":['}],usage:{input_tokens:500,output_tokens:1500}};
  };
  await assert.rejects(relire(anthropic,{message,copie,budget:1500,effort:'low',timeoutMs:15000}),{message:'relecture_incomplete',raison:'max_tokens'});
  assert.equal(appels,1);
});
test('un titre encore sans qualification déclenche une reprise de tous les titres et de leurs annonces',async()=>{
  const titres= titresQualifies.map((titre,index)=>titresSansQualification.get(index)||titre);
  const texte=titres.join('\n\n');
  const requetes=[];
  const anthropic=async(endpoint,payload)=>{
    if(endpoint==='/count_tokens')return{input_tokens:500};
    requetes.push(payload);
    const rapport=rapportValide();
    rapport.corrections=requetes.length===1?[]:[...titresSansQualification].map(([index,avant])=>({avant,apres:titresQualifies[index]}));
    return{stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(rapport)}],usage:{input_tokens:500,output_tokens:500}};
  };
  const r=await relire(anthropic,{message,copie:texte,budget:3000,effort:'low',timeoutMs:15000});
  assert.equal(r.reponse,titresQualifies.join('\n\n'));
  assert.equal(requetes.length,2);
  assert.match(requetes[1].messages[0].content,/titre_non_qualifie_2/);
  assert.match(requetes[1].system,/vérifie les six titres/);
  assert.match(requetes[1].system,/Les reprises dans l’annonce du plan et les chapeaux/);
  assert.deepEqual(r.usage,{input_tokens:1000,output_tokens:1000});
});
