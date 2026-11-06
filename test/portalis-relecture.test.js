const test=require('node:test'),assert=require('node:assert/strict');
const {appliquerCorrections,verifierReperes,relire}=require('../api/_portalis-relecture');
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
