-- Portalis, quotas atomiques liés aux périodes réellement payées.
-- Migration additive. Les anciennes tables restent intactes.
alter table public.abonnements add column if not exists formule text;
alter table public.abonnements add column if not exists periode_debut timestamptz;
alter table public.abonnements add column if not exists resilie_fin boolean not null default false;
alter table public.abonnements add column if not exists stripe_creation bigint not null default 0;

create table public.portalis_periodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id text not null,
  facture_id text not null unique,
  formule text not null check (formule in ('portalis','classique','pro')),
  debut timestamptz not null,
  fin timestamptz not null check (fin > debut),
  utilise integer not null default 0 check (utilise between 0 and 60),
  unique (user_id, subscription_id, debut)
);
create table public.portalis_recharges (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  formule text not null check (formule in ('portalis','classique','pro')),
  nombre integer not null check (nombre in (20,60)),
  restant integer not null check (restant >= 0 and restant <= nombre),
  cree_le timestamptz not null default now()
);
create table public.portalis_demandes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  periode_id uuid not null references public.portalis_periodes(id),
  recharge_id text references public.portalis_recharges(session_id),
  empreinte text not null,
  formule text not null,
  statut text not null default 'reservee' check (statut in ('reservee','terminee','echouee')),
  reponse text,
  entree integer,
  sortie integer,
  cree_le timestamptz not null default now(),
  termine_le timestamptz
);
create index portalis_demandes_user_idx on public.portalis_demandes(user_id, cree_le desc);
create table public.portalis_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chemin text not null,
  pages integer check (pages between 1 and 15),
  texte text check (char_length(texte) <= 30000),
  cree_le timestamptz not null default now()
);
create index portalis_documents_user_idx on public.portalis_documents(user_id, cree_le);

alter table public.portalis_periodes enable row level security;
alter table public.portalis_recharges enable row level security;
alter table public.portalis_demandes enable row level security;
alter table public.portalis_documents enable row level security;
-- Aucun droit de lecture/écriture depuis le navigateur, API authentifiée uniquement.
revoke all on public.portalis_periodes, public.portalis_recharges, public.portalis_demandes, public.portalis_documents from anon, authenticated;
grant all on public.portalis_periodes, public.portalis_recharges, public.portalis_demandes, public.portalis_documents to service_role;

create function public.portalis_synchroniser(p_user uuid, p_customer text, p_subscription text, p_formule text, p_statut text, p_debut timestamptz, p_fin timestamptz, p_resilie boolean, p_creation bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_formule not in ('portalis','classique','pro') or p_statut not in ('actif','annule','impaye') then raise exception 'configuration_invalide'; end if;
  insert into abonnements(user_id,stripe_customer_id,stripe_subscription_id,formule,statut,periode_debut,periode_fin,resilie_fin,stripe_creation)
  values(p_user,p_customer,p_subscription,p_formule,p_statut,p_debut,p_fin,p_resilie,p_creation)
  on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id,
    stripe_subscription_id=excluded.stripe_subscription_id, formule=excluded.formule, statut=excluded.statut,
    periode_debut=excluded.periode_debut, periode_fin=excluded.periode_fin,
    resilie_fin=excluded.resilie_fin, stripe_creation=excluded.stripe_creation
  where abonnements.stripe_creation <= excluded.stripe_creation;
end $$;

create function public.portalis_crediter_periode(p_user uuid, p_subscription text, p_facture text, p_formule text, p_debut timestamptz, p_fin timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into portalis_periodes(user_id,subscription_id,facture_id,formule,debut,fin)
  values(p_user,p_subscription,p_facture,p_formule,p_debut,p_fin)
  on conflict do nothing;
end $$;

create function public.portalis_crediter_recharge(p_user uuid, p_session text, p_formule text, p_nombre integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into portalis_recharges(session_id,user_id,formule,nombre,restant)
  values(p_session,p_user,p_formule,p_nombre,p_nombre) on conflict do nothing;
end $$;

create function public.portalis_echouer(p_user uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare d portalis_demandes;
begin
  perform 1 from abonnements where user_id=p_user for update;
  select * into d from portalis_demandes where id=p_id and user_id=p_user for update;
  if not found or d.statut <> 'reservee' then return false; end if;
  if d.recharge_id is null then
    update portalis_periodes set utilise=greatest(0,utilise-1) where id=d.periode_id;
  else
    update portalis_recharges set restant=least(nombre,restant+1) where session_id=d.recharge_id;
  end if;
  update portalis_demandes set statut='echouee', termine_le=now() where id=d.id;
  return true;
end $$;

create function public.portalis_etat(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a abonnements; p portalis_periodes; extra integer; d record;
begin
  select * into a from abonnements where user_id=p_user for update;
  if not found then return jsonb_build_object('actif',false); end if;
  for d in select id from portalis_demandes where user_id=p_user and statut='reservee' and cree_le < now()-interval '3 minutes'
  loop perform portalis_echouer(p_user,d.id); end loop;
  select * into p from portalis_periodes where user_id=p_user and subscription_id=a.stripe_subscription_id and formule=a.formule and debut<=now() and fin>now() order by debut desc limit 1;
  select coalesce(sum(restant),0) into extra from portalis_recharges where user_id=p_user and formule=a.formule;
  return jsonb_build_object('actif',a.statut='actif' and p.id is not null and a.periode_fin>now(),
    'formule',a.formule,'statut',a.statut,'utilise',coalesce(p.utilise,0),
    'restant',case when p.id is null then 0 else 60-p.utilise end,'recharges',extra,
    'renouvellement',a.periode_fin,'resilieFin',a.resilie_fin);
end $$;

create function public.portalis_reserver(p_user uuid, p_id uuid, p_empreinte text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
  if (select count(*) from portalis_demandes where user_id=p_user and statut='echouee' and cree_le>now()-interval '1 hour')>=5 then
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

create function public.portalis_terminer(p_user uuid, p_id uuid, p_reponse text, p_entree integer, p_sortie integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_reponse is null or char_length(p_reponse)<20 or char_length(p_reponse)>100000 then raise exception 'reponse_invalide'; end if;
  perform 1 from abonnements where user_id=p_user for update;
  update portalis_demandes set statut='terminee',reponse=p_reponse,entree=p_entree,sortie=p_sortie,termine_le=now()
  where id=p_id and user_id=p_user and statut='reservee';
  return found;
end $$;

create function public.portalis_preparer_document(p_user uuid, p_id uuid, p_chemin text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_chemin <> p_user::text || '/' || p_id::text || '.pdf' then return false; end if;
  perform 1 from abonnements where user_id=p_user for update;
  if not coalesce((portalis_etat(p_user)->>'actif')::boolean,false) then return false; end if;
  if (select count(*) from portalis_documents where user_id=p_user and cree_le>now()-interval '1 hour')>=15 then return false; end if;
  insert into portalis_documents(id,user_id,chemin) values(p_id,p_user,p_chemin);
  return true;
end $$;

revoke all on function public.portalis_synchroniser(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint),
  public.portalis_crediter_periode(uuid,text,text,text,timestamptz,timestamptz),
  public.portalis_crediter_recharge(uuid,text,text,integer),public.portalis_echouer(uuid,uuid),
  public.portalis_etat(uuid),public.portalis_reserver(uuid,uuid,text),
  public.portalis_terminer(uuid,uuid,text,integer,integer),public.portalis_preparer_document(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.portalis_synchroniser(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint),
  public.portalis_crediter_periode(uuid,text,text,text,timestamptz,timestamptz),
  public.portalis_crediter_recharge(uuid,text,text,integer),public.portalis_echouer(uuid,uuid),
  public.portalis_etat(uuid),public.portalis_reserver(uuid,uuid,text),
  public.portalis_terminer(uuid,uuid,text,integer,integer),public.portalis_preparer_document(uuid,uuid,text)
  to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portalis-documents','portalis-documents',false,20971520,array['application/pdf'])
on conflict(id) do nothing;

-- Les textes importés expirent en une heure, les réponses en vingt-quatre heures.
select cron.schedule('portalis-effacer-textes', '17 * * * *', $$
  update public.portalis_documents set texte=null where texte is not null and cree_le<now()-interval '1 hour';
  update public.portalis_demandes set reponse=null where reponse is not null and termine_le<now()-interval '24 hours';
$$);
