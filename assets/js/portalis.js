(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const euros=cents=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(cents/100);
  const sessionKey='sb-ksqkhktcdgwrmzfcfjoe-auth-token';
  const memory={};
  function storage(){try{return localStorage.getItem('tjd-compte-rester-connecte')==='1'?localStorage:sessionStorage;}catch(_){return null;}}
  const adapter={
    getItem:key=>{try{return memory[key]||storage()?.getItem(key)||null;}catch(_){return memory[key]||null;}},
    setItem:(key,value)=>{try{const target=storage();if(!target)throw new Error('stockage');target.setItem(key,value);delete memory[key];}catch(_){memory[key]=value;}},
    removeItem:key=>{delete memory[key];try{localStorage.removeItem(key);sessionStorage.removeItem(key);}catch(_){}}
  };
  try{if(localStorage.getItem('tjd-compte-rester-connecte')!=='1')localStorage.removeItem(sessionKey);}catch(_){}
  if(!window.supabase){$('etat').textContent='La connexion n’a pas pu être chargée. Actualise la page.';return;}
  const sb=window.supabase.createClient('https://ksqkhktcdgwrmzfcfjoe.supabase.co','sb_publishable_Ahl2DDtcburQJZl1h2NHZQ_5eKh-isk',
    {auth:{storage:adapter,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  let session=null,userId=null,epoch=0,config=null,state=null,selected=null,documents=[],answer='',working=false,importing=false,compteurEnAttente=false;
  const controllers=new Set();
  function message(id,text,error=false){const el=$(id);el.textContent=text||'';el.hidden=!text;el.classList.toggle('error',error);}
  async function api(path,body){
    const controller=new AbortController();if(!path.includes('action=configuration'))controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),115000);
    try{
      const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.access_token}`}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      const data=await response.json();
      if(!response.ok)throw Object.assign(new Error(data.erreur||'La demande a échoué.'),{code:data.code});
      return data;
    }finally{clearTimeout(timer);controllers.delete(controller);}
  }
  function renderState(){
    const actif=!!state?.actif;
    $('connexion').hidden=!!session;
    $('abonnement').hidden=!state?.formule;
    $('champs').disabled=!actif||working||importing;
    $('recharges').hidden=!actif;
    $('etat').textContent=!session?'Connecte-toi pour retrouver ton abonnement et tes réponses disponibles.':
      actif?'Ton espace est prêt. Ajoute ton document ou colle ton sujet.':
      state?.statut==='impaye'?'Ton paiement doit être régularisé. Ouvre la gestion de ton abonnement.':'Choisis une formule pour commencer à travailler ton exercice.';
    if(state?.formule){
      const plan=config?.formules?.[state.formule];
      $('formuleActive').textContent=plan?.nom||'Portalis';
      $('quota').textContent=compteurEnAttente?'Le compteur doit être actualisé. Recharge la page pour le vérifier.':actif?`${state.restant} réponses incluses restantes sur 60 · ${state.recharges} réponses en recharge`:'Abonnement inactif';
      const date=state.renouvellement?new Date(state.renouvellement).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
      $('renouvellement').textContent=date?(state.resilieFin?'Accès jusqu’au ':'Prochain renouvellement le ')+date:'';
      document.querySelectorAll('[data-recharge]').forEach(button=>{
        const n=Number(button.dataset.recharge),price=plan?.recharges?.[n];
        button.textContent=price?`${n} réponses · ${euros(price)}`:`${n} réponses · tarif à confirmer`;
        button.disabled=!price||working||importing;
      });
    }
  }
  function renderConfig(){
    document.querySelectorAll('[data-price]').forEach(el=>{
      const price=config.formules[el.dataset.price].prix;
      el.textContent=price?euros(price):'Tarif à confirmer';el.classList.toggle('awaiting',!price);
    });
    document.querySelectorAll('[data-choisir]').forEach(button=>{button.disabled=!config.formules[button.dataset.choisir].prix;});
    renderState();
  }
  function choose(code,scroll=true){
    if(!config?.formules?.[code])return;
    selected=code;const plan=config.formules[code];
    $('choix').hidden=false;$('choixNom').textContent=plan.nom;
    $('choixDetail').textContent=plan.prix?`${euros(plan.prix)} par mois · 60 réponses par période mensuelle`:'Le tarif est en cours de validation.';
    $('choixCompte').textContent=session?'L’abonnement sera lié à ton compte connecté.':'Connecte-toi avant le paiement pour retrouver tes réponses dans ton espace.';
    $('payer').textContent=session?'Continuer vers le paiement':'Me connecter pour continuer';
    $('payer').disabled=!plan.prix;
    message('paiementMessage','');
    if(scroll)$('choix').scrollIntoView({block:'center',behavior:'smooth'});
  }
  function volume(){
    const chars=$('texte').value.trim().length+$('question').value.trim().length+documents.reduce((n,d)=>n+d.caracteres,0);
    const pages=Math.ceil($('texte').value.trim().length/2000)+documents.reduce((n,d)=>n+d.pages,0);
    $('volume').textContent=`${new Intl.NumberFormat('fr-FR').format(chars)} / 30 000 caractères · ${pages} / 15 pages`;
    $('generer').disabled=chars>30000||pages>15||chars<20||working||importing||!state?.actif;
    return {chars,pages};
  }
  function renderDocuments(){
    $('documents').replaceChildren();
    documents.forEach(doc=>{
      const li=document.createElement('li'),label=document.createElement('span'),button=document.createElement('button');
      label.textContent=`${doc.nom} · ${doc.pages} page${doc.pages>1?'s':''}`;
      button.type='button';button.textContent='Retirer';button.setAttribute('aria-label',`Retirer ${doc.nom}`);
      button.disabled=working||importing;
      button.addEventListener('click',async()=>{
        const current=epoch;button.disabled=true;
        try{await api('/api/generer',{action:'retirer',documentId:doc.id});if(current!==epoch)return;documents=documents.filter(d=>d.id!==doc.id);renderDocuments();volume();}
        catch(error){if(current===epoch){button.disabled=false;message('travailMessage',error.message,true);}}
      });li.append(label,button);$('documents').append(li);
    });
  }
  function renderAnswer(text){
    answer=text;$('reponse').replaceChildren();
    // Le texte du modèle n'est jamais interprété comme du HTML.
    text.split(/\n\s*\n/).forEach(block=>{
      const lines=block.split('\n');
      if(lines.length===1&&/^#{1,6}\s/.test(block)){
        const h=document.createElement('h4');h.textContent=block.replace(/^#{1,6}\s+/,'').replace(/\*\*/g,'');$('reponse').append(h);
      }else{
        const p=document.createElement('p');p.style.whiteSpace='pre-line';p.textContent=block.replace(/^#{1,6}\s+/gm,'').replace(/\*\*/g,'');$('reponse').append(p);
      }
    });$('resultat').hidden=false;$('resultat').focus({preventScroll:true});$('resultat').scrollIntoView({block:'start',behavior:'smooth'});
  }
  function pendingKey(){return userId?`tjd-portalis-demande-${userId}`:null;}
  function savePending(id){try{sessionStorage.setItem(pendingKey(),id);}catch(_){}}
  function clearPending(){try{sessionStorage.removeItem(pendingKey());}catch(_){}}
  async function recover(id,current){
    for(let n=0;n<24;n++){
      if(current!==epoch)return false;
      try{
        const result=await api(`/api/generer?demandeId=${encodeURIComponent(id)}`);
        if(current!==epoch)return false;
        if(result.statut==='terminee'&&result.reponse){clearPending();state=result.etat;renderAnswer(result.reponse);renderState();message('travailMessage','Ta réponse a été récupérée.');return true;}
        if(result.statut==='terminee'){clearPending();message('travailMessage','Cette réponse a expiré. Elle ne peut plus être récupérée.',true);return false;}
        if(result.statut!=='reservee'){clearPending();message('travailMessage','La demande n’a pas abouti. Son crédit a été restitué. Tu peux réessayer.',true);return false;}
      }catch(error){if(error.code==='demande'){clearPending();return false;}if(error.code==='connexion_requise')return false;}
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    message('travailMessage','La réponse n’a pas encore pu être récupérée. Actualise ton espace dans un instant.',true);return false;
  }
  async function changeSession(next){
    if(next?.user?.id===userId&&userId){session=next;return;}
    const current=++epoch;
    controllers.forEach(c=>c.abort());controllers.clear();
    session=next;userId=next?.user?.id||null;state=null;documents=[];answer='';working=false;importing=false;compteurEnAttente=false;
    $('texte').value='';$('question').value='';$('resultat').hidden=true;$('reponse').replaceChildren();renderDocuments();renderState();volume();message('travailMessage','');
    if(selected)choose(selected,false);
    if(!session)return;
    try{
      const fresh=await api('/api/generer');if(current!==epoch)return;state=fresh;renderState();volume();
      const params=new URLSearchParams(location.search),sid=params.get('session_id');
      if(sid){
        message('travailMessage','Vérification du paiement…');
        const paid=await api('/api/generer',{action:'synchroniser',sessionId:sid});if(current!==epoch)return;state=paid;
        history.replaceState(null,'',`${location.pathname}#espace`);renderState();volume();
        message('travailMessage',state.actif?'Ton abonnement est disponible.':'Le paiement n’est pas encore confirmé. Tu peux actualiser ton espace dans un instant.');
      }
      let pending;try{pending=sessionStorage.getItem(pendingKey());}catch(_){}
      if(pending){working=true;renderState();message('travailMessage','Récupération de ta dernière demande…');await recover(pending,current);if(current===epoch){working=false;renderState();volume();}}
    }catch(error){if(current===epoch)message('travailMessage',error.message,true);}
  }
  async function payment(body,button){
    const current=epoch;button.disabled=true;message('paiementMessage','Ouverture du paiement…');
    try{
      const result=await api('/api/create-checkout',{...body,attemptId:crypto.randomUUID()});
      if(current!==epoch)return;
      const target=new URL(result.url);
      if(!['checkout.stripe.com','billing.stripe.com'].includes(target.hostname)||target.protocol!=='https:')throw new Error('Le lien de paiement est invalide.');
      location.assign(target.href);
    }catch(error){if(current===epoch){button.disabled=false;message('paiementMessage',error.message,true);$('paiementMessage').scrollIntoView({block:'center'});}}
  }
  document.querySelectorAll('[data-choisir]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.choisir)));
  $('payer').addEventListener('click',()=>{
    if(!session){location.assign(`mon-compte.html?retour=portalis&formule=${encodeURIComponent(selected)}`);return;}
    if(!$('conditions').checked){message('paiementMessage','Accepte les conditions de vente pour continuer.',true);$('conditions').focus();return;}
    payment({mode:'subscription',formule:selected,accordConditions:true},$('payer'));
  });
  $('gerer').addEventListener('click',()=>payment({type:'portal'},$('gerer')));
  document.querySelectorAll('[data-recharge]').forEach(button=>button.addEventListener('click',()=>payment({type:'portalis_recharge',formule:state.formule,nombre:Number(button.dataset.recharge)},button)));
  $('texte').addEventListener('input',volume);$('question').addEventListener('input',volume);
  $('pdf').addEventListener('change',async()=>{
    const file=$('pdf').files[0];if(!file)return;
    const current=epoch;
    if(file.size>20971520||!file.name.toLowerCase().endsWith('.pdf')){message('travailMessage','Choisis un PDF de 20 Mo maximum.',true);$('pdf').value='';return;}
    importing=true;renderState();renderDocuments();message('travailMessage','Import et lecture du PDF…');
    try{
      const upload=await api('/api/generer',{action:'upload',nom:file.name,taille:file.size});if(current!==epoch)return;
      const result=await sb.storage.from('portalis-documents').uploadToSignedUrl(upload.chemin,upload.token,file,{contentType:'application/pdf',upsert:false});
      if(result.error)throw new Error('L’import a échoué. Tu peux réessayer.');if(current!==epoch)return;
      const doc=await api('/api/generer',{action:'importer',documentId:upload.id});if(current!==epoch)return;
      documents.push({...doc,nom:file.name});message('travailMessage','Le PDF est prêt. Vérifie le volume total avant de lancer la réponse.');
    }catch(error){if(current===epoch)message('travailMessage',error.message,true);}
    finally{if(current===epoch){importing=false;$('pdf').value='';renderDocuments();renderState();volume();}}
  });
  $('exerciceForm').addEventListener('submit',async event=>{
    event.preventDefault();const v=volume();if(!state?.actif||working||importing||v.chars<20||v.chars>30000||v.pages>15)return;
    const current=epoch,id=crypto.randomUUID();working=true;savePending(id);renderState();renderDocuments();
    $('resultat').hidden=true;message('travailMessage','Portalis travaille sur ton exercice. Garde cette page ouverte pendant la préparation de la réponse.');
    try{
      const result=await api('/api/generer',{action:'generer',demandeId:id,exercice:$('exercice').value,texte:$('texte').value,question:$('question').value,documents:documents.map(d=>d.id)});
      if(current!==epoch)return;clearPending();if(result.etat)state=result.etat;compteurEnAttente=!result.etat;renderAnswer(result.reponse);message('travailMessage','Ta réponse est prête. Un crédit a été utilisé.');
    }catch(error){
      if(current!==epoch)return;
      if(!error.code){message('travailMessage','La connexion a été interrompue. Recherche de ta réponse…');await recover(id,current);}
      else{clearPending();message('travailMessage',error.message,true);}
    }finally{if(current===epoch){working=false;renderState();renderDocuments();volume();}}
  });
  $('copier').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(answer);$('copier').textContent='Réponse copiée';setTimeout(()=>{$('copier').textContent='Copier la réponse';},2000);}catch(_){message('travailMessage','Sélectionne le texte de la réponse pour le copier.',true);}});
  api('/api/generer?action=configuration').then(data=>{config=data;renderConfig();const initial=new URLSearchParams(location.search).get('formule');if(initial)choose(initial,false);}).catch(error=>{console.warn('Portalis configuration',error.message);message('paiementMessage','Les formules n’ont pas pu être chargées. Actualise la page.',true);});
  sb.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>changeSession(next),0);});
  sb.auth.getSession().then(result=>changeSession(result.data.session));
  volume();
})();
