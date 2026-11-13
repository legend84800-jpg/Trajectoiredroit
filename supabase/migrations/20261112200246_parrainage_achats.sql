create table public.parrains (
  email text primary key check (email = lower(btrim(email))),
  code text not null unique check (code ~ '^PARRAIN[A-Z0-9]{3,32}$'),
  promotion_id text unique,
  cree_le timestamptz not null default now()
);

create table public.bons_parrainage (
  session_id text primary key,
  payment_intent_id text not null unique,
  code_parrain text not null references public.parrains (code),
  code_bon text not null unique check (code_bon ~ '^BON[A-F0-9]{20}$'),
  promotion_id text unique,
  annule boolean not null default false,
  cree_le timestamptz not null default now()
);

create index bons_parrainage_code_parrain on public.bons_parrainage (code_parrain);

alter table public.parrains enable row level security;
alter table public.bons_parrainage enable row level security;
revoke all on public.parrains, public.bons_parrainage from anon, authenticated;
grant select, insert, update on public.parrains, public.bons_parrainage to service_role;
