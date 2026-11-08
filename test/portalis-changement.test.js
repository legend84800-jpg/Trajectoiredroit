const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const USER='12345678-1234-4234-8234-123456789abc';
const {FORMULES}=require('../api/_portalis-config');
function charger(file,stubs){
  const filename=path.join(__dirname,'..',file),module={exports:{}};
  const localRequire=name=>Object.hasOwn(stubs,name)?stubs[name]:require(require.resolve(name,{paths:[path.dirname(filename)]}));
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:localRequire,process,console,URL,AbortSignal,Date,JSON},{filename});
  return module.exports;
}
function abonnement(code='portalis'){
  return {id:'sub_fixture',status:'active',customer:'cus_fixture',created:100,metadata:{portalis:'abonnement',supabase_user_id:USER,formule:code},
    items:{data:[{id:'si_fixture',quantity:1,current_period_start:100,current_period_end:200,
      price:{id:`price_${code}`,unit_amount:FORMULES[code].prix,currency:'eur',lookup_key:`portalis-${code}-mensuel-${FORMULES[code].prix}-v1`,recurring:{interval:'month',interval_count:1}}}]},
    latest_invoice:{id:'in_initiale',status:'paid',amount_paid:FORMULES[code].prix},pending_update:null};
}
function montage(options={}){
  let sub=options.sub||abonnement(),updates=[],previews=[],syncs=[];
  const state={actif:true,formule:sub.metadata.formule,restant:53,utilise:7,renouvellement:200};
  const stripe={
    prices:{list:async()=>({data:[{id:'price_pro'}]})},
    invoices:{createPreview:async params=>{previews.push(params);return{currency:'eur',amount_due:1000,total:1000,...options.preview};}},
    subscriptions:{retrieve:async()=>sub,update:async(id,params,extra)=>{
      updates.push({id,params,extra});
      if(options.pending) sub={...sub,metadata:{...sub.metadata,formule:'pro'},pending_update:{subscription_items:[{price:'price_pro'}]},
        latest_invoice:{id:'in_changement',status:'open',hosted_invoice_url:'https://invoice.stripe.com/i/fixture'}};
      else sub={...abonnement('pro'),latest_invoice:{id:'in_changement',status:'paid',amount_paid:1000,billing_reason:'subscription_update'}};
      return sub;
    }}
  };
  const billing=require('../api/_portalis-billing');
  const current={stripe_customer_id:'cus_fixture',stripe_subscription_id:'sub_fixture'};
  const store={...require('../api/_portalis-store'),rpc:async()=>state,authentifier:async()=>({id:USER}),service:async()=>({json:async()=>[current]})};
  const helpers=charger('api/_portalis-checkout.js',{
    './_portalis-store':store,
    './_stripe':{creerClientStripe:()=>stripe},
    './_portalis-billing':{...billing,synchroniser:async()=>{syncs.push(sub);state.formule=billing.formuleStripe(sub);return sub;}}
  });
  return {stripe,helpers,updates,previews,syncs,getSub:()=>sub,current,user:{id:USER}};
}
test('le passage de 8 à 18 euros facture 10 euros et conserve la période et les 53 réponses',async()=>{
  const m=montage();const result=await m.helpers.changerFormule(m.stripe,m.current,m.user,'pro',1000);
  assert.equal(result.termine,true);assert.equal(result.etat.formule,'pro');assert.equal(result.etat.restant,53);
  assert.equal(m.updates.length,1);
  const {params,extra}=m.updates[0];
  assert.equal(params.items[0].id,'si_fixture');assert.equal(params.items[0].price,'price_pro');
  assert.equal(params.payment_behavior,'pending_if_incomplete');assert.equal(params.billing_cycle_anchor,'unchanged');
  assert.equal(params.proration_date,100);assert.equal(params.proration_behavior,'always_invoice');
  assert.equal(m.previews[0].subscription_details.proration_date,params.proration_date);
  assert.equal(params.metadata.formule,'pro');assert.match(extra.idempotencyKey,/sub_fixture-in_initiale-pro/);
  await m.helpers.changerFormule(m.stripe,m.current,m.user,'pro',1000);assert.equal(m.updates.length,1);
});
test('une authentification bancaire laisse la formule à 8 euros jusqu’au paiement et réutilise la facture',async()=>{
  const m=montage({pending:true});
  const result=await m.helpers.changerFormule(m.stripe,m.current,m.user,'pro',1000);
  assert.equal(result.url,'https://invoice.stripe.com/i/fixture');
  assert.equal(require('../api/_portalis-billing').formuleStripe(m.getSub()),'portalis');
  assert.equal((await m.helpers.changerFormule(m.stripe,m.current,m.user,'pro',1000)).url,result.url);
  assert.equal(m.updates.length,1);
});
test('un montant différent, une facture impayée ou un abonnement étranger bloque tout prélèvement',async t=>{
  for(const [label,options,expected] of [
    ['montant',{preview:{amount_due:1800,total:1800}},'montant_changement'],
    ['impaye',{sub:{...abonnement(),latest_invoice:{id:'in_initiale',status:'open'}}},'periode_impayee'],
    ['proprietaire',{sub:{...abonnement(),customer:'cus_autre'}},'abonnement_proprietaire'],
    ['statut',{sub:{...abonnement(),status:'past_due'}},'abonnement_requis']
  ])await t.test(label,async()=>{
    const m=montage(options);
    await assert.rejects(m.helpers.changerFormule(m.stripe,m.current,m.user,'pro',1000),{code:expected});assert.equal(m.updates.length,0);
  });
});
test('la synchronisation suit le prix payé quand les métadonnées annoncent encore un changement en attente',async()=>{
  const calls=[],sub=abonnement();sub.metadata.formule='pro';sub.pending_update={subscription_items:[{price:'price_pro'}]};
  const billing=charger('api/_portalis-billing.js',{'./_portalis-store':{rpc:async(name,args)=>calls.push({name,args})}});
  const result=await billing.synchroniser({subscriptions:{retrieve:async()=>sub}},sub);
  assert.equal(calls[0].args.p_formule,'portalis');assert.equal(result.metadata.formule,'portalis');
});
test('le parcours existant modifie le seul abonnement actif et ignore un montant fourni par le navigateur',async()=>{
  const m=montage(),res={status(code){this.statusCode=code;return this;},json(value){this.payload=value;}};
  await m.helpers.checkout({headers:{}},res,{mode:'subscription',formule:'pro',accordConditions:true,montantChangement:1000,prix:1,supabaseUserId:'un-autre-compte'});
  assert.equal(res.statusCode,200);assert.equal(res.payload.termine,true);assert.equal(m.updates.length,1);
  assert.equal(m.previews[0].subscription,'sub_fixture');assert.equal(res.payload.etat.restant,53);
});
test('un ancien prix affiché ou une page sans le montant confirmé empêche le prélèvement',async()=>{
  for(const montant of [undefined,1,600]){
    const m=montage();
    await assert.rejects(m.helpers.changerFormule(m.stripe,m.current,m.user,'pro',montant),{code:'prix_a_actualiser'});
    assert.equal(m.updates.length,0);assert.equal(m.previews.length,0);
  }
});
test('un changement expiré peut être repris sans bloquer la période initiale déjà payée',async()=>{
  const m=montage({sub:{...abonnement(),latest_invoice:{id:'in_expiree',status:'void',billing_reason:'subscription_update'}}});
  const result=await m.helpers.changerFormule(m.stripe,m.current,m.user,'pro',1000);
  assert.equal(result.termine,true);assert.equal(m.updates.length,1);
  assert.match(m.updates[0].extra.idempotencyKey,/in_expiree-pro/);
});
