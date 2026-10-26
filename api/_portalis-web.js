const OUTIL_WEB=Object.freeze({type:'web_search_20250305',name:'web_search',max_uses:5});
const MAX_REPRISES=2;
const DELAI_TOTAL=162000;

function urlSource(valeur) {
  if(typeof valeur!=='string'||/[\s\u0000-\u001f\u007f]/u.test(valeur))return null;
  try {
    const url=new URL(valeur);
    if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return null;
    return url.href.replace(/[()<>"\\]/g,caractere=>'%'+caractere.charCodeAt(0).toString(16).toUpperCase());
  } catch(_){return null;}
}
function titreSource(valeur,url) {
  const titre=typeof valeur==='string'?valeur.replace(/[\u0000-\u001f\u007f]/g,' ').trim():'';
  return (titre||new URL(url).hostname).replace(/[\\`*_{}\[\]()!]/g,'\\$&');
}
function serialiserTexte(contenu) {
  return (Array.isArray(contenu)?contenu:[]).filter(bloc=>bloc?.type==='text'&&typeof bloc.text==='string').map(bloc=>{
    const liens=[],vus=new Set();
    for(const citation of Array.isArray(bloc.citations)?bloc.citations:[]) {
      if(citation?.type!=='web_search_result_location')continue;
      const url=urlSource(citation.url);
      if(!url||vus.has(url))continue;
      vus.add(url);liens.push(`[${titreSource(citation.title,url)}](${url})`);
    }
    return liens.length?bloc.text.replace(/\s*$/u,blancs=>' '+liens.join(', ')+blancs):bloc.text;
  }).reduce((texte,bloc)=>texte+(!texte||!bloc||/\s$/u.test(texte)||/^[\s\p{P}]/u.test(bloc)?'':'\n\n')+bloc,'').trim();
}
function compteur(valeur) {
  if(valeur===undefined)return 0;
  if(!Number.isSafeInteger(valeur)||valeur<0)throw new Error('usage_invalide');
  return valeur;
}
function delaiDepasse() {
  const erreur=new Error('delai');erreur.name='TimeoutError';return erreur;
}
async function genererAvecRecherche(anthropic,payload,{timeoutMs=DELAI_TOTAL,maintenant=Date.now}={}) {
  if(typeof anthropic!=='function'||!payload||!Array.isArray(payload.messages)||
    !Number.isSafeInteger(payload.max_tokens)||payload.max_tokens<1||
    !Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('configuration_recherche');
  const limite=Math.min(timeoutMs,DELAI_TOTAL),debut=maintenant();
  const usage={input_tokens:0,output_tokens:0,server_tool_use:{web_search_requests:0}};
  const erreurs=new Set(),appels=new Set(),termines=new Set(),contenus=[];
  let messages=payload.messages.slice(),reussies=0;
  for(let reprise=0;reprise<=MAX_REPRISES;reprise++) {
    const restant=Math.floor(limite-(maintenant()-debut));
    if(restant<=0)throw delaiDepasse();
    const jetons=payload.max_tokens-usage.output_tokens;
    const recherches=OUTIL_WEB.max_uses-Math.max(usage.server_tool_use.web_search_requests,termines.size);
    if(jetons<=0||recherches<=0)throw new Error('reponse_incomplete');
    const resultat=await anthropic('',{...payload,messages,max_tokens:jetons,
      tools:[{...OUTIL_WEB,max_uses:recherches}]},restant);
    if(maintenant()-debut>=limite)throw delaiDepasse();
    if(!resultat||!Array.isArray(resultat.content))throw new Error('reponse_incomplete');
    usage.input_tokens+=compteur(resultat.usage?.input_tokens);
    usage.output_tokens+=compteur(resultat.usage?.output_tokens);
    usage.server_tool_use.web_search_requests+=compteur(resultat.usage?.server_tool_use?.web_search_requests);
    for(const cle of ['cache_creation_input_tokens','cache_read_input_tokens']) {
      if(resultat.usage?.[cle]!==undefined)usage[cle]=(usage[cle]||0)+compteur(resultat.usage[cle]);
    }
    if(usage.output_tokens>payload.max_tokens)throw new Error('reponse_incomplete');
    contenus.push(...resultat.content);
    for(const bloc of resultat.content) {
      if(bloc?.type==='server_tool_use'&&bloc.name==='web_search'&&typeof bloc.id==='string')appels.add(bloc.id);
      if(bloc?.type!=='web_search_tool_result')continue;
      if(typeof bloc.tool_use_id==='string')termines.add(bloc.tool_use_id);
      if(Array.isArray(bloc.content))reussies++;
      else if(bloc.content?.type==='web_search_tool_result_error')
        erreurs.add(typeof bloc.content.error_code==='string'?bloc.content.error_code:'inconnue');
    }
    if(resultat.stop_reason==='end_turn') {
      const texte=contenus.filter(bloc=>bloc?.type==='text'&&typeof bloc.text==='string').map(bloc=>bloc.text).join('\n\n').trim();
      if(texte.length<20)throw new Error('reponse_incomplete');
      let reponse=serialiserTexte(contenus);
      if(erreurs.size)reponse+='\n\nLa recherche Internet a rencontré une erreur. Les éléments qui en dépendent restent à vérifier.';
      return {reponse,usage,stop_reason:'end_turn',recherches:{effectuees:usage.server_tool_use.web_search_requests,
        tentatives:appels.size,reussies,erreurs:[...erreurs]}};
    }
    if(resultat.stop_reason!=='pause_turn'||reprise===MAX_REPRISES)throw new Error('reponse_incomplete');
    // Les blocs signés et chiffrés doivent revenir à Anthropic sans transformation.
    messages=[...messages,{role:'assistant',content:resultat.content}];
  }
  throw new Error('reponse_incomplete');
}
module.exports={OUTIL_WEB,MAX_REPRISES,DELAI_TOTAL,genererAvecRecherche,serialiserTexte};
