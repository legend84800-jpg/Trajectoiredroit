const test=require('node:test'),assert=require('node:assert/strict');
const {maintenirReservation}=require('../api/_portalis-reservation');
const {genererAvecRecherche,DELAI_TOTAL}=require('../api/_portalis-web');
test('une rédaction complète peut dépasser les anciennes 162 secondes',async()=>{
  let temps=0;
  const result=await genererAvecRecherche(async()=>{
    temps=190000;return{stop_reason:'end_turn',content:[{type:'text',text:'Le corrigé complet conserve son raisonnement après plus de trois minutes.'}],usage:{input_tokens:100,output_tokens:100}};
  },{model:'fixture',messages:[{role:'user',content:'Un exercice juridique complet.'}],max_tokens:1000},{maintenant:()=>temps});
  assert.equal(result.stop_reason,'end_turn');assert.match(result.reponse,/corrigé complet/);assert.equal(DELAI_TOTAL,720000);
});
test('la réservation est prolongée pendant la rédaction et le rappel est arrêté après réussite',async()=>{
  let rappel,nb=0,annules=0;
  const garde=maintenirReservation(async()=>{nb++;return true;},{planifier:(fn,ms)=>{rappel=fn;assert.equal(ms,45000);return{};},annuler:()=>annules++});
  await rappel();await rappel();assert.equal(nb,2);garde.verifier();
  await garde.arreter();await rappel();assert.equal(nb,2);assert.equal(annules,1);assert.equal(garde.signal.aborted,false);
});
test('une réservation perdue interrompt la requête du modèle',async()=>{
  let rappel;
  const garde=maintenirReservation(async()=>false,{planifier:fn=>{rappel=fn;return{};},annuler(){}});
  await rappel();assert.equal(garde.signal.aborted,true);assert.throws(()=>garde.verifier(),/reservation_expiree/);await garde.arreter();
});
test('une indisponibilité brève du renouvellement permet le rappel suivant',async()=>{
  let rappel,nb=0,signales=0;
  const garde=maintenirReservation(async()=>{if(++nb===1)throw Error('supabase_503');return true;},
    {planifier:fn=>{rappel=fn;return{};},annuler(){},signaler(){signales++;}});
  await rappel();await rappel();garde.verifier();assert.equal(nb,2);assert.equal(signales,1);await garde.arreter();
});
