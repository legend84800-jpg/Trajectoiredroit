alter table public.portalis_demandes add column if not exists erreur_code text;

create or replace function public.portalis_signaler_echec(p_user uuid,p_id uuid,p_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.portalis_echouer(p_user,p_id);
  update public.portalis_demandes set erreur_code=left(p_code,80)
    where user_id=p_user and id=p_id and statut='echouee';
  return found;
end $$;
revoke all on function public.portalis_signaler_echec(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.portalis_signaler_echec(uuid,uuid,text) to service_role;

create or replace function public.portalis_reserver(p_user uuid,p_id uuid,p_empreinte text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a abonnements; p portalis_periodes; d portalis_demandes; r portalis_recharges; s jsonb;
begin
  s:=portalis_etat(p_user);
  select * into d from portalis_demandes where id=p_id;
  if found then
    if d.user_id<>p_user or d.empreinte<>p_empreinte then return jsonb_build_object('code','demande_invalide'); end if;
    if d.statut='terminee' and d.reponse is not null then return jsonb_build_object('code','deja_terminee','reponse',d.reponse); end if;
    return jsonb_build_object('code',case when d.statut='reservee' then 'en_cours' else 'demande_expiree' end);
  end if;
  if not coalesce((s->>'actif')::boolean,false) then return jsonb_build_object('code','abonnement_requis'); end if;
  select * into a from abonnements where user_id=p_user for update;
  if exists(select 1 from portalis_demandes where user_id=p_user and statut='reservee') then return jsonb_build_object('code','en_cours'); end if;
  if (select count(*) from portalis_demandes where user_id=p_user and statut='echouee'
    and erreur_code is distinct from 'delai' and cree_le>now()-interval '1 hour')>=5 then
    return jsonb_build_object('code','pause_temporaire');
  end if;
  select * into p from portalis_periodes where user_id=p_user and subscription_id=a.stripe_subscription_id and formule=a.formule and debut<=now() and fin>now() order by debut desc limit 1 for update;
  if p.id is null then return jsonb_build_object('code','abonnement_requis'); end if;
  if p.utilise<60 then
    update portalis_periodes set utilise=utilise+1 where id=p.id;
  else
    select * into r from portalis_recharges where user_id=p_user and formule=a.formule and restant>0 order by cree_le limit 1 for update;
    if not found then return jsonb_build_object('code','quota_epuise'); end if;
    update portalis_recharges set restant=restant-1 where session_id=r.session_id;
  end if;
  insert into portalis_demandes(id,user_id,periode_id,recharge_id,empreinte,formule)
  values(p_id,p_user,p.id,r.session_id,p_empreinte,a.formule);
  return jsonb_build_object('code','reservee','formule',a.formule);
end $$;
