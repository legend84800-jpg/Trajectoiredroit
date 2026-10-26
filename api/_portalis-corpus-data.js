// Ce module ne contient aucun cours. Le corpus est dans un bucket privé.
const {createHash}=require('node:crypto');
const {gunzipSync}=require('node:zlib');
const {service}=require('./_portalis-store');
const manifest=require('./_portalis-corpus-manifest');
const MAX_COMPRESSE=20*1024*1024;
function validerManifest() {
  const sha=/^[a-f0-9]{64}$/;
  if(!sha.test(manifest.version)||!sha.test(manifest.sha256)||manifest.chemin!==`${manifest.version}.json.gz`||
    !Number.isInteger(manifest.octets)||manifest.octets<1||manifest.octets>MAX_COMPRESSE||
    !Number.isInteger(manifest.maxOctetsDecompresses)||manifest.maxOctetsDecompresses<1||manifest.maxOctetsDecompresses>50000000)
    throw new Error('corpus_manifest');
}
async function telecharger() {
  validerManifest();
  const response=await service(`/storage/v1/object/portalis-corpus/${encodeURIComponent(manifest.chemin)}`);
  const annonce=response.headers.get('content-length');
  if(annonce!==null&&Number(annonce)!==manifest.octets)throw new Error('corpus_taille');
  let buffer;
  if(response.body?.getReader) {
    const reader=response.body.getReader(),morceaux=[];let total=0;
    try {
      while(true) {
        const {done,value}=await reader.read();if(done)break;
        total+=value.byteLength;
        if(total>manifest.octets)throw new Error('corpus_taille');
        morceaux.push(Buffer.from(value));
      }
      buffer=Buffer.concat(morceaux,total);
    } catch(error) {try{await reader.cancel();}catch(_){}throw error;}
  } else buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.length!==manifest.octets)throw new Error('corpus_taille');
  if(createHash('sha256').update(buffer).digest('hex')!==manifest.sha256)throw new Error('corpus_integrite');
  let texte;
  try{texte=gunzipSync(buffer,{maxOutputLength:manifest.maxOctetsDecompresses}).toString('utf8');}
  catch(_){throw new Error('corpus_decompression');}
  let donnees;
  try{donnees=JSON.parse(texte);}catch(_){throw new Error('corpus_format');}
  if(!donnees||donnees.version!==manifest.version||!Array.isArray(donnees.sources)||!Array.isArray(donnees.passages))throw new Error('corpus_version');
  return donnees;
}
let chargement;
function chargerCorpus() {
  if(!chargement)chargement=telecharger().catch(error=>{chargement=undefined;throw error;});
  return chargement;
}
module.exports={chargerCorpus};
