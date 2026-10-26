const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {gzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const corpus=require('../api/_portalis-corpus');
const USER='10000000-0000-4000-8000-000000000001',ID='20000000-0000-4000-8000-000000000001';
const sources=[
  {id:'majeures-contrats',titre:'Majeures de droit des contrats',type:'majeure',matiere:'droit-des-contrats',pages:20},
  {id:'cours-contrats',titre:'Cours de droit des contrats',type:'cours',matiere:'droit-des-contrats',pages:20},
  {id:'cours-admin',titre:'Cours de droit administratif',type:'cours',matiere:'droit-administratif',pages:20}
];
const donnees={version:'version-fixture',sources,passages:[
  {id:'offre',source:0,pageDebut:2,pageFin:3,titre:'Offre et rétractation',texte:'Une offre ferme comporte les éléments essentiels et la volonté de se lier. Sa rétractation avant le délai empêche la vente selon l’article 1116.'},
  {id:'dol',source:0,pageDebut:7,pageFin:7,titre:'Le dol',texte:'Le dol est une tromperie. Les manœuvres et les mensonges déterminants peuvent entraîner une erreur et vicier le consentement.'},
  {id:'cours-offre',source:1,pageDebut:4,pageFin:4,titre:'Effet de la rétractation',texte:'La rétractation de l’offre empêche la conclusion. La responsabilité exige un dommage et un lien causal. Le bénéfice attendu est exclu.'},
  {id:'public',source:2,pageDebut:8,pageFin:8,titre:'Service public',texte:'Un service public peut être géré par une personne privée. La continuité et l’égalité régissent son fonctionnement.'}
]};
test('les quatre exercices recherchent des extraits pertinents avec leur provenance',()=>{
  const rechercher=corpus.creerRecherche(donnees);
  for(const exercice of ['fiche','commentaire','cas','dissertation']) {
    const selection=rechercher({exercice,texte:'Droit des contrats. Une offre ferme est rétractée avant son délai.'});
    assert.ok(selection.passages.some(p=>p.id==='offre'));
    assert.ok(selection.passages.every(p=>p.matiere==='droit-des-contrats'));
    const message=corpus.formaterCorpus(selection);
    assert.match(message,/source="majeures-contrats"/);assert.match(message,/page_debut="2" page_fin="3"/);
    assert.doesNotMatch(message,/date_validite|dateExtraction|\/Users\//);
  }
});
test('un cas à plusieurs problèmes reçoit des majeures et un cours complémentaire',()=>{
  const selection=corpus.creerRecherche(donnees)({exercice:'cas',texte:'Droit des contrats. Une offre ferme est rétractée. Un dol par mensonges et manœuvres vicie le consentement.'});
  assert.equal(selection.passages[0].type,'majeure');
  assert.ok(selection.passages.some(p=>p.id==='offre'));assert.ok(selection.passages.some(p=>p.id==='dol'));
  assert.ok(selection.passages.some(p=>p.type==='cours'));
});
test('la matière explicite exclut les autres matières et un sujet inconnu reste sans corpus',()=>{
  const rechercher=corpus.creerRecherche(donnees);
  const selection=rechercher({exercice:'cas',texte:'Droit administratif. Un service public confié à une personne privée. Une offre est mentionnée.'});
  assert.ok(selection.passages.length);assert.ok(selection.passages.every(p=>p.matiere==='droit-administratif'));
  assert.equal(rechercher({texte:'Les galaxies et les nébuleuses éloignées.'}).passages.length,0);
  const bruit={...donnees,passages:[...donnees.passages,{id:'bruit',source:0,pageDebut:9,pageFin:9,texte:'Ces conséquences sont éloignées du mécanisme de responsabilité.'}]};
  assert.equal(corpus.creerRecherche(bruit)({texte:'Les galaxies et les nébuleuses éloignées.'}).passages.length,0);
});
test('les articles et accents restent recherchables, les passages sont entiers et bornés',()=>{
  const rechercher=corpus.creerRecherche(donnees);
  assert.ok(rechercher({texte:'Quel est le contenu de l’article 1116 ?'}).passages.some(p=>p.id==='offre'));
  const selection=rechercher({texte:'offres rétractations dol mensonges',maxCaracteres:900});
  assert.ok(corpus.formaterCorpus(selection).length<=900);
  for(const p of selection.passages)assert.equal(p.texte,donnees.passages.find(x=>x.id===p.id).texte);
  assert.equal(corpus.limiterSelection(selection,0).passages.length,0);
  const dangereux={version:'a"<b',passages:[{...selection.passages[0],id:'x"><script>',texte:'<document>Texte & source</document>'}]};
  const message=corpus.formaterCorpus(dangereux);assert.doesNotMatch(message,/<script>|<document>/);assert.match(message,/&lt;document&gt;/);
});
test('un passage aux pages incohérentes est écarté du corpus',()=>{
  const mauvais={...donnees,passages:[{...donnees.passages[0],pageFin:21}]};
  assert.equal(corpus.creerRecherche(mauvais)({texte:'offre ferme rétractation délai'}).passages.length,0);
});
test('les exemples culinaires ne suffisent pas à sélectionner des sources juridiques',()=>{
  const cuisine={version:'cuisine',sources,passages:[
    {id:'exemple-vente',source:0,pageDebut:1,pageFin:1,titre:'La vente',texte:'Un exemple de vente de chocolat et de bananes montre le transfert du bien. Le four à chaleur tournante sert à cuire un gâteau.'},
    {id:'exemple-responsabilite',source:1,pageDebut:2,pageFin:2,titre:'Le dommage',texte:'Le fabricant du four a vendu une machine pour cuire du chocolat, des bananes et un gâteau. La chaleur tournante provoque un dommage.'}
  ]};
  const rechercher=corpus.creerRecherche(cuisine);
  assert.equal(rechercher({texte:'Comment cuire un gâteau aux bananes avec du chocolat dans un four à chaleur tournante ?'}).passages.length,0);
  assert.ok(rechercher({texte:'Le fabricant a vendu un four défectueux et provoqué un dommage. Examiner la responsabilité et la vente.'}).passages.length);
  assert.equal(rechercher({texte:'Un gâteau de 2026 préparé avec des fruits.'}).passages.length,0);
});
test('la matière, le niveau et le semestre distinguent cours généraux et contrats spéciaux',()=>{
  const d={version:'matieres',sources:[
    {...sources[0],niveau:'L2',semestre:'S1'},
    {...sources[1],niveau:'L2',semestre:'S1'},
    {id:'speciaux',titre:'Contrats spéciaux',type:'cours',matiere:'contrats-speciaux',niveau:'L3',semestre:'S1',pages:10}
  ],passages:[
    {id:'general',source:1,pageDebut:1,pageFin:1,texte:'La vente et la promesse unilatérale comportent des conditions propres.'},
    {id:'special',source:2,pageDebut:1,pageFin:1,texte:'La vente et la promesse unilatérale comportent des conditions propres.'}
  ]};
  const rechercher=corpus.creerRecherche(d);
  assert.ok(rechercher({texte:'Droit des contrats L2 S1. Vente et promesse unilatérale.'}).passages.every(p=>p.sourceId==='cours-contrats'));
  assert.ok(rechercher({texte:'Contrats spéciaux L3 S1. Vente et promesse unilatérale.'}).passages.every(p=>p.sourceId==='speciaux'));
  const niveaux={...d,sources:[{...sources[1],id:'s2',niveau:'L2',semestre:'S2'},{...sources[1],id:'s1',niveau:'L2',semestre:'S1'}],passages:d.passages.map((p,i)=>({...p,source:i}))};
  assert.equal(corpus.creerRecherche(niveaux)({texte:'Droit des contrats L2 S1. Vente et promesse unilatérale.'}).passages[0].sourceId,'s1');
});
test('une majeure préparée précède un ancien cas pratique à couverture équivalente',()=>{
  const d={version:'priorite',sources:[{...sources[0],id:'ancien',type:'majeure-cas'},{...sources[0],id:'preparee',type:'majeure'}],passages:[
    {id:'ancien',source:0,pageDebut:1,pageFin:1,texte:'Une offre ferme et son acceptation permettent la conclusion. Offre ferme, acceptation.'},
    {id:'preparee',source:1,pageDebut:1,pageFin:1,texte:'Une offre ferme et son acceptation permettent la conclusion.'}
  ]};
  assert.equal(corpus.creerRecherche(d)({exercice:'cas',texte:'Droit des contrats. Une offre ferme et son acceptation.'}).passages[0].sourceId,'preparee');
});
function chargerGeneration({comptes=[100],selection,changerSelection}={}) {
  const calls=[],payloads=[],module={exports:{}};
  const realRequire=require('node:module').createRequire(path.join(__dirname,'../api/_portalis-generation.js'));
  const baseSelection=selection||{version:'v1',passages:Array.from({length:4},(_,i)=>({id:'p'+i,sourceId:'source'+i,titreSource:'Cours de contrats',type:'cours',matiere:'droit-des-contrats',pageDebut:i+1,pageFin:i+1,titre:'Offre',texte:'Une offre ferme et sa rétractation. '.repeat(35)}))};
  const stubs={
    './_portalis-corpus':{...corpus,rechercher:async()=>changerSelection?changerSelection():baseSelection},
    './_portalis-store':{...realRequire('./_portalis-store'),documents:async()=>[],rpc:async(name,args)=>{
      calls.push({name,args});if(name==='portalis_etat')return{actif:true};if(name==='portalis_reserver')return{code:'reservee',formule:'portalis'};return true;
    }}
  };
  const requireStub=name=>Object.hasOwn(stubs,name)?stubs[name]:realRequire(name);requireStub.resolve=realRequire.resolve;
  let numero=0;
  const fetch=async(url,options)=>{
    const payload=JSON.parse(options.body);payloads.push({url,payload});
    return{ok:true,json:async()=>url.endsWith('count_tokens')?{input_tokens:comptes[numero++]}:{stop_reason:'end_turn',content:[{type:'text',text:'Une réponse terminée avec un raisonnement utile.'}],usage:{input_tokens:100,output_tokens:100}}};
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/_portalis-generation.js'),'utf8'),{require:requireStub,module,console:{error(){}},Buffer,AbortSignal,URLSearchParams,setTimeout,clearTimeout,process:{env:{ANTHROPIC_API_KEY:'fixture'}},fetch});
  return {generation:module.exports,calls,payloads};
}
const body={exercice:'cas',demandeId:ID,texte:'Droit des contrats. Une offre ferme a été rétractée.'};
test('le corpus reste distinct des documents étudiants et de leurs limites publiques',async()=>{
  const {generation}=chargerGeneration();
  const prep=await generation.preparer({...body,texte:'x'.repeat(30000)},USER);
  assert.match(prep.messages[0].content,/<document origine="texte_saisi"/);assert.match(prep.messages[0].content,/<corpus_pedagogique/);
  assert.ok(prep.messages[0].content.indexOf('</dossier>')<prep.messages[0].content.indexOf('<corpus_pedagogique'));
  assert.ok(prep.messages[0].content.length>30000);
});
test('le comptage et la génération partagent exactement le contexte réduit',async()=>{
  const {generation,calls,payloads}=chargerGeneration({comptes:[21000,19999]});
  await generation.generer(body,USER);
  assert.equal(payloads.length,3);const dernier=payloads[1].payload,gen=payloads[2].payload;
  assert.deepEqual(gen.messages,dernier.messages);assert.equal(gen.system,dernier.system);
  assert.ok(gen.messages[0].content.length<payloads[0].payload.messages[0].content.length);
  assert.match(gen.messages[0].content,/<corpus_pedagogique/);
  assert.equal(calls.filter(c=>c.name==='portalis_reserver').length,1);
});
test('le dossier original est conservé si le corpus réduit dépasse encore 20 000 jetons',async()=>{
  const {generation,payloads}=chargerGeneration({comptes:[23000,21000,20000]});
  await generation.generer(body,USER);
  assert.equal(payloads.length,4);const base=payloads[2].payload,gen=payloads[3].payload;
  assert.doesNotMatch(base.messages[0].content,/<corpus_pedagogique/);assert.doesNotMatch(base.system,/Le corpus pédagogique contient/);
  assert.match(base.messages[0].content,/Une offre ferme a été rétractée/);
  assert.deepEqual(gen.messages,base.messages);assert.equal(gen.system,base.system);
});
test('une entrée encore trop dense sans corpus reste rejetée avant réservation',async()=>{
  const {generation,calls,payloads}=chargerGeneration({comptes:[23000,21000,20001]});
  await assert.rejects(generation.generer(body,USER),{code:'volume'});
  assert.equal(payloads.length,3);assert.ok(!calls.some(c=>c.name==='portalis_reserver'));
});
test('la version et les passages effectivement sélectionnés déterminent l’empreinte',async()=>{
  let selection={version:'v1',passages:[]};
  const {generation}=chargerGeneration({changerSelection:()=>selection});
  const a=await generation.preparer(body,USER);selection={version:'v2',passages:[]};
  const b=await generation.preparer(body,USER);assert.notEqual(a.empreinte,b.empreinte);
  selection={version:'v2',passages:[{id:'p',sourceId:'s',type:'cours',pageDebut:1,pageFin:1,titreSource:'Cours',texte:'Une source pédagogique.'}]};
  const c=await generation.preparer(body,USER);assert.notEqual(b.empreinte,c.empreinte);
  assert.equal(c.empreinte,(await generation.preparer(body,USER)).empreinte);
});
function chargerModule(fichier,stubs) {
  const module={exports:{}},chemin=path.join(__dirname,'../api/',fichier);
  const realRequire=require('node:module').createRequire(chemin);
  vm.runInNewContext(fs.readFileSync(chemin,'utf8'),{module,require:nom=>Object.hasOwn(stubs,nom)?stubs[nom]:realRequire(nom),Buffer,console:{error(){}}});
  return module.exports;
}
function fixturePrivee() {
  const version='a'.repeat(64),d={...donnees,version};
  const buffer=gzipSync(Buffer.from(JSON.stringify(d)));
  return {buffer,manifest:{version,chemin:`${version}.json.gz`,sha256:createHash('sha256').update(buffer).digest('hex'),octets:buffer.length,maxOctetsDecompresses:50000000}};
}
test('le chargeur privé utilise le service serveur et partage un unique téléchargement',async()=>{
  const {buffer,manifest}=fixturePrivee();let calls=0,liberer;
  const loader=chargerModule('_portalis-corpus-data.js',{
    './_portalis-corpus-manifest':manifest,
    './_portalis-store':{service:async chemin=>{calls++;assert.equal(chemin,`/storage/v1/object/portalis-corpus/${manifest.chemin}`);await new Promise(resolve=>{liberer=resolve;});return new Response(buffer,{headers:{'Content-Length':String(buffer.length)}});}}
  });
  const a=loader.chargerCorpus(),b=loader.chargerCorpus();assert.strictEqual(a,b);assert.equal(calls,1);liberer();
  const [x,y]=await Promise.all([a,b]);assert.strictEqual(x,y);assert.equal(x.version,manifest.version);assert.equal(x.passages.length,donnees.passages.length);
  assert.strictEqual(await loader.chargerCorpus(),x);assert.equal(calls,1);
});
test('une intégrité invalide ne reste pas en cache et peut être retentée',async()=>{
  const {buffer,manifest}=fixturePrivee(),alteration=Buffer.from(buffer);alteration[0]^=1;let calls=0;
  const loader=chargerModule('_portalis-corpus-data.js',{
    './_portalis-corpus-manifest':manifest,
    './_portalis-store':{service:async()=>new Response(++calls===1?alteration:buffer)}
  });
  await assert.rejects(loader.chargerCorpus(),{message:'corpus_integrite'});
  assert.equal((await loader.chargerCorpus()).version,manifest.version);assert.equal(calls,2);
});
test('le manifest privé interdit un autre chemin et des tailles hors limites avant tout accès',async()=>{
  const {manifest}=fixturePrivee();
  for(const changements of [{chemin:'../cours.json.gz'},{octets:21*1024*1024},{maxOctetsDecompresses:50000001},{sha256:'invalide'}]) {
    const loader=chargerModule('_portalis-corpus-data.js',{'./_portalis-corpus-manifest':{...manifest,...changements},'./_portalis-store':{service:async()=>assert.fail('Stockage appelé pour un manifest invalide')}});
    await assert.rejects(loader.chargerCorpus(),{message:'corpus_manifest'});
  }
});
test('les limites de téléchargement, de décompression et de version sont vérifiées',async()=>{
  const {buffer,manifest}=fixturePrivee();
  for(const [m,reponse,erreur] of [
    [manifest,()=>new Response(buffer,{headers:{'Content-Length':String(buffer.length+1)}}),'corpus_taille'],
    [manifest,()=>new Response(Buffer.concat([buffer,Buffer.from('x')])),'corpus_taille'],
    [{...manifest,maxOctetsDecompresses:32},()=>new Response(buffer),'corpus_decompression'],
    [{...manifest,version:'b'.repeat(64),chemin:`${'b'.repeat(64)}.json.gz`},()=>new Response(buffer),'corpus_version']
  ]) {
    const loader=chargerModule('_portalis-corpus-data.js',{'./_portalis-corpus-manifest':m,'./_portalis-store':{service:async()=>reponse()}});
    await assert.rejects(loader.chargerCorpus(),{message:erreur});
  }
});
test('la recherche asynchrone partage le chargement et la construction de l’index',async()=>{
  let calls=0;
  const moteur=chargerModule('_portalis-corpus.js',{'./_portalis-corpus-data':{chargerCorpus:async()=>{calls++;await Promise.resolve();return donnees;}}});
  const options={exercice:'cas',texte:'Droit des contrats. Offre ferme, acceptation et rétractation.'};
  const sorties=await Promise.all([moteur.rechercher(options),moteur.rechercher(options),moteur.rechercher(options)]);
  assert.equal(calls,1);assert.ok(sorties.every(s=>s.passages.some(p=>p.id==='offre')));
});
test('un échec du chargement asynchrone permet une nouvelle tentative de recherche',async()=>{
  let calls=0;
  const moteur=chargerModule('_portalis-corpus.js',{'./_portalis-corpus-data':{chargerCorpus:async()=>{if(++calls===1)throw new Error('indisponible');return donnees;}}});
  await assert.rejects(moteur.rechercher({texte:'offre ferme rétractation'}),{message:'indisponible'});
  assert.ok((await moteur.rechercher({texte:'offre ferme rétractation'})).passages.length);assert.equal(calls,2);
});
test('le module livrable contient un chargeur et aucun corpus encodé',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../api/_portalis-corpus-data.js'),'utf8');
  assert.ok(Buffer.byteLength(source)<10000);assert.doesNotMatch(source,/H4sI[A-Za-z0-9+/=]{100}|module\.exports\s*=\s*\{\s*version:/);
  assert.match(source,/require\('\.\/_portalis-store'\)/);
});

test('les intitulés obligations et pénal conservent leurs branches pertinentes',()=>{
  const rechercher=corpus.creerRecherche({version:'branches',sources:[
    {id:'c',titre:'Contrats',type:'majeure',matiere:'droit-des-contrats',pages:10},
    {id:'r',titre:'Responsabilité civile',type:'majeure',matiere:'droit-de-la-responsabilite-civile',pages:10},
    {id:'p',titre:'Pénal spécial',type:'majeure',matiere:'droit-penal-special',pages:10}
  ],passages:[
    {id:'c',source:0,pageDebut:1,pageFin:1,texte:'Le contrat résulte de la rencontre de l’offre et de l’acceptation.'},
    {id:'r',source:1,pageDebut:1,pageFin:1,texte:'Une voiture heurte un piéton. La garde de la chose et le dommage expliquent la responsabilité.'},
    {id:'p',source:2,pageDebut:1,pageFin:1,texte:'Le vol est la soustraction frauduleuse de la chose d’autrui.'}
  ]});
  assert.ok(rechercher({exercice:'cas',texte:'Droit des obligations. Une voiture heurte un piéton. Examiner la garde de la chose et le dommage.'}).passages.some(p=>p.id==='r'));
  assert.ok(rechercher({exercice:'cas',texte:'Droit pénal. Le vol est-il une soustraction frauduleuse de la chose d’autrui ?'}).passages.some(p=>p.id==='p'));
});

test('le module versionné dans le dépôt public reste un chargeur sans cours encodé',()=>{
  const p=path.join(__dirname,'../api/_portalis-corpus-data.js'),texte=fs.readFileSync(p,'utf8');
  assert.ok(Buffer.byteLength(texte)<16000);
  assert.doesNotMatch(texte,/Buffer\.from\(['"][A-Za-z0-9+/=]{1000}/);
  assert.doesNotMatch(texte,/Fiche_complete_|Majeures_Contrats|majeures-preparees\//);
  assert.match(texte,/portalis-corpus/);
});
