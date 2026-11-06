alter table public.portalis_demandes
  add column if not exists relecture_expire_le timestamptz;

create or replace function public.portalis_prolonger_relecture(p_user uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.abonnements where user_id=p_user for update;
  update public.portalis_demandes
    set relecture_expire_le=now()+interval '3 minutes'
    where id=p_id and user_id=p_user and statut='reservee'
      and coalesce(relecture_expire_le,cree_le+interval '3 minutes')>now();
  return found;
end $$;

revoke all on function public.portalis_prolonger_relecture(uuid,uuid) from public,anon,authenticated;
grant execute on function public.portalis_prolonger_relecture(uuid,uuid) to service_role;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.portalis_etat(uuid)'::regprocedure) into definition;
  if strpos(definition, 'cree_le < now()-interval ''3 minutes''')>0 then
    execute replace(definition,
      'cree_le < now()-interval ''3 minutes''',
      'coalesce(relecture_expire_le,cree_le+interval ''3 minutes'') < now()');
  elsif strpos(definition, 'coalesce(relecture_expire_le,cree_le+interval ''3 minutes'') < now()')=0 then
    raise exception 'expiration_portalis_inconnue';
  end if;
end $$;
