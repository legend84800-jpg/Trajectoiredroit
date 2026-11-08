(function(){
  'use strict';
  function delaiRequete(body){return body?.action==='generer'?(body.mode==='corriger'||body.exercice==='commentaire-compare'?585000:225000):115000;}
  function volumeDemande({mode='rediger',texte='',copie='',question='',documents=[]}){
    const corriger=mode==='corriger',docs=documents.filter(d=>corriger||d.role!=='copie');
    const sujet=texte.trim().length+docs.filter(d=>d.role!=='copie').reduce((n,d)=>n+d.caracteres,0);
    const travail=corriger?copie.trim().length+docs.filter(d=>d.role==='copie').reduce((n,d)=>n+d.caracteres,0):0;
    return {chars:sujet+travail+question.trim().length,pages:Math.ceil(texte.trim().length/2000)+(corriger?Math.ceil(copie.trim().length/2000):0)+docs.reduce((n,d)=>n+d.pages,0),complet:corriger?sujet>=20&&travail>=20:sujet+question.trim().length>=20};
  }
  function construireDemande({demandeId,mode='rediger',exercice,texte,copie,question,documents=[]}){
    return {action:'generer',demandeId,mode,exercice,texte,question,documents:documents.filter(d=>d.role!=='copie').map(d=>d.id),
      ...(mode==='corriger'?{copie,documentsCopie:documents.filter(d=>d.role==='copie').map(d=>d.id)}:{})};
  }
  function lireLien(text,debut){
    let position=debut+1,titre='',adresse='',profondeur=1;
    while(position<text.length&&text[position]!==']'&&text[position]!=='\n'){
      if(text[position]==='\\'&&/[\\`*_{}\[\]()!#+\-.>|]/.test(text[position+1]||'')){
        titre+=text.slice(position,position+2);position+=2;continue;
      }
      titre+=text[position++];
    }
    if(text.slice(position,position+2)!=='](')return null;
    position+=2;
    while(position<text.length&&profondeur){
      const caractere=text[position++];
      if(/[\s\u0000-\u001f\u007f<>\\]/.test(caractere))return null;
      if(caractere==='(')profondeur++;
      if(caractere===')'){profondeur--;if(!profondeur)break;}
      adresse+=caractere;
    }
    if(profondeur||!/^https?:\/\//i.test(adresse))return null;
    try{
      const url=new URL(adresse);
      if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return null;
      return {titre,adresse:url.href,fin:position};
    }catch(_){return null;}
  }
  function texteInline(parent,text,doc,liens=true){
    const marqueurs=/\\([\\`*_{}\[\]()!#+\-.>|])|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[/g;
    let debut=0,match;
    while((match=marqueurs.exec(text))){
      if(match.index>debut)parent.append(doc.createTextNode(text.slice(debut,match.index)));
      if(match[1]!==undefined)parent.append(doc.createTextNode(match[1]));
      else if(match[0]==='['){
        const lien=liens&&lireLien(text,match.index);
        if(lien){
          const node=doc.createElement('a');node.href=lien.adresse;node.target='_blank';node.rel='noopener noreferrer';
          texteInline(node,lien.titre,doc,false);parent.append(node);marqueurs.lastIndex=lien.fin;
        }else parent.append(doc.createTextNode('['));
      }else{
        const node=doc.createElement(match[2]!==undefined?'strong':match[3]!==undefined?'em':'code');
        const contenu=match[2]??match[3]??match[4];
        if(match[4]!==undefined)node.textContent=contenu;
        else texteInline(node,contenu,doc,liens);
        parent.append(node);
      }
      debut=marqueurs.lastIndex;
    }
    if(debut<text.length)parent.append(doc.createTextNode(text.slice(debut)));
  }
  function rendreMarkdown(parent,text,doc){
    parent.replaceChildren();
    let paragraphe=[],listes=[],citation=[];
    function finirParagraphe(){
      if(!paragraphe.length)return;
      const p=doc.createElement('p');p.style.whiteSpace='pre-line';texteInline(p,paragraphe.join('\n'),doc);parent.append(p);paragraphe=[];
    }
    function finirCitation(){
      if(!citation.length)return;
      const bloc=doc.createElement('blockquote');texteInline(bloc,citation.join('\n'),doc);parent.append(bloc);citation=[];
    }
    for(const ligne of String(text).replace(/\r\n?/g,'\n').split('\n')){
      const extrait=ligne.match(/^ {0,3}>\s?(.*)$/);
      if(extrait){finirParagraphe();listes=[];citation.push(extrait[1]);continue;}
      finirCitation();
      if(!ligne.trim()){finirParagraphe();continue;}
      const titre=ligne.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*$/);
      if(titre){
        finirParagraphe();listes=[];
        const h=doc.createElement('h'+Math.min(6,titre[1].length+3));texteInline(h,titre[2],doc);parent.append(h);continue;
      }
      const puce=ligne.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
      if(puce){
        finirParagraphe();
        const retrait=puce[1].replace(/\t/g,'    ').length,tag=/^\d/.test(puce[2])?'ol':'ul';
        while(listes.length&&retrait<listes[listes.length-1].retrait)listes.pop();
        if(listes.length&&retrait===listes[listes.length-1].retrait&&tag!==listes[listes.length-1].tag)listes.pop();
        let liste=listes[listes.length-1];
        if(!liste||retrait>liste.retrait){
          const node=doc.createElement(tag),support=liste?.dernier||parent;
          if(tag==='ol')node.start=parseInt(puce[2],10);
          support.append(node);liste={node,retrait,tag,dernier:null};listes.push(liste);
        }
        const li=doc.createElement('li');li.style.whiteSpace='pre-line';texteInline(li,puce[3],doc);liste.node.append(li);liste.dernier=li;continue;
      }
      const retrait=ligne.match(/^\s*/)[0].replace(/\t/g,'    ').length,liste=listes[listes.length-1];
      if(liste&&retrait>liste.retrait){texteInline(liste.dernier,'\n'+ligne.trim(),doc);continue;}
      listes=[];paragraphe.push(ligne);
    }
    finirParagraphe();finirCitation();
  }
  if(typeof module==='object'&&module.exports){module.exports={rendreMarkdown,delaiRequete,volumeDemande,construireDemande};return;}
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
  const modeCourant=()=>$('modeCorriger').checked?'corriger':'rediger';
  const controllers=new Set();
  function message(id,text,error=false){const el=$(id);el.textContent=text||'';el.hidden=!text;el.classList.toggle('error',error);}
  async function api(path,body){
    const controller=new AbortController();if(!path.includes('action=configuration'))controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),delaiRequete(body));
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
    $('modeRediger').disabled=working||importing;$('modeCorriger').disabled=working||importing;
    $('recharges').hidden=!actif;
    $('etat').textContent=!session?'Connecte-toi pour retrouver ton abonnement et tes réponses disponibles.':
      actif?'Ton espace est prêt. Choisis de rédiger une copie ou de corriger ton travail.':
      state?.statut==='impaye'?'Ton paiement doit être régularisé. Ouvre la gestion de ton abonnement.':'Choisis une formule pour commencer à travailler ton exercice.';
    document.querySelectorAll('[data-choisir]').forEach(button=>{
      const code=button.dataset.choisir,plan=config?.formules?.[code],actuelle=actif&&state.formule===code;
      button.disabled=!config?.abonnementsOuverts||!plan?.prix||actuelle;
      button.textContent=actuelle?'Ta formule actuelle':actif&&plan?.prix>config?.formules?.[state.formule]?.prix?`Passer à ${code==='portalis'?'Portalis IA':code==='classique'?'Classique':'Pro'}`:`Choisir ${code==='portalis'?'Portalis IA':code==='classique'?'Classique':'Pro'}`;
    });
    if(state?.formule){
      const plan=config?.formules?.[state.formule];
      $('formuleActive').textContent=plan?.nom||'Portalis IA';
      $('quota').textContent=compteurEnAttente?'Le compteur doit être actualisé. Recharge la page pour le vérifier.':actif?`${state.restant} réponses incluses restantes sur 60 · ${state.recharges} réponses en recharge`:'Abonnement inactif';
      const date=state.renouvellement?new Date(state.renouvellement).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
      $('renouvellement').textContent=date?(state.resilieFin?'Accès jusqu’au ':'Prochain renouvellement le ')+date:'';
      document.querySelectorAll('[data-recharge]').forEach(button=>{
        const n=Number(button.dataset.recharge),price=plan?.recharges?.[n];
        button.textContent=price?`${n} réponses · ${euros(price)}`:`${n} réponses · tarif à confirmer`;
        button.disabled=!price||working||importing;
      });
    }
    if(selected)choose(selected,false);
  }
  function renderConfig(){
    document.querySelectorAll('[data-price]').forEach(el=>{
      const price=config.formules[el.dataset.price].prix;
      el.textContent=price?euros(price):'Tarif à confirmer';el.classList.toggle('awaiting',!price);
    });
    document.querySelectorAll('[data-choisir]').forEach(button=>{button.disabled=!config.abonnementsOuverts||!config.formules[button.dataset.choisir].prix;});
    renderState();
  }
  function choose(code,scroll=true){
    if(!config?.formules?.[code])return;
    selected=code;const plan=config.formules[code];
    $('choix').hidden=false;$('choixNom').textContent=plan.nom;
    const active=config.formules[state?.formule],changement=state?.actif&&active,difference=changement?plan.prix-active.prix:0;
    const date=state?.renouvellement?new Date(state.renouvellement).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
    $('choixDetail').textContent=changement&&difference>0?`${euros(difference)} à payer pour la période en cours. La formule coûte ensuite ${euros(plan.prix)} par mois.`:plan.prix?`${euros(plan.prix)} par mois · 60 réponses par période mensuelle`:'Le tarif est en cours de validation.';
    $('choixCompte').textContent=changement&&difference>0?`Tes réponses restantes sont conservées. ${state.resilieFin?'Ton accès se termine toujours le ': 'Ton prochain renouvellement reste fixé au '}${date}.`:changement&&difference===0?'Cette formule est déjà active sur ton compte.':changement?'Contacte Julien pour passer à une formule moins chère.':session?'L’abonnement sera lié à ton compte connecté.':'Connecte-toi avant le paiement pour retrouver tes réponses dans ton espace.';
    $('payer').textContent=session?(changement&&difference>0?`Payer ${euros(difference)} et changer de formule`:'Continuer vers le paiement'):'Me connecter pour continuer';
    $('payer').disabled=!config.abonnementsOuverts||!plan.prix||(changement&&difference<=0);
    message('paiementMessage','');
    if(scroll)$('choix').scrollIntoView({block:'center',behavior:'smooth'});
  }
  function volume(){
    const {chars,pages,complet}=volumeDemande({mode:modeCourant(),texte:$('texte').value,copie:$('copie').value,question:$('question').value,documents});
    $('volume').textContent=`${new Intl.NumberFormat('fr-FR').format(chars)} / 30 000 caractères · ${pages} / 15 pages`;
    $('generer').disabled=chars>30000||pages>15||!complet||working||importing||!state?.actif;
    return {chars,pages,complet};
  }
  function renderDocuments(){
    $('documents').replaceChildren();$('documentsCopie').replaceChildren();
    documents.forEach(doc=>{
      const li=document.createElement('li'),label=document.createElement('span'),button=document.createElement('button');
      label.textContent=`${doc.nom} · ${doc.pages} page${doc.pages>1?'s':''}`;
      button.type='button';button.textContent='Retirer';button.setAttribute('aria-label',`Retirer ${doc.nom}`);
      button.disabled=working||importing;
      button.addEventListener('click',async()=>{
        const current=epoch;button.disabled=true;
        try{await api('/api/generer',{action:'retirer',documentId:doc.id});if(current!==epoch)return;documents=documents.filter(d=>d.id!==doc.id);renderDocuments();volume();}
        catch(error){if(current===epoch){button.disabled=false;message('travailMessage',error.message,true);}}
      });li.append(label,button);$(doc.role==='copie'?'documentsCopie':'documents').append(li);
    });
  }
  function renderAnswer(text){
    answer=text;rendreMarkdown($('reponse'),text,document);
    $('resultat').hidden=false;$('resultat').focus({preventScroll:true});$('resultat').scrollIntoView({block:'start',behavior:'smooth'});
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
    $('texte').value='';$('copie').value='';$('question').value='';$('resultat').hidden=true;$('reponse').replaceChildren();renderDocuments();renderState();volume();message('travailMessage','');
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
      if(result.termine){
        state=result.etat;renderState();volume();
        message('paiementMessage','Ta nouvelle formule est disponible.');
        $('espace').scrollIntoView({block:'start',behavior:'smooth'});return;
      }
      const target=new URL(result.url);
      if(!['checkout.stripe.com','billing.stripe.com','invoice.stripe.com'].includes(target.hostname)||target.protocol!=='https:')throw new Error('Le lien de paiement est invalide.');
      location.assign(target.href);
    }catch(error){if(current===epoch){button.disabled=false;message('paiementMessage',error.message,true);$('paiementMessage').scrollIntoView({block:'center'});}}
  }
  document.querySelectorAll('[data-choisir]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.choisir)));
  $('payer').addEventListener('click',()=>{
    if(!session){location.assign(`mon-compte.html?retour=portalis&formule=${encodeURIComponent(selected)}`);return;}
    if(!$('conditions').checked){message('paiementMessage','Accepte les conditions de vente pour continuer.',true);$('conditions').focus();return;}
    payment({mode:'subscription',formule:selected,accordConditions:true,
      ...(state?.actif?{montantChangement:config.formules[selected].prix-config.formules[state.formule].prix}:{})},$('payer'));
  });
  $('gerer').addEventListener('click',()=>payment({type:'portal'},$('gerer')));
  document.querySelectorAll('[data-recharge]').forEach(button=>button.addEventListener('click',()=>payment({type:'portalis_recharge',formule:state.formule,nombre:Number(button.dataset.recharge)},button)));
  function actualiserExercice(){
    const compare=$('exercice').value==='commentaire-compare',corriger=modeCourant()==='corriger';
    $('copieZone').hidden=!corriger;$('commentaireCompareAide').hidden=!compare||corriger;
    $('modeAide').textContent=corriger?'La correction reprend les passages de ta copie, explique les défauts et propose des réécritures. Elle comprend aussi une note indicative sur 20, avec le détail des points. La préparation peut prendre plusieurs minutes.':'Choisis ton exercice, puis ajoute le sujet.';
    $('texteLabel').textContent=corriger?'Le sujet et les documents à étudier':'Ton texte ou ton sujet';
    $('pdfLabel').textContent=corriger?'Ajouter un PDF du sujet':'Ajouter un PDF';
    $('texte').placeholder=compare?'Colle les textes des arrêts à comparer. Tu peux aussi les ajouter en PDF.':'Colle ton arrêt, ton cas pratique ou ton sujet de dissertation.';
    $('question').placeholder=corriger?'Ajoute les attentes de ton enseignant et le barème s’il est court. Tu peux joindre les documents plus longs avec le sujet.':compare?'Ajoute les consignes de ton enseignant ou les indications propres au sujet.':'Précise les points que tu veux travailler ou ajoute la consigne de ton chargé de TD.';
    $('generer').textContent=corriger?'Corriger ma copie':compare?'Rédiger le commentaire comparé':'Rédiger ma copie';
    volume();
  }
  const modeLien=new URLSearchParams(location.search).get('mode');
  let modeSauve;try{modeSauve=sessionStorage.getItem('tjd-portalis-mode');}catch(_){}
  if((modeLien||modeSauve)==='corriger')$('modeCorriger').checked=true;
  document.querySelectorAll('input[name="mode"]').forEach(input=>input.addEventListener('change',()=>{
    try{sessionStorage.setItem('tjd-portalis-mode',modeCourant());}catch(_){}
    actualiserExercice();
  }));
  if(new URLSearchParams(location.search).get('exercice')==='commentaire-compare')$('exercice').value='commentaire-compare';
  $('exercice').addEventListener('change',actualiserExercice);actualiserExercice();
  $('texte').addEventListener('input',volume);$('copie').addEventListener('input',volume);$('question').addEventListener('input',volume);
  async function importerPDF(input,role){
    const file=input.files[0];if(!file)return;
    const current=epoch;
    if(file.size>20971520||!file.name.toLowerCase().endsWith('.pdf')){message('travailMessage','Choisis un PDF de 20 Mo maximum.',true);input.value='';return;}
    importing=true;renderState();renderDocuments();message('travailMessage','Import et lecture du PDF…');
    try{
      const upload=await api('/api/generer',{action:'upload',nom:file.name,taille:file.size});if(current!==epoch)return;
      const result=await sb.storage.from('portalis-documents').uploadToSignedUrl(upload.chemin,upload.token,file,{contentType:'application/pdf',upsert:false});
      if(result.error)throw new Error('L’import a échoué. Tu peux réessayer.');if(current!==epoch)return;
      const doc=await api('/api/generer',{action:'importer',documentId:upload.id});if(current!==epoch)return;
      documents.push({...doc,nom:file.name,role});message('travailMessage','Le PDF est prêt. Vérifie le volume total avant de lancer la réponse.');
    }catch(error){if(current===epoch)message('travailMessage',error.message,true);}
    finally{if(current===epoch){importing=false;input.value='';renderDocuments();renderState();volume();}}
  }
  $('pdf').addEventListener('change',()=>importerPDF($('pdf'),'sujet'));
  $('pdfCopie').addEventListener('change',()=>importerPDF($('pdfCopie'),'copie'));
  $('exerciceForm').addEventListener('submit',async event=>{
    event.preventDefault();const v=volume();if(!state?.actif||working||importing||!v.complet||v.chars>30000||v.pages>15)return;
    const current=epoch,id=crypto.randomUUID();working=true;savePending(id);renderState();renderDocuments();
    $('resultat').hidden=true;message('travailMessage',modeCourant()==='corriger'?
      'Portalis IA examine ta copie et prépare les explications de sa correction. Le rapport et la note sont ensuite relus. Garde cette page ouverte pendant la préparation.':$('exercice').value==='commentaire-compare'?
      'Portalis IA rédige puis relit ton commentaire comparé. La préparation peut donc prendre plusieurs minutes. Garde cette page ouverte.':
      'Portalis IA travaille sur ton exercice. Garde cette page ouverte pendant la préparation de la réponse.');
    try{
      const result=await api('/api/generer',construireDemande({demandeId:id,mode:modeCourant(),exercice:$('exercice').value,texte:$('texte').value,copie:$('copie').value,question:$('question').value,documents}));
      if(current!==epoch)return;clearPending();if(result.etat)state=result.etat;compteurEnAttente=!result.etat;renderAnswer(result.reponse);message('travailMessage','Ta réponse est prête. Un crédit a été utilisé.');
    }catch(error){
      if(current!==epoch)return;
      if(!error.code){message('travailMessage','La connexion a été interrompue. Recherche de ta réponse…');await recover(id,current);}
      else{clearPending();message('travailMessage',error.message,true);}
    }finally{if(current===epoch){working=false;renderState();renderDocuments();volume();}}
  });
  $('copier').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(answer);$('copier').textContent='Réponse copiée';setTimeout(()=>{$('copier').textContent='Copier la réponse';},2000);}catch(_){message('travailMessage','Sélectionne le texte de la réponse pour le copier.',true);}});
  api('/api/generer?action=configuration').then(data=>{config=data;renderConfig();const initial=new URLSearchParams(location.search).get('formule');if(initial)choose(initial,false);}).catch(error=>{console.warn('Portalis IA configuration',error.message);message('paiementMessage','Les formules n’ont pas pu être chargées. Actualise la page.',true);});
  sb.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>changeSession(next),0);});
  sb.auth.getSession().then(result=>changeSession(result.data.session));
  volume();
})();
