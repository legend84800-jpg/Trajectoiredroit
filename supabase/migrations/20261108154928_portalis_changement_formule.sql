-- Les réponses déjà utilisées restent comptées lors du passage à une formule supérieure.
create or replace function public.portalis_synchroniser(p_user uuid, p_customer text, p_subscription text, p_formule text, p_statut text, p_debut timestamptz, p_fin timestamptz, p_resilie boolean, p_creation bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare precedente public.abonnements;
begin
  if p_formule not in ('portalis','classique','pro') or p_statut not in ('actif','annule','impaye') then raise exception 'configuration_invalide'; end if;
  select * into precedente from public.abonnements where user_id=p_user for update;
  if found and precedente.stripe_creation>p_creation then return; end if;
  if precedente.stripe_subscription_id=p_subscription and precedente.stripe_customer_id=p_customer
    and p_statut='actif' and precedente.periode_debut=p_debut and precedente.periode_fin=p_fin
    and array_position(array['portalis','classique','pro'],p_formule)>array_position(array['portalis','classique','pro'],precedente.formule) then
    update public.portalis_periodes set formule=p_formule
      where user_id=p_user and subscription_id=p_subscription and formule=precedente.formule and debut=p_debut and fin=p_fin;
    update public.portalis_recharges set formule=p_formule
      where user_id=p_user and formule=precedente.formule and restant>0;
  end if;
  insert into public.abonnements(user_id,stripe_customer_id,stripe_subscription_id,formule,statut,periode_debut,periode_fin,resilie_fin,stripe_creation)
  values(p_user,p_customer,p_subscription,p_formule,p_statut,p_debut,p_fin,p_resilie,p_creation)
  on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id,
    stripe_subscription_id=excluded.stripe_subscription_id, formule=excluded.formule, statut=excluded.statut,
    periode_debut=excluded.periode_debut, periode_fin=excluded.periode_fin,
    resilie_fin=excluded.resilie_fin, stripe_creation=excluded.stripe_creation
  where abonnements.stripe_creation <= excluded.stripe_creation;
end $$;
revoke all on function public.portalis_synchroniser(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint) from public,anon,authenticated;
grant execute on function public.portalis_synchroniser(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint) to service_role;
