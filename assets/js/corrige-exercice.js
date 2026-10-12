(function(){
  function el(tag,attrs,text){var x=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){x.setAttribute(k,attrs[k]);});if(text)x.textContent=text;return x;}
  function interne(){return(window.tjdEstTestInterne&&window.tjdEstTestInterne())||new URLSearchParams(location.search).get('tjd_test')==='1';}
  function monter(bloc){
    if(bloc.dataset.exercicePret)return;bloc.dataset.exercicePret='1';
    var id=bloc.dataset.exercice,carte=el('div',{'class':'tjd-co'});
    carte.appendChild(el('h3',{'class':'tjd-co__titre'},'Le corrigé complet de cet exercice, offert par email'));
    carte.appendChild(el('p',{'class':'tjd-co__intro'},'En t’inscrivant à ma newsletter, tu reçois le PDF de cet exercice avec sa correction complète.'));
    var form=el('form',{'class':'tjd-co__form'}),label=el('label',{'class':'tjd-co__label'},'Ton email');
    var input=el('input',{'class':'tjd-co__champ',type:'email',required:'',autocomplete:'email',placeholder:'ton@email.com'});label.appendChild(input);form.appendChild(label);
    var piege=el('input',{type:'text',name:'site',tabindex:'-1',autocomplete:'off','class':'tjd-co__piege','aria-hidden':'true'});form.appendChild(piege);
    var button=el('button',{type:'submit','class':'tjd-co__bouton'},'M’inscrire et recevoir ce corrigé');form.appendChild(button);
    form.appendChild(el('p',{'class':'tjd-co__rgpd'},'Tu reçois ce corrigé et les emails de Trajectoire Droit.'));
    form.appendChild(el('a',{href:'/confidentialite.html','class':'tjd-co__rgpd'},'Politique de confidentialité'));
    var status=el('p',{role:'status','aria-live':'polite','class':'tjd-co__statut'});form.appendChild(status);
    var confirme='';input.addEventListener('input',function(){confirme='';status.textContent='';});
    function envoyer(){
      if(!input.checkValidity()){input.reportValidity();return;}button.disabled=true;button.textContent='Envoi…';status.textContent='';
      var email=input.value.trim().toLowerCase();
      var req=interne()?Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true});}}):fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,exercice:id,site:piege.value,confirmerDomaine:confirme===email})});
      req.then(function(r){return r.json().then(function(d){
        if(r.status===409&&d.suggestion){
          button.disabled=false;button.textContent='M’inscrire et recevoir ce corrigé';status.appendChild(document.createTextNode('Le domaine de ton adresse ressemble à une faute de frappe. Tu peux choisir l’adresse à utiliser. '));
          var corriger=el('button',{type:'button','class':'btn btn--outline'},'Utiliser '+d.suggestion),garder=el('button',{type:'button','class':'btn btn--outline'},'Garder mon adresse');
          corriger.addEventListener('click',function(){input.value=d.suggestion;confirme='';envoyer();});garder.addEventListener('click',function(){confirme=email;envoyer();});status.appendChild(corriger);status.appendChild(garder);return;
        }
        if(!r.ok)throw new Error(d.error||'L’envoi a échoué. Tu peux réessayer dans quelques minutes.');
        carte.textContent='';carte.appendChild(el('h3',{'class':'tjd-co__titre'},'Ton corrigé est envoyé.'));
        carte.appendChild(el('p',null,'Tu vas recevoir le PDF de « '+bloc.dataset.titre+' » à l’adresse '+email+'. Tu peux aussi vérifier les spams et l’onglet Promotions.'));
        if(!interne()&&window._paq)window._paq.push(['trackEvent','Lead','CorrigeExercice',id]);
        if(!interne()&&typeof window.gtag==='function')window.gtag('event','generate_lead',{lead_source:'corrige-exercice',exercice:id});
      });}).catch(function(e){button.disabled=false;button.textContent='M’inscrire et recevoir ce corrigé';status.textContent=e.message;});
    }
    form.addEventListener('submit',function(e){e.preventDefault();envoyer();});carte.appendChild(form);bloc.textContent='';bloc.appendChild(carte);
  }
  function init(){document.querySelectorAll('[data-exercice]').forEach(monter);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
