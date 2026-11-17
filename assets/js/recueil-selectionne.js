(function(){
  var params=new URLSearchParams(location.search),id=params.get('produit'),block=document.getElementById('recueil-selectionne');if(!id||!block)return;
  fetch('/api/corriges-offerts').then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(d){
    var x=(d.recueils||[]).find(function(p){return p.id===id;});if(!x)return;
    var euro=function(n){return(n/100).toFixed(2).replace('.',',')+' €';},code=(params.get('code')||'').toUpperCase(),remise=code==='CORRIGE10',relance=/^RECUEIL-[A-F0-9]{8}$/.test(code),prixRelance=x.prix-Math.round(x.prix*.15);
    var title=document.createElement('h2');title.className='h2';title.textContent=x.nom;
    var libelleAchat = 'Acheter les commentaires d’arrêt corrigés';
    var contenu = x.nombre + ' commentaires d’arrêt rédigés en entier';
    if (id.startsWith('cas-pratique-')) {
      libelleAchat = 'Acheter les cas pratiques corrigés';
      contenu = x.nombre + ' exercices corrigés en entier, dont des cas pratiques et des sujets de partiel';
    } else if (id.startsWith('dissertation-')) {
      libelleAchat = 'Acheter les dissertations corrigées';
      contenu = x.nombre + ' dissertations corrigées en entier';
    }
    var text=document.createElement('p');text.textContent='Ce PDF contient '+contenu+'. Tu le reçois par email après le paiement.';
    var price=document.createElement('p');price.textContent=relance?'Avec ton code '+code+', tu paies '+euro(prixRelance)+' au lieu de '+euro(x.prix)+'. La réduction de 15 % s’applique au moment du paiement, pendant les 48 heures indiquées dans ton email.':remise?'Avec ton code CORRIGE10, tu paies '+euro(x.prixRemise)+' au lieu de '+euro(x.prix)+'. La réduction de 10 % s’applique au moment du paiement.':'Ce PDF coûte '+euro(x.prix)+'.';
    var button=document.createElement('button');button.type='button';button.className='btn btn--primary btn--lg';button.setAttribute('data-tjd-produit',id);button.textContent=libelleAchat+' · '+euro(relance?prixRelance:remise?x.prixRemise:x.prix);
    block.appendChild(title);block.appendChild(text);
    /* Aperçu du recueil choisi dans le bloc du haut (16/11/2026) : vignette d'une page et ouverture de la modale de sa carte */
    var source=document.querySelector('.card--product [data-apercu-cta="'+id+'"]');
    if(source&&source.hasAttribute('data-apercu')){var pages=[];try{pages=JSON.parse(source.getAttribute('data-apercu')||'[]');}catch(_){}
      if(pages.length){var apercu=document.createElement('button');apercu.type='button';apercu.className='recueil-selectionne__apercu';apercu.style.cssText='display:flex;align-items:center;gap:14px;margin:4px 0 16px;padding:0;border:0;background:none;cursor:pointer;text-align:left;font:inherit;color:var(--blue-600)';
        var vignette=document.createElement('img');vignette.src=pages.filter(function(u){var n=(u.match(/-p0*(\d+)\.webp$/)||[])[1];return n&&+n>=3;})[0]||pages[pages.length-1];vignette.alt='';vignette.width=120;vignette.loading='lazy';vignette.style.cssText='width:120px;height:auto;border:1px solid var(--border);border-radius:6px;box-shadow:var(--sh-2);background:#fff';
        var libelle=document.createElement('span');libelle.textContent='Voir '+pages.length+' pages du PDF';libelle.style.textDecoration='underline';
        apercu.appendChild(vignette);apercu.appendChild(libelle);apercu.addEventListener('click',function(){source.click();if(window._paq)window._paq.push(['trackEvent','Corriges','Apercu recueil selectionne',id]);});block.appendChild(apercu);}}
    block.appendChild(price);block.appendChild(button);block.hidden=false;
  }).catch(function(){block.hidden=false;block.textContent='Le PDF choisi est momentanément indisponible ici. Tu peux retrouver les corrigés dans les rubriques ci-dessous.';});
})();
