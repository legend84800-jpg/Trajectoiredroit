(function(){
  var params=new URLSearchParams(location.search),id=params.get('produit'),block=document.getElementById('recueil-selectionne');if(!id||!block)return;
  fetch('/api/corriges-offerts').then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(d){
    var x=(d.recueils||[]).find(function(p){return p.id===id;});if(!x)return;
    var euro=function(n){return(n/100).toFixed(2).replace('.',',')+' €';},remise=(params.get('code')||'').toUpperCase()==='CORRIGE10';
    var title=document.createElement('h2');title.className='h2';title.textContent=x.nom;
    var text=document.createElement('p');text.textContent='Le recueil réunit '+x.nombre+' '+x.type+', corrigés en entier. Tu reçois le PDF par email après le paiement.';
    var price=document.createElement('p');price.textContent=remise?'Avec ton code CORRIGE10, tu paies '+euro(x.prixRemise)+' au lieu de '+euro(x.prix)+'. La réduction de 10 % s’applique au moment du paiement.':'Le recueil coûte '+euro(x.prix)+'.';
    var button=document.createElement('button');button.type='button';button.className='btn btn--primary btn--lg';button.setAttribute('data-tjd-produit',id);button.textContent='Acheter le recueil · '+euro(remise?x.prixRemise:x.prix);
    block.appendChild(title);block.appendChild(text);block.appendChild(price);block.appendChild(button);block.hidden=false;
  }).catch(function(){block.hidden=false;block.textContent='Le recueil ne peut pas s’afficher pour le moment. Tu peux retrouver les corrigés dans les rubriques ci-dessous.';});
})();
