const { utilisateurDepuisJWT } = require('./_supabase');
class ErreurPortalis extends Error {
  constructor(code, message, status=400) { super(message); this.code=code; this.status=status; }
}
async function authentifier(req) {
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization || '');
  const user=match && await utilisateurDepuisJWT(match[1]);
  if (!user) throw new ErreurPortalis('connexion_requise','Connecte-toi pour utiliser Portalis.',401);
  return user;
}
async function service(path, options={}) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base=process.env.SUPABASE_URL;
  if (!key || !base) throw new Error('configuration_supabase');
  const response=await fetch(`${base}${path}`,{
    ...options, cache:'no-store', signal:AbortSignal.timeout(15000),
    headers:{ apikey:key, Authorization:`Bearer ${key}`, ...options.headers }
  });
  if (!response.ok) throw new Error(`supabase_${response.status}`);
  return response;
}
async function rpc(name, args) {
  return (await service(`/rest/v1/rpc/${name}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)
  })).json();
}
async function documents(user,ids) {
  if (!ids.length) return [];
  const params=new URLSearchParams({user_id:`eq.${user}`,id:`in.(${ids.join(',')})`,select:'id,chemin,pages,texte,cree_le'});
  return (await service(`/rest/v1/portalis_documents?${params}`)).json();
}
async function retirerObjet(path) {
  await service('/storage/v1/object/portalis-documents',{
    method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})
  });
}
module.exports={ErreurPortalis,authentifier,service,rpc,documents,retirerObjet};
