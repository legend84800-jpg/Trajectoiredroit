const {createHash,randomUUID}=require('node:crypto');
const {ABONNEMENTS_OUVERTS,FORMULES,formuleValide,UUID}=require('./_portalis-config');
const {authentifier,ErreurPortalis,service,rpc}=require('./_portalis-store');
const {creerClientStripe}=require('./_stripe');
const {synchroniser,formuleStripe}=require('./_portalis-billing');
const ORIGIN='https://trajectoiredroit.com';
async function prixStripe(stripe,formule,nombre) {
  const plan=FORMULES[formule];
  const montant=nombre?plan.recharges[nombre]:plan.prix;
  const lookup=`portalis-${formule}-${nombre||'mensuel'}-${montant}-v1`;
  const found=await stripe.prices.list({lookup_keys:[lookup],active:true,limit:1});
  if(found.data[0]) return found.data[0].id;
  const product=await stripe.products.create({name:nombre?`${plan.nom} · ${nombre} réponses`:plan.nom,
    metadata:{portalis:'oui',formule}}, {idempotencyKey:`produit-${lookup}`});
  const price=await stripe.prices.create({product:product.id,currency:'eur',unit_amount:montant,
    lookup_key:lookup,...(!nombre?{recurring:{interval:'month'}}:{})}, {idempotencyKey:`prix-${lookup}`});
  return price.id;
}
async function configurationPortail(stripe) {
  const configs=await stripe.billingPortal.configurations.list({active:true,limit:100});
  const found=configs.data.find(c=>c.metadata?.portalis==='v1');
  if(found) return found.id;
  const config=await stripe.billingPortal.configurations.create({metadata:{portalis:'v1'},
    business_profile:{headline:'Ton abonnement Portalis IA'},
    features:{customer_update:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true},
      subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:false}}},
    {idempotencyKey:'portalis-portal-v1'});
  return config.id;
}
async function changerFormule(stripe,current,user,formule,montantAttendu) {
  if(!current?.stripe_subscription_id||!current.stripe_customer_id)
    throw new ErreurPortalis('abonnement_absent','Actualise ton espace pour retrouver ton abonnement.',409);
  const subscription=await stripe.subscriptions.retrieve(current.stripe_subscription_id,{expand:['latest_invoice']});
  const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id;
  if(customer!==current.stripe_customer_id||subscription.metadata?.supabase_user_id!==user.id||subscription.metadata?.portalis!=='abonnement')
    throw new ErreurPortalis('abonnement_proprietaire','Cet abonnement appartient à un autre compte.',403);
  const source=formuleStripe(subscription),item=subscription.items?.data?.[0];
  if(subscription.status!=='active'||!formuleValide(source))
    throw new ErreurPortalis('abonnement_requis','Ouvre la gestion de ton abonnement pour vérifier son paiement.',409);
  if(source===formule) {
    await synchroniser(stripe,subscription);
    return {termine:true,etat:await rpc('portalis_etat',{p_user:user.id})};
  }
  const difference=FORMULES[formule].prix-FORMULES[source].prix;
  if(difference<=0) throw new ErreurPortalis('formule_inferieure','Contacte Julien pour passer à une formule moins chère.',409);
  if(montantAttendu!==difference) throw new ErreurPortalis('prix_a_actualiser','Actualise la page pour vérifier le prix du changement.',409);
  const price=await prixStripe(stripe,formule);
  if(subscription.pending_update) {
    const pending=subscription.pending_update.subscription_items?.[0]?.price;
    if((typeof pending==='string'?pending:pending?.id)===price&&subscription.latest_invoice?.status==='open'&&subscription.latest_invoice.hosted_invoice_url)
      return {url:subscription.latest_invoice.hosted_invoice_url};
    throw new ErreurPortalis('changement_en_cours','Un changement attend déjà son paiement dans ton espace de facturation.',409);
  }
  const debut=item.current_period_start||subscription.current_period_start;
  if(!Number.isInteger(debut)||subscription.latest_invoice?.status!=='paid')
    throw new ErreurPortalis('periode_impayee','Le paiement de la période actuelle doit être confirmé avant le changement.',409);
  const details={items:[{id:item.id,price,quantity:1}],proration_behavior:'always_invoice',proration_date:debut};
  const preview=await stripe.invoices.createPreview({subscription:subscription.id,subscription_details:details});
  if(preview.currency!=='eur'||preview.amount_due!==difference||preview.total!==difference)
    throw new ErreurPortalis('montant_changement','Le montant calculé diffère du prix annoncé. Contacte Julien avant de payer.',409);
  const key=`portalis-changement-${subscription.id}-${subscription.latest_invoice.id}-${formule}`;
  const updated=await stripe.subscriptions.update(subscription.id,{...details,payment_behavior:'pending_if_incomplete',
    billing_cycle_anchor:'unchanged',metadata:{...subscription.metadata,formule},expand:['latest_invoice']},{idempotencyKey:key});
  const fresh=await synchroniser(stripe,updated);
  if(fresh&&!fresh.pending_update&&formuleStripe(fresh)===formule)
    return {termine:true,etat:await rpc('portalis_etat',{p_user:user.id})};
  const invoice=fresh?.latest_invoice||updated.latest_invoice;
  if(invoice?.hosted_invoice_url) return {url:invoice.hosted_invoice_url};
  throw new ErreurPortalis('paiement_en_cours','Le changement attend la confirmation du paiement. Actualise ton espace dans un instant.',409);
}
async function checkout(req,res,body) {
  try {
    const user=await authentifier(req);
    if(!ABONNEMENTS_OUVERTS&&body.type!=='portal') throw new ErreurPortalis('offre_en_preparation','Les abonnements Portalis IA seront disponibles prochainement.',503);

    const stripe=creerClientStripe(process.env.STRIPE_SECRET_KEY);
    const rows=await (await service(`/rest/v1/abonnements?user_id=eq.${user.id}&select=stripe_customer_id,stripe_subscription_id&limit=1`)).json();
    const current=rows[0];
    if (body.type==='portal') {
      if(!current?.stripe_customer_id) throw new ErreurPortalis('abonnement_absent','Aucun abonnement à gérer.');
      const portal=await stripe.billingPortal.sessions.create({customer:current.stripe_customer_id,
        configuration:await configurationPortail(stripe),return_url:`${ORIGIN}/portalis.html#espace`});
      res.status(200).json({url:portal.url}); return;
    }
    const formule=body.formule;
    if(!formuleValide(formule)) throw new ErreurPortalis('formule','Choisis une formule.');
    const recharge=body.type==='portalis_recharge';
    if(!recharge&&body.accordConditions!==true) throw new ErreurPortalis('conditions','Accepte les conditions de vente pour continuer.');
    const nombre=recharge?Number(body.nombre):undefined;
    const plan=FORMULES[formule];
    if(!plan.prix||(recharge&&![20,60].includes(nombre))||(recharge&&!plan.recharges[nombre]))
      throw new ErreurPortalis('tarif_en_attente','Les tarifs de cette offre sont en cours de validation.',503);
    const state=await rpc('portalis_etat',{p_user:user.id});
    if(recharge&&(!state.actif||state.formule!==formule)) throw new ErreurPortalis('abonnement_requis','La recharge doit correspondre à ton abonnement actif.',403);
    if(!recharge&&state.actif) {
      res.status(200).json(await changerFormule(stripe,current,user,formule,body.montantChangement)); return;
    }
    let customer=current?.stripe_customer_id;
    if(!customer) {
      const c=await stripe.customers.create({email:user.email,metadata:{supabase_user_id:user.id}},
        {idempotencyKey:`portalis-customer-${user.id}`});
      customer=c.id;
      await service('/rest/v1/abonnements?on_conflict=user_id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
        body:JSON.stringify({user_id:user.id,stripe_customer_id:customer,statut:'annule'})});
    }
    if(!recharge){
      const subscriptions=await stripe.subscriptions.list({customer,status:'all',limit:100});
      if(subscriptions.data.some(s=>s.metadata?.portalis==='abonnement'&&['active','past_due','trialing'].includes(s.status)))
        throw new ErreurPortalis('abonnement_existant','Un abonnement existe déjà. Actualise ton espace ou gère ton abonnement.',409);
    }
    const metadata={portalis:recharge?'recharge':'abonnement',supabase_user_id:user.id,formule,
      ...(recharge?{nombre:String(nombre)}:{})};
    const attempt=UUID.test(body.attemptId||'')?body.attemptId:randomUUID();
    const key=createHash('sha256').update(JSON.stringify([user.id,formule,nombre,attempt])).digest('hex');
    const session=await stripe.checkout.sessions.create({mode:recharge?'payment':'subscription',customer,
      locale:'fr',payment_method_types:['card'],wallet_options:{link:{display:'never'}},
      line_items:[{price:await prixStripe(stripe,formule,nombre),quantity:1}],metadata,
      ...(!recharge?{subscription_data:{metadata}}:{}),
      success_url:`${ORIGIN}/portalis.html?session_id={CHECKOUT_SESSION_ID}#espace`,
      cancel_url:`${ORIGIN}/portalis.html#formules`,expires_at:Math.floor(Date.now()/1000)+3600,
      custom_text:{submit:{message:recharge?'Cette recharge est un achat ponctuel. Elle reste disponible avec la même formule active.':'60 réponses par période mensuelle. Résiliation depuis ton espace, avec accès jusqu’à la fin de la période payée.'}}},
      {idempotencyKey:`portalis-${key}`});
    res.status(200).json({url:session.url});
  } catch(error) {
    if(!(error instanceof ErreurPortalis)) console.error('Portalis checkout',{code:error.code||error.type||error.message});
    res.status(error.status||502).json({code:error.code||'paiement',erreur:error.status?error.message:'Le paiement est temporairement indisponible. Réessaie dans un instant.'});
  }
}
module.exports={checkout,prixStripe,configurationPortail,changerFormule};
