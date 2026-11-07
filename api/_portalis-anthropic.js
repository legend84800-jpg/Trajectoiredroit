async function lireReponse(response){
  if(!response.headers?.get?.('content-type')?.includes('text/event-stream'))return response.json();
  if(!response.body)throw Error('reponse_incomplete');
  let message=null,termine=false,tampon='';
  const decoder=new TextDecoder(),entrees=new Map();
  function evenement(bloc){
    const data=bloc.split('\n').filter(ligne=>ligne.startsWith('data:')).map(ligne=>ligne.slice(5).trimStart()).join('\n');
    if(!data)return;
    const e=JSON.parse(data);
    if(e.type==='error')throw Error('modele_flux');
    if(e.type==='message_start'){message={...e.message,content:[]};return;}
    if(e.type==='ping'||!message)return;
    if(e.type==='content_block_start')message.content[e.index]={...e.content_block};
    if(e.type==='content_block_delta'){
      const cible=message.content[e.index],d=e.delta;
      if(!cible)throw Error('reponse_incomplete');
      if(d.type==='text_delta')cible.text=(cible.text||'')+d.text;
      if(d.type==='thinking_delta')cible.thinking=(cible.thinking||'')+d.thinking;
      if(d.type==='signature_delta')cible.signature=(cible.signature||'')+d.signature;
      if(d.type==='input_json_delta')entrees.set(e.index,(entrees.get(e.index)||'')+d.partial_json);
      if(d.type==='citations_delta')(cible.citations??=[]).push(d.citation);
    }
    if(e.type==='content_block_stop'&&entrees.has(e.index)){
      const texte=entrees.get(e.index);if(texte)message.content[e.index].input=JSON.parse(texte);
      entrees.delete(e.index);
    }
    if(e.type==='message_delta'){
      Object.assign(message,e.delta);message.usage={...message.usage,...e.usage};
    }
    if(e.type==='message_stop')termine=true;
  }
  for await(const morceau of response.body){
    tampon=(tampon+decoder.decode(morceau,{stream:true})).replace(/\r\n/g,'\n');
    let fin;
    while((fin=tampon.indexOf('\n\n'))>=0){evenement(tampon.slice(0,fin));tampon=tampon.slice(fin+2);}
  }
  tampon+=decoder.decode();if(tampon.trim())evenement(tampon);
  if(!message||!termine||entrees.size)throw Error('reponse_incomplete');
  return message;
}
module.exports={lireReponse};
