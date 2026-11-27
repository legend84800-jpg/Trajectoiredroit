create table public.enquete_supports (
  id uuid primary key,
  support text not null check (char_length(support) between 1 and 80),
  usage text not null check (usage in ('cours', 'td', 'partiel', 'autre', 'pas_encore')),
  aide text check (aide in ('oui', 'en_partie', 'non')),
  priorite text not null check (priorite in ('explication', 'exemple', 'programme', 'erreur', 'navigation', 'autre', 'aucune', 'pas_assez')),
  utile text check (char_length(utile) <= 600),
  remarque text check (char_length(remarque) <= 600),
  code text not null unique check (code ~ '^ENQUETE-[A-F0-9]{18}$'),
  cree_le timestamptz not null default now(),
  check ((usage = 'pas_encore' and aide is null and utile is null) or (usage <> 'pas_encore' and aide is not null))
);

alter table public.enquete_supports enable row level security;
revoke all on table public.enquete_supports from public, anon, authenticated;
grant select, insert on table public.enquete_supports to service_role;
