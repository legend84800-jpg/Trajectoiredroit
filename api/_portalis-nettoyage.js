const {timingSafeEqual}=require('node:crypto');
const {service}=require('./_portalis-store');
function autoriser(req){
  const expected=process.env.CRON_SECRET;
  const supplied=req.headers.authorization||'';
  if(!expected)return false;
  const a=Buffer.from(supplied),b=Buffer.from(`Bearer ${expected}`);
  return a.length===b.length&&timingSafeEqual(a,b);
}
async function nettoyer(){
  const date=new Date(Date.now()-10800000).toISOString();
  const params=new URLSearchParams({cree_le:`lt.${date}`,supprime_le:'is.null',select:'id,chemin',order:'cree_le.asc',limit:'1000'});
  const docs=await (await service(`/rest/v1/portalis_documents?${params}`)).json();
  for(let index=0;index<docs.length;index+=100){
    const batch=docs.slice(index,index+100);
    await service('/storage/v1/object/portalis-documents',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:batch.map(d=>d.chemin)})});
    await service(`/rest/v1/portalis_documents?id=in.(${batch.map(d=>d.id).join(',')})`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({texte:null,supprime_le:new Date().toISOString()})});
  }
  return {documents:docs.length};
}
module.exports={autoriser,nettoyer};
