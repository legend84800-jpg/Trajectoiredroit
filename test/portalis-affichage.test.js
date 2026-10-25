const test=require('node:test');
const assert=require('node:assert/strict');
const {rendreMarkdown,delaiRequete}=require('../assets/js/portalis.js');

class Noeud {
  constructor(tag,texte=''){this.tag=tag;this.texte=texte;this.children=[];this.style={};}
  append(...enfants){this.children.push(...enfants);}
  replaceChildren(...enfants){this.texte='';this.children=[...enfants];}
  set textContent(texte){this.texte=String(texte);this.children=[];}
  get textContent(){return this.texte+this.children.map(n=>n.textContent).join('');}
  set innerHTML(_){throw new Error('Le texte du modèle ne doit pas être interprété comme du HTML.');}
}
function rendre(texte){
  const parent=new Noeud('div'),doc={createElement:tag=>new Noeud(tag),createTextNode:texte=>new Noeud('#text',texte)};
  rendreMarkdown(parent,texte,doc);return parent;
}
function descendants(noeud){return noeud.children.flatMap(n=>[n,...descendants(n)]);}

test('sépare titres et paragraphes même sans ligne vide et conserve le gras',()=>{
  const p=rendre('# **La règle**\nUne **condition** doit être établie.\nSon application reçoit une explication.\n\n## Application\nLe fait est vérifié.');
  assert.deepEqual(p.children.map(n=>n.tag),['h4','p','h5','p']);
  assert.equal(p.children[0].textContent,'La règle');
  assert.equal(p.children[0].children[0].tag,'strong');
  assert.equal(p.children[1].textContent,'Une condition doit être établie.\nSon application reçoit une explication.');
  assert.equal(p.children[1].children.find(n=>n.tag==='strong').textContent,'condition');
  assert.equal(p.children[3].textContent,'Le fait est vérifié.');
});

test('préserve une liste numérotée, ses sous-conditions et la reprise en prose',()=>{
  const p=rendre('3. Une condition\n   - Un premier indice\n     Une explication de cet indice.\n   - Un autre indice\n4. La condition suivante\n\nLa conclusion découle de ces faits.');
  assert.deepEqual(p.children.map(n=>n.tag),['ol','p']);
  const ol=p.children[0];assert.equal(ol.start,3);assert.equal(ol.children.length,2);
  assert.deepEqual(ol.children.map(n=>n.tag),['li','li']);
  const ul=ol.children[0].children.find(n=>n.tag==='ul');assert.equal(ul.children.length,2);
  assert.equal(ul.children[0].textContent,'Un premier indice\nUne explication de cet indice.');
  assert.equal(ol.children[1].textContent,'La condition suivante');
  assert.equal(p.children[1].textContent,'La conclusion découle de ces faits.');
});

test('le contenu HTML fourni par le modèle reste du texte jusque dans le gras et les listes',()=>{
  const attaque='<img src=x onerror=alert(1)><script>alert(2)</script>';
  const p=rendre('# '+attaque+'\n\n**'+attaque+'**\n\n- '+attaque+'\n- [ouvrir](javascript:alert(3))');
  const balises=descendants(p).map(n=>n.tag);
  assert(balises.every(t=>['h4','p','strong','ul','li','#text'].includes(t)));
  assert.equal(descendants(p).filter(n=>n.tag==='img'||n.tag==='script'||n.tag==='a').length,0);
  assert(p.textContent.includes(attaque));
  assert(p.textContent.includes('[ouvrir](javascript:alert(3))'));
  assert.equal(p.children.find(n=>n.tag==='p').children[0].textContent,attaque);
});

test('garde les marqueurs incomplets lisibles et remplace entièrement une réponse précédente',()=>{
  const parent=rendre('Ancienne réponse');
  const doc={createElement:tag=>new Noeud(tag),createTextNode:texte=>new Noeud('#text',texte)};
  rendreMarkdown(parent,'Une **citation incomplète\n\n*Une remarque* et `un terme`.',doc);
  assert(!parent.textContent.includes('Ancienne réponse'));
  assert(parent.textContent.includes('**citation incomplète'));
  assert.equal(descendants(parent).find(n=>n.tag==='em').textContent,'Une remarque');
  assert.equal(descendants(parent).find(n=>n.tag==='code').textContent,'un terme');
});

test('accorde 225 secondes à la génération et conserve 115 secondes aux autres actions',()=>{
  assert.equal(delaiRequete({action:'generer'}),225000);
  for(const body of [undefined,null,{}, {action:'importer'},{action:'upload'},{action:'synchroniser'}])assert.equal(delaiRequete(body),115000);
});
