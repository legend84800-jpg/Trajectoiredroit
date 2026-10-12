const PRODUITS=require('./_produits');
const {CORRIGES_OFFERTS}=require('./lead');
const {recueils}=require('./_corriges-exercices');
function offres(){return Object.entries(CORRIGES_OFFERTS).map(([id,c])=>({id,matiere:PRODUITS[id].nom.replace(/^Cas pratiques corrigés /,''),cas:c.cas,partiels:c.partiels,prix:PRODUITS[id].prix,url:'/cas-pratiques-corriges.html?matiere='+encodeURIComponent(id)+'#recueils-cas-pratiques'}));}
module.exports=function(req,res){if(req.method!=='GET')return res.status(405).json({error:'Méthode non autorisée'});res.setHeader('Cache-Control','public, max-age=0, s-maxage=300');return res.status(200).json({offres:offres(),recueils:recueils()});};
module.exports.offres=offres;
