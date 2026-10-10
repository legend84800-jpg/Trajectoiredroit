-- Avis des acheteurs recueillis sur le site (donner-mon-avis.html, api/avis.js).
-- Appliqué le 2026-10-10 par la migration Supabase « creation_table_avis ».
-- Un avis par session Stripe payée. La fiche de citations offerte en
-- remerciement est notée dans fiche_offerte_id, quelle que soit la note.
-- Lecture et écriture uniquement par la clé service, depuis api/avis.js.

create table if not exists public.avis (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  session_stripe text not null unique check (session_stripe ~ '^cs_(live|test)_[A-Za-z0-9]+$'),
  produit_id text not null check (char_length(produit_id) <= 80),
  matiere text check (char_length(matiere) <= 80),
  prenom text not null check (char_length(prenom) between 1 and 40),
  niveau text not null check (niveau in ('L1', 'L2', 'L3')),
  note smallint not null check (note between 1 and 5),
  texte text not null check (char_length(texte) between 20 and 1200),
  statut text not null default 'publie' check (statut in ('publie', 'masque')),
  fiche_offerte_id text check (fiche_offerte_id ~ '^citations-[a-z0-9-]+$'),
  mode text not null check (mode in ('live', 'test'))
);

create index if not exists avis_produit_idx on public.avis (produit_id) where statut = 'publie';
create index if not exists avis_matiere_idx on public.avis (matiere) where statut = 'publie';

alter table public.avis enable row level security;
revoke all on public.avis from anon, authenticated;
