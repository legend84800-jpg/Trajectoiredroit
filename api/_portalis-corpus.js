// Recherche locale dans le corpus pédagogique privé, après chargement serveur.
const MAX_CARACTERES=20000;
const MOTS_VIDES=new Set(('a ai ainsi alors au aucun aussi autre aux avec avoir c ce ces cet cette ceux comme comment dans de des du elle elles en est et etre eux fait faire il ils je la le les leur lui mais me meme mes ne nos notre nous on ou par pas pendant plus pour pourquoi que quel quelle quelles quels qui sa sans se ses si son sont sous sur ta te tes toi ton tous tout toute toutes tu un une vos votre vous y apres avant bien cas choisir commentaire copie corrige corriger cours decision demande dossier droit exercice explique expliquer fiche faut fournis fourni juridique juridique loi methode partie parties peu peux peut pouvoir prepare preparer question redige rediger reponse selon seulement situation sujet texte travail tres').split(' '));
function normaliser(texte) {return String(texte||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function termes(texte) {
  const familles=[[/^retract/,'retractation'],[/^accept/,'acceptation'],[/^negoci/,'negociation'],[/^resili/,'resiliation'],[/^responsab/,'responsabilite'],[/^oblig/,'obligation'],[/^annul/,'annulation'],[/^promess/,'promesse'],[/^(?:vice|vici)/,'vice'],[/^contract/,'contrat']];
  return (normaliser(texte).match(/[a-z]{2,}|\d{3,4}(?:-\d+)*/g)||[]).map(m=>{
    const famille=familles.find(([re])=>re.test(m));
    return famille?famille[1]:m.length>4&&m.endsWith('s')&&!m.endsWith('ss')?m.slice(0,-1):m;
  }).filter(m=>m.length>2&&!MOTS_VIDES.has(m));
}
function frequences(mots) {const f=new Map();for(const m of mots)f.set(m,(f.get(m)||0)+1);return f;}
function matieresExplicites(texte) {
  const t=normaliser(texte),choix=[];
  const familles=[
    [/(?:droit\s+des?\s+)?contrats?\s+speciaux/,'contrats-speciaux'],[/droit\s+(?:des?\s+|du\s+)?contrats?\b(?!\s+speciaux)/,'droit-des-contrats'],
    [/droit\s+administratif/,'droit-administratif'],[/droit\s+constitutionnel/,'droit-constitutionnel'],[/droit\s+commercial/,'droit-commercial'],
    [/droit\s+penal\s+general/,'droit-penal-general'],[/droit\s+penal\s+special/,'droit-penal-special'],[/droit\s+penal(?!\s+(?:general|special))/,'droit-penal'],
    [/droit\s+(?:des?\s+)?societes/,'droit-des-societes'],[/droit\s+(?:de\s+la\s+)?famille/,'droit-de-la-famille'],[/droit\s+(?:des?\s+)?biens/,'droit-des-biens'],[/droit\s+(?:des?\s+)?personnes/,'droit-des-personnes'],[/droit\s+(?:du\s+)?travail/,'droit-du-travail'],
    [/droit\s+(?:de\s+la\s+)?responsabilite\s+civile/,'droit-de-la-responsabilite-civile'],[/droit\s+international\s+prive|\bdip\b/,'droit-international-prive'],
    [/procedure\s+civile/,'procedure-civile'],[/procedure\s+penale/,'procedure-penale'],[/finances?\s+publiques/,'finances-publiques'],
    [/histoire\s+du\s+droit/,'histoire-du-droit'],[/histoire\s+des?\s+institutions/,'histoire-des-institutions'],[/introduction\s+au\s+droit/,'introduction-au-droit'],[/philosophie\s+du\s+droit/,'philosophie-du-droit'],[/relations?\s+internationales/,'relations-internationales']
  ];
  for(const [expression,matiere] of familles)if(expression.test(t))choix.push(matiere);
  if(/droit\s+des?\s+obligations/.test(t))choix.push('droit-des-contrats','droit-de-la-responsabilite-civile');
  return choix;
}
function matiereCompatible(source,matieres) {
  if(!matieres.length)return true;
  const matiere=normaliser(source.matiere);
  return matieres.some(m=>matiere===m||(m==='droit-penal-general'&&matiere==='droit-penal')||(m==='droit-penal'&&['droit-penal-general','droit-penal-special'].includes(matiere)));
}
function priorite(type,exercice) {
  if(exercice==='cas')return type==='majeure'?1.65:type==='majeure-cas'?1.2:type==='cours'?1.1:1;
  return type==='cours'?1.2:type==='fiche'?1.1:1;
}
function echapper(texte) {return String(texte??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function formaterPassage(p) {
  return `<extrait id="${echapper(p.id)}" source="${echapper(p.sourceId)}" type="${echapper(p.type)}" matiere="${echapper(p.matiere)}" page_debut="${p.pageDebut}" page_fin="${p.pageFin}">\n${echapper(p.titreSource)}${p.titre?' · '+echapper(p.titre):''}\n${echapper(p.texte)}\n</extrait>`;
}
function formaterCorpus(selection) {
  if(!selection?.passages?.length)return '';
  return `<corpus_pedagogique version="${echapper(selection.version)}">\n${selection.passages.map(formaterPassage).join('\n\n')}\n</corpus_pedagogique>`;
}
function limiterSelection(selection,maxCaracteres) {
  const passages=[];
  for(const p of selection.passages||[]) {
    const candidat={version:selection.version,passages:[...passages,p]};
    if(formaterCorpus(candidat).length<=maxCaracteres)passages.push(p);
  }
  return {version:selection.version,passages};
}
function creerRecherche(donnees) {
  const sources=Array.isArray(donnees.sources)?donnees.sources:[];
  const index=new Map(),entrees=[];
  for(const passage of donnees.passages||[]) {
    const source=sources[passage.source];
    if(!source||!passage.id||typeof passage.texte!=='string'||!passage.texte.trim()||!Number.isInteger(passage.pageDebut)||!Number.isInteger(passage.pageFin)||passage.pageDebut<1||passage.pageFin<passage.pageDebut||(Number.isInteger(source.pages)&&passage.pageFin>source.pages))continue;
    const mots=termes(passage.texte),corps=frequences(mots),f=new Map(corps);
    for(const m of termes(`${passage.titre||''} ${source.titre||''} ${source.matiere||''}`))f.set(m,(f.get(m)||0)+2);
    const numero=entrees.length;
    entrees.push({source,passage,longueur:Math.max(1,mots.length)});
    for(const [mot,tf] of f) {
      if(!index.has(mot))index.set(mot,[]);
      index.get(mot).push([numero,tf,corps.get(mot)||0]);
    }
  }
  const moyenne=entrees.reduce((n,p)=>n+p.longueur,0)/Math.max(1,entrees.length);
  const version=String(donnees.version||'sans-version');
  return function rechercher({exercice,texte='',question='',maxCaracteres=MAX_CARACTERES}={}) {
    const limite=Math.max(0,Math.min(22000,Number.isFinite(maxCaracteres)?maxCaracteres:MAX_CARACTERES));
    const demande=`${question}\n${texte}`,normalise=normaliser(demande),matieres=matieresExplicites(demande),requete=frequences(termes(`${question}\n${question}\n${texte}`));
    const references=new Set([...normalise.matchAll(/\b(?:articles?|art\.?)\s*(?:[lrd]\s*\.?\s*)?(\d{1,4}(?:[-.]\d+)*)/g)].map(m=>m[1].replace(/\./g,'-')));
    const juridiques=new Set('contrat offre retractation promesse option acceptation negociation dol vice consentement vente vendeur acheteur proprietaire responsabilite prejudice dommage faute obligation societe associe gerant bail loyer location salarie employeur licenciement juge tribunal preuve peine vol escroquerie succession divorce mineur possession servitude'.split(' '));
    const ancrage=matieres.length||[...requete.keys()].some(m=>juridiques.has(m));
    const niveaux=new Set((normalise.match(/\bl[123]\b/g)||[]).map(n=>n.toUpperCase())),semestres=new Set((normalise.match(/\bs[12]\b/g)||[]).map(n=>n.toUpperCase()));
    if(!requete.size||!limite)return {version,passages:[]};
    if(!ancrage&&/\b(?:recette|cuire|cuisiner)\b/.test(normalise))return {version,passages:[]};
    const candidats=new Map(),idfParMot=new Map();
    for(const [mot,qf] of requete) {
      const occurrences=index.get(mot);if(!occurrences)continue;
      const idf=Math.log(1+(entrees.length-occurrences.length+0.5)/(occurrences.length+0.5));idfParMot.set(mot,idf);
      for(const [numero,tf,corps] of occurrences) {
        const e=entrees[numero];if(!matiereCompatible(e.source,matieres))continue;
        if(!candidats.has(numero))candidats.set(numero,{numero,score:0,mots:new Set(),rare:false});
        const c=candidats.get(numero);
        c.score+=idf*(tf*2.2)/(tf+1.2*(0.25+0.75*e.longueur/moyenne))*Math.min(2,qf);
        if(corps){c.mots.add(mot);if(references.has(mot))c.rare=true;}
      }
    }
    let classes=[...candidats.values()].filter(c=>c.rare||(c.mots.size===1&&requete.size===1)||(c.mots.size>=2&&c.mots.size/Math.min(16,requete.size)>=(ancrage?0.16:0.5)&&(ancrage||requete.size<=3||c.mots.size>=3)));
    classes.forEach(c=>{const s=entrees[c.numero].source;c.score*=priorite(s.type,exercice)*(niveaux.has(s.niveau)?1.15:1)*(semestres.has(s.semestre)?1.1:1);});
    function preferenceMajeure(a,b) {
      if(exercice!=='cas'||a.mots.size!==b.mots.size||![...a.mots].every(m=>b.mots.has(m)))return 0;
      const ta=entrees[a.numero].source.type,tb=entrees[b.numero].source.type;
      return ta==='majeure'&&tb==='majeure-cas'?-1:ta==='majeure-cas'&&tb==='majeure'?1:0;
    }
    classes.sort((a,b)=>preferenceMajeure(a,b)||b.score-a.score||a.numero-b.numero);
    const seuil=Math.max(0.4,(classes[0]?.score||0)*0.16);
    classes=classes.filter(c=>c.score>=seuil).slice(0,160);
    const retenus=[],couverts=new Set(),parSource=new Map(),textes=new Set();
    function ajouter(c) {
      const {source,passage:p}=entrees[c.numero];
      if(textes.has(p.texte))return false;
      const extrait={id:String(p.id),sourceId:String(source.id),titreSource:String(source.titre||''),type:source.type,matiere:source.matiere,niveau:source.niveau,semestre:source.semestre,pageDebut:p.pageDebut,pageFin:p.pageFin,titre:p.titre||'',texte:p.texte};
      if(formaterCorpus({version,passages:[...retenus,extrait]}).length>limite)return false;
      retenus.push(extrait);textes.add(p.texte);c.mots.forEach(m=>couverts.add(m));parSource.set(extrait.sourceId,(parSource.get(extrait.sourceId)||0)+1);return true;
    }
    if(exercice==='cas') {
      const majeure=classes.find(c=>entrees[c.numero].source.type==='majeure')||classes.find(c=>entrees[c.numero].source.type==='majeure-cas');
      if(majeure)ajouter(majeure);
      const cours=classes.find(c=>entrees[c.numero].source.type==='cours'&&c.score>=(classes[0]?.score||0)*0.4);
      if(cours)ajouter(cours);
    }
    while(classes.length&&retenus.length<12) {
      classes.sort((a,b)=>{
        const utilite=c=>c.score/(1+0.3*(parSource.get(String(entrees[c.numero].source.id))||0))+[...c.mots].reduce((n,m)=>n+(couverts.has(m)?0:(idfParMot.get(m)||0)),0);
        return preferenceMajeure(a,b)||utilite(b)-utilite(a)||a.numero-b.numero;
      });
      ajouter(classes.shift());
    }
    return {version,passages:retenus};
  };
}
let recherche;
async function rechercher(options) {
  if(!recherche)recherche=Promise.resolve().then(()=>require('./_portalis-corpus-data').chargerCorpus()).then(creerRecherche).catch(error=>{recherche=undefined;throw error;});
  return (await recherche)(options);
}
module.exports={MAX_CARACTERES,creerRecherche,rechercher,formaterCorpus,limiterSelection};
