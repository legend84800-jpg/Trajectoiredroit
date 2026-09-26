-- À exécuter une fois dans le projet Supabase Trajectoire Droit.
-- Réponses facultatives données uniquement après une session Stripe payée.
-- L'identifiant de session est haché, aucun email n'est stocké ici.

create table if not exists public.motivations_achats (
  session_hash text primary key check (session_hash ~ '^[a-f0-9]{64}$'),
  mode text not null check (mode in ('live', 'test')),
  produit_ids text[] not null default '{}',
  declencheur text not null check (declencheur in ('td', 'note', 'partiel', 'nouvelle_matiere', 'autre')),
  declencheur_autre text check (char_length(declencheur_autre) <= 160),
  resultat text not null check (resultat in ('comprendre', 'exercice', 'partiel', 'temps', 'autre')),
  resultat_precision text check (char_length(resultat_precision) <= 160),
  cree_le timestamptz not null default now()
);

create index if not exists motivations_achats_cree_le_idx
  on public.motivations_achats (cree_le);

alter table public.motivations_achats enable row level security;
revoke all on public.motivations_achats from anon, authenticated;

-- Purge quotidienne. Le rapport de l'interface SQL permet de surveiller les exécutions.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'purge-motivations-achats-tjd',
  '15 3 * * *',
  $$delete from public.motivations_achats where cree_le < now() - interval '12 months'$$
);
