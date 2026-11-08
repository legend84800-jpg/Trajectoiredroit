const {setInterval,clearInterval}=require('node:timers');
function maintenirReservation(prolonger,{planifier=setInterval,annuler=clearInterval,signaler=()=>{}}={}){
  const controleur=new AbortController();
  let arrete=false,enCours=Promise.resolve();
  const verifier=()=>{if(controleur.signal.aborted)throw controleur.signal.reason;};
  const renouveler=()=>{
    enCours=enCours.then(async()=>{
      if(arrete||controleur.signal.aborted)return;
      try{if(!await prolonger())controleur.abort(new Error('reservation_expiree'));}
      catch(error){signaler(error);}
    });
    return enCours;
  };
  const timer=planifier(renouveler,45000);timer.unref?.();
  return {signal:controleur.signal,verifier,async arreter(){arrete=true;annuler(timer);await enCours;}};
}
module.exports={maintenirReservation};
