-- Schéma Supabase pour l'abonnement Portalis (6€/mois) et l'historique d'achats
-- de trajectoiredroit.com. À coller une fois dans l'éditeur SQL du projet
-- Supabase TJD (SQL Editor > New query), après création du projet.
--
-- Écriture réservée à la clé service_role (webhook Stripe, api/generer.js),
-- qui bypass les policies RLS ci-dessous. Le front (clé anon) ne fait que lire,
-- chacun ses propres lignes.

create table abonnements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  statut text not null default 'annule' check (statut in ('actif', 'annule', 'impaye')),
  periode_fin timestamptz,
  cree_le timestamptz not null default now()
);

create table achats (
  id bigint generated always as identity primary key,
  email text not null,
  produit_ids text[] not null default '{}',
  session_id text unique,
  montant numeric,
  cree_le timestamptz not null default now()
);
create index achats_email_idx on achats (email);

create table usage_portalis (
  user_id uuid not null references auth.users(id) on delete cascade,
  mois text not null,
  compteur integer not null default 0,
  primary key (user_id, mois)
);

alter table abonnements enable row level security;
alter table achats enable row level security;
alter table usage_portalis enable row level security;

create policy "Lecture de son propre abonnement" on abonnements
  for select using (auth.uid() = user_id);

create policy "Lecture de ses propres achats par email" on achats
  for select using (auth.jwt() ->> 'email' = email);

create policy "Lecture de son propre usage Portalis" on usage_portalis
  for select using (auth.uid() = user_id);
