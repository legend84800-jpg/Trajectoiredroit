const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handler = require('../api/mes-telechargements');

function response() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(k,v) { this.headers[k]=v; },
    status(n) { this.statusCode=n; return this; },
    json(body) { this.body=body; return this; }, end() {} };
}
async function avecServeur(user, fn) {
  const oldFetch=global.fetch;
  const vars=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DOWNLOAD_SECRET'];
  const old=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
  process.env.SUPABASE_URL='https://auth.example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY='cle-service-factice';
  process.env.DOWNLOAD_SECRET='secret-telechargement-factice';
  const calls=[];
  global.fetch=async (url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/auth/v1/user')) return {ok:!!user,json:async()=>user};
    return {ok:true,json:async()=>[{produit_ids:['fiche-da-l2-s1'],cree_le:'2026-10-01',session_id:'cs_test_titulaire'}]};
  };
  try { await fn(calls); } finally {
    global.fetch=oldFetch;
    for(const k of vars) { if(old[k]===undefined) delete process.env[k]; else process.env[k]=old[k]; }
  }
}
const verified={id:'titulaire',email:'titulaire@example.invalid',email_confirmed_at:'2026-10-01',is_anonymous:false};

test('une adresse seule ne donne aucun accès aux achats',async()=>{
  await avecServeur(verified,async calls=>{
    const res=response(); await handler({method:'POST',body:{email:'victime@example.invalid',userId:'victime'}},res);
    assert.equal(res.statusCode,401); assert.equal(calls.length,0); assert.equal(res.body.achats,undefined);
  });
});
test('un jeton refusé par Auth ne permet aucune requête vers les achats',async()=>{
  await avecServeur(null,async calls=>{
    const res=response(); await handler({method:'POST',body:{accessToken:'jeton-factice'}},res);
    assert.equal(res.statusCode,401); assert.equal(calls.length,1); assert.match(calls[0].url,/auth\/v1\/user$/);
  });
});
test('les achats suivent l’identité vérifiée, même si le client fournit une autre adresse',async()=>{
  await avecServeur(verified,async calls=>{
    const res=response(); await handler({method:'POST',body:{accessToken:'jeton-valide-factice',email:'victime@example.invalid',userId:'victime'}},res);
    assert.equal(res.statusCode,200);
    const url=new URL(calls[1].url);
    assert.equal(url.searchParams.get('email'),'eq.titulaire@example.invalid');
    assert.equal(calls[0].options.headers.Authorization,'Bearer jeton-valide-factice');
    assert.match(res.headers['Cache-Control'],/private/); assert.match(res.headers['Cache-Control'],/no-store/);
    assert.equal(res.body.achats.length,1);
    const file=new URL(res.body.achats[0].produits[0].fichiers[0].url);
    assert.ok(file.searchParams.get('sig')); assert.equal(file.searchParams.get('sid'),'cs_test_titulaire');
    const restant=Number(file.searchParams.get('exp'))-Math.floor(Date.now()/1000);
    assert.ok(restant>=899 && restant<=900);
  });
});
for (const [label,user] of [
  ['adresse non confirmée',{...verified,email_confirmed_at:null}],
  ['compte anonyme',{...verified,is_anonymous:true}],
  ['adresse absente',{...verified,email:null}],
]) test(label+' ne donne aucun accès aux achats',async()=>{
  await avecServeur(user,async calls=>{
    const res=response(); await handler({method:'POST',body:{accessToken:'jeton-valide-factice'}},res);
    assert.equal(res.statusCode,401); assert.equal(calls.length,1);
  });
});

function deferred() { let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}; }
const tick=()=>new Promise(r=>setImmediate(r));
function browser(options={}) {
  const elements={};const timers=[];let callback;const requests=[];
  for(const id of ['etatChargement','etatConnexion','etatConnecte','connexionForm','connexionEmail','connexionSubmit','connexionError','connexionSuccess','compteEmail','deconnexionBtn','achatsListe','achatsVide']) {
    const classes=new Set();
    elements[id]={style:{},textContent:'',innerHTML:'',value:'',disabled:false,listeners:{},
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      addEventListener(event,fn){this.listeners[event]=fn;},reset(){this.resetCalled=true;} };
  }
  const auth={
    getSession:async()=>({data:{session:options.session||null}}),
    getUser:async token=> options.getUser ? options.getUser(token) : ({data:{user:verified}}),
    signInWithOtp:async input=>{requests.push({login:input});return {data:{session:null},error:null};},
    signOut:async input=>{requests.push({logout:input});callback('SIGNED_OUT',null);return {error:null};},
    onAuthStateChange(fn){callback=fn;},
  };
  const window={supabase:{createClient:()=>({auth})},setTimeout:fn=>{timers.push(fn);},location:{href:'https://trajectoiredroit.com/mon-compte.html?injection=1#injection'}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/compte.js'),'utf8'),{
    window,document:{getElementById:id=>elements[id]},Date,URLSearchParams,
    fetch:async(url,req)=>{requests.push({url,req});return options.fetch ? options.fetch(url,req) : {ok:true,status:200,json:async()=>({achats:[]})};},
  });
  return {elements,requests,auth,event:(event,session)=>callback(event,session),
    async flush(){await tick();for(const fn of timers.splice(0))fn();await tick();},
    state:id=>elements[id].classList.contains('is-active')};
}
function session(email='falsifie@example.invalid',token='session-factice') {return {access_token:token,user:{id:'identite-locale',email}};}
function achats(nom) {return {ok:true,status:200,json:async()=>({achats:[{date:'2026-10-01',produits:[{nom,fichiers:[]}]}]})};}

test('la demande de lien ne connecte pas et ignore les paramètres de redirection de la page',async()=>{
  const b=browser();await b.flush();b.elements.connexionEmail.value='titulaire@example.invalid';
  await b.elements.connexionForm.listeners.submit({preventDefault(){}});
  assert.ok(b.state('etatConnexion'));assert.equal(b.requests.filter(r=>r.url).length,0);
  assert.equal(b.requests[0].login.options.emailRedirectTo,'https://trajectoiredroit.com/mon-compte.html');
  assert.equal(b.elements.connexionSuccess.style.display,'block');
});
test('une session locale invalide est refusée avant tout chargement des achats',async()=>{
  const b=browser({session:session(),getUser:async()=>({error:{message:'Session expirée'},data:{user:null}})});
  await b.flush();assert.ok(b.state('etatConnexion'));assert.equal(b.requests.length,0);
  assert.equal(b.elements.compteEmail.textContent,'');
});
test('le compte affiché provient de l’identité vérifiée auprès du serveur',async()=>{
  const b=browser({session:session()});await b.flush();
  assert.ok(b.state('etatConnecte'));assert.equal(b.elements.compteEmail.textContent,verified.email);
});
test('une réponse tardive des achats ne réaffiche rien après la déconnexion',async()=>{
  const d=deferred();const b=browser({session:session(),fetch:()=>d.promise});await b.flush();
  assert.ok(b.state('etatConnecte'));
  await b.elements.deconnexionBtn.listeners.click();
  d.resolve(achats('Ressource privée'));await b.flush();
  assert.ok(b.state('etatConnexion'));assert.equal(b.elements.achatsListe.innerHTML,'');assert.equal(b.elements.compteEmail.textContent,'');
});
test('une vérification de session tardive ne réouvre pas le compte après la déconnexion',async()=>{
  const d=deferred();const b=browser({session:session(),getUser:()=>d.promise});await b.flush();
  await b.elements.deconnexionBtn.listeners.click();d.resolve({data:{user:verified}});await b.flush();
  assert.ok(b.state('etatConnexion'));assert.equal(b.requests.filter(r=>r.url).length,0);
});
test('la réponse du premier compte ne remplace pas les achats du compte suivant',async()=>{
  const d=deferred();let count=0;const b=browser({session:session(),fetch:()=>++count===1?d.promise:achats('Compte B')});
  await b.flush();b.event('SIGNED_IN',session('b@example.invalid','session-b'));await b.flush();
  assert.match(b.elements.achatsListe.innerHTML,/Compte B/);
  d.resolve(achats('Compte A'));await b.flush();
  assert.match(b.elements.achatsListe.innerHTML,/Compte B/);assert.doesNotMatch(b.elements.achatsListe.innerHTML,/Compte A/);
});
test('un refus du serveur masque le compte au lieu de montrer un historique vide',async()=>{
  const b=browser({session:session(),fetch:async()=>({ok:false,status:401,json:async()=>({erreur:'Session invalide'})})});
  await b.flush();assert.ok(b.state('etatConnexion'));assert.equal(b.elements.achatsListe.innerHTML,'');
});
