const {FORMULES,formuleValide,UUID}=require('./_portalis-config');
const {rpc,ErreurPortalis}=require('./_portalis-store');
const id=value=>typeof value==='string'?value:value?.id;
const iso=value=>Number.isFinite(value)?new Date(value*1000).toISOString():null;
const proprietaire=metadata=>metadata?.portalis==='abonnement'&&UUID.test(metadata.supabase_user_id||'')&&formuleValide(metadata.formule);
async function synchroniser(stripe,subscription) {
  const current=await stripe.subscriptions.retrieve(id(subscription),{expand:['latest_invoice']});
  if (!proprietaire(current.metadata)) return null;
  const item=current.items.data[0];
  const debut=iso(item?.current_period_start||current.current_period_start);
  const fin=iso(item?.current_period_end||current.current_period_end);
  const statut=current.status==='active'?'actif':['past_due','unpaid'].includes(current.status)?'impaye':'annule';
  await rpc('portalis_synchroniser',{p_user:current.metadata.supabase_user_id,p_customer:id(current.customer),
    p_subscription:current.id,p_formule:current.metadata.formule,p_statut:statut,p_debut:debut,p_fin:fin,
    p_resilie:!!current.cancel_at_period_end,p_creation:current.created});
  return current;
}
async function crediterFacture(stripe,invoice,subscription) {
  const facture=await stripe.invoices.retrieve(id(invoice));
  const subscriptionId=id(facture.parent?.subscription_details?.subscription||facture.subscription);
  if (!subscriptionId) return false;
  const current=subscription||await synchroniser(stripe,subscriptionId);
  if (!current || facture.status!=='paid'||facture.currency!=='eur') return false;
  if (subscriptionId!==current.id) return false;
  const plan=FORMULES[current.metadata.formule];
  // Une facture de prorata ou de régularisation n'ouvre pas une seconde période.
  if (!['subscription_create','subscription_cycle'].includes(facture.billing_reason)) return true;
  if (!plan.prix || facture.amount_paid<plan.prix) throw new Error('facture_portalis_montant');
  const line=facture.lines.data.find(l=>l.period && l.amount>=plan.prix);
  if (!line) throw new Error('facture_portalis_periode');
  await rpc('portalis_crediter_periode',{p_user:current.metadata.supabase_user_id,p_subscription:current.id,
    p_facture:facture.id,p_formule:current.metadata.formule,p_debut:iso(line.period.start),p_fin:iso(line.period.end)});
  return true;
}
async function synchroniserSession(stripe,sessionId,user) {
  const session=await stripe.checkout.sessions.retrieve(sessionId);
  if (!['abonnement','recharge'].includes(session.metadata?.portalis)) return false;
  if (user && session.metadata.supabase_user_id!==user) throw new ErreurPortalis('paiement','Ce paiement appartient à un autre compte.',403);
  if (session.payment_status!=='paid') return true;
  const m=session.metadata;
  if (!UUID.test(m.supabase_user_id||'')||!formuleValide(m.formule)) throw new Error('metadata_portalis');
  if (m.portalis==='abonnement') {
    const subscription=await synchroniser(stripe,session.subscription);
    if (!subscription||subscription.metadata.supabase_user_id!==m.supabase_user_id||id(subscription.customer)!==id(session.customer))
      throw new Error('abonnement_portalis_proprietaire');
    if (subscription.latest_invoice) await crediterFacture(stripe,subscription.latest_invoice,subscription);
  } else {
    const nombre=Number(m.nombre);
    const expected=FORMULES[m.formule].recharges[nombre];
    if (!expected||session.amount_total!==expected||session.currency!=='eur') throw new Error('recharge_portalis_montant');
    await rpc('portalis_crediter_recharge',{p_user:m.supabase_user_id,p_session:session.id,p_formule:m.formule,p_nombre:nombre});
  }
  return true;
}
async function evenementPortalis(stripe,event) {
  const object=event.data.object;
  // Les événements de test ne doivent pas ouvrir un accès sur le site public.
  if (event.livemode===false && process.env.VERCEL_ENV==='production') return !!object.metadata?.portalis;
  if (event.type.startsWith('customer.subscription.')&&proprietaire(object.metadata)) {
    const sub=await synchroniser(stripe,object);
    // Récupération du paiement permet de résister aux événements livrés dans le désordre.
    if(sub?.latest_invoice) await crediterFacture(stripe,sub.latest_invoice,sub);
    return true;
  }
  if (event.type.startsWith('checkout.session.')&&object.metadata?.portalis) {
    if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))
      await synchroniserSession(stripe,object.id);
    return true;
  }
  if (['invoice.paid','invoice.payment_failed'].includes(event.type)) {
    const subId=id(object.parent?.subscription_details?.subscription||object.subscription);
    if (!subId) return false;
    const sub=await synchroniser(stripe,subId);
    if (!sub) return false;
    if(event.type==='invoice.paid') await crediterFacture(stripe,object,sub);
    return true;
  }
  return false;
}
module.exports={evenementPortalis,synchroniserSession,crediterFacture,synchroniser};
