const {randomUUID}=require('node:crypto');
const {UUID,configurationPublique}=require('./_portalis-config');
const {ErreurPortalis,authentifier,service,rpc,documents,retirerObjet}=require('./_portalis-store');
const {generer,importer}=require('./_portalis-generation');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Access-Control-Allow-Origin','https://trajectoiredroit.com');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.status(204).end();return;}
  try{
    if(req.method==='GET'&&req.query?.action==='nettoyer'){
      const cleanup=require('./_portalis-nettoyage');
      if(!cleanup.autoriser(req)) throw new ErreurPortalis('connexion_requise','Accès refusé.',401);
      res.status(200).json(await cleanup.nettoyer());return;
    }
    if(req.method==='GET'&&req.query?.action==='configuration'){
      res.status(200).json(configurationPublique());return;
    }
    if(!['GET','POST'].includes(req.method)) throw new ErreurPortalis('methode','Méthode non autorisée.',405);
    const user=await authentifier(req);
    if(req.method==='GET'){
      const requestId=req.query?.demandeId;
      if(requestId){
        if(!UUID.test(requestId)) throw new ErreurPortalis('demande','Demande invalide.');
        await rpc('portalis_etat',{p_user:user.id});
        const rows=await (await service(`/rest/v1/portalis_demandes?id=eq.${requestId}&user_id=eq.${user.id}&select=statut,reponse,termine_le&limit=1`)).json();
        if(!rows[0]) throw new ErreurPortalis('demande','Cette demande est introuvable.',404);
        if(rows[0].termine_le&&Date.parse(rows[0].termine_le)<Date.now()-86400000) rows[0].reponse=null;
        delete rows[0].termine_le;
        res.status(200).json({...rows[0],etat:await rpc('portalis_etat',{p_user:user.id})});return;
      }
      res.status(200).json(await rpc('portalis_etat',{p_user:user.id}));return;
    }
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(body.action==='upload'){
      if(!body.nom||typeof body.nom!=='string'||!body.nom.toLowerCase().endsWith('.pdf')||!Number.isInteger(body.taille)||body.taille<1||body.taille>20971520)
        throw new ErreurPortalis('pdf','Choisis un PDF de 20 Mo maximum.');
      const id=randomUUID(),chemin=`${user.id}/${id}.pdf`;
      const autorise=await rpc('portalis_preparer_document',{p_user:user.id,p_id:id,p_chemin:chemin});
      if(!autorise) throw new ErreurPortalis('import','L’import nécessite un abonnement actif et reste limité à 15 fichiers par heure.',403);
      const signed=await (await service(`/storage/v1/object/upload/sign/portalis-documents/${chemin}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
      res.status(200).json({id,chemin,token:signed.token});return;
    }
    if(body.action==='importer'){res.status(200).json(await importer(user.id,body.documentId));return;}
    if(body.action==='retirer'){
      if(!UUID.test(body.documentId||'')) throw new ErreurPortalis('document','Document invalide.');
      const doc=(await documents(user.id,[body.documentId]))[0];
      if(doc){
        try{await retirerObjet(doc.chemin);}catch(_){}
        await service(`/rest/v1/portalis_documents?id=eq.${doc.id}&user_id=eq.${user.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({texte:null})});
      }
      res.status(200).json({retire:true});return;
    }
    if(body.action==='synchroniser'){
      if(typeof body.sessionId!=='string'||!/^cs_(live|test)_[a-zA-Z0-9]+$/.test(body.sessionId)) throw new ErreurPortalis('paiement','Paiement invalide.');
      if(process.env.VERCEL_ENV==='production'&&body.sessionId.startsWith('cs_test_')) throw new ErreurPortalis('paiement','Paiement de test.',403);
      const {creerClientStripe}=require('./_stripe');
      await require('./_portalis-billing').synchroniserSession(creerClientStripe(process.env.STRIPE_SECRET_KEY),body.sessionId,user.id);
      res.status(200).json(await rpc('portalis_etat',{p_user:user.id}));return;
    }
    if(body.action&&body.action!=='generer') throw new ErreurPortalis('action','Action inconnue.');
    res.status(200).json(await generer(body,user.id));
  }catch(error){
    if(!(error instanceof ErreurPortalis)) console.error('Portalis API',{code:error.name==='SyntaxError'?'json':error.message});
    res.status(error.status||(error instanceof SyntaxError?400:503)).json({code:error.code||'indisponible',erreur:error.status?error.message:'Portalis est temporairement indisponible. Réessaie dans un instant.'});
  }
};
