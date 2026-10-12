const test=require('node:test');
const assert=require('node:assert/strict');
const {EXERCICES,attributsExercice,suggestionEmail,emailExercice,recueils}=require('../api/_corriges-exercices');
test('chaque page livre son exercice et propose un recueil vérifié',()=>{
 assert.equal(Object.keys(EXERCICES).length,18);
 for(const [id,x] of Object.entries(EXERCICES)){
  const a=attributsExercice(id),mail=emailExercice(id);
  assert.equal(a.CORRIGE_PDF,x.pdf);assert.equal(a.MATIERE,x.produit);
  assert.match(mail.texte,/CORRIGE10/);assert.match(mail.html,/10 %/);
  assert(!a.CORRIGE_PDF.includes('/compilations/'));
 }
 assert.equal(attributsExercice('inconnu'),null);
 for(const x of recueils())assert.equal(x.prixRemise,1349);
});
test('la suggestion de domaine conserve les domaines inconnus',()=>{
 assert.equal(suggestionEmail('eleve@gmai.com'),'eleve@gmail.com');
 assert.equal(suggestionEmail('eleve@gmail.com'),'');
 assert.equal(suggestionEmail('eleve@universite.example'),'');
});
test('inscription, correction confirmée et livraison à un abonné existant',async()=>{
 const ancienFetch=global.fetch,ancienneCle=process.env.BREVO_API_KEY,ancienneListe=process.env.BREVO_LIST_ID;
 process.env.BREVO_API_KEY='test';process.env.BREVO_LIST_ID='3';
 const handler=require('../api/lead');let existant=false,appels=[];
 global.fetch=async(url,opt={})=>{appels.push({url,opt});if(!opt.method)return {status:existant?200:404,ok:existant,json:async()=>({listIds:[3]})};return{ok:true,status:201,json:async()=>({})};};
 const response=()=>({statusCode:200,status(x){this.statusCode=x;return this;},json(x){this.data=x;return this;}});
 try{
  let res=response();await handler({method:'POST',headers:{'x-forwarded-for':'test1'},body:{email:'eleve@gmai.com',exercice:'cas-pratique-dol-reticence-dolosive-corrige'}},res);
  assert.equal(res.statusCode,409);assert.equal(appels.length,0);
  res=response();await handler({method:'POST',headers:{'x-forwarded-for':'test2'},body:{email:'eleve@gmai.com',confirmerDomaine:true,exercice:'cas-pratique-dol-reticence-dolosive-corrige'}},res);
  assert.equal(res.statusCode,200);assert.equal(appels.length,2);
  let attrs=JSON.parse(appels[1].opt.body);assert.equal(attrs.email,'eleve@gmai.com');assert.match(attrs.attributes.CORRIGE_PDF,/dol-reticence/);
  existant=true;appels=[];res=response();await handler({method:'POST',headers:{'x-forwarded-for':'test3'},body:{email:'eleve@gmail.com',exercice:'commentaire-arret-uber-2020-corrige'}},res);
  assert.equal(res.statusCode,200);assert.equal(appels.length,3);assert.equal(JSON.parse(appels[2].opt.body).templateId,33);assert.match(JSON.parse(appels[1].opt.body).attributes.CORRIGE_PDF,/uber-2020/);
  appels=[];res=response();await handler({method:'POST',body:{email:'eleve@gmail.com',exercice:'inconnu'}},res);assert.equal(res.statusCode,400);assert.equal(appels.length,0);
 }finally{global.fetch=ancienFetch;if(ancienneCle===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=ancienneCle;if(ancienneListe===undefined)delete process.env.BREVO_LIST_ID;else process.env.BREVO_LIST_ID=ancienneListe;}
});
test('la remise de corrigés refuse un achat de fiche',async()=>{
 const h=require('../api/create-checkout');const r={setHeader(){},status(c){this.code=c;return this;},json(d){this.data=d;return this;}};
 await h({method:'POST',body:{produitId:'fiche-intro-droit-l1',code:'CORRIGE10'}},r);assert.equal(r.code,400);assert.equal(r.data.code,'remise_corriges');
});
