alter table public.enquete_supports
  add column notification_a_partir_de timestamptz,
  add column notification_envoyee_le timestamptz;

-- Le défaut concerne les nouvelles réponses. Les anciennes lignes restent hors de la file.
alter table public.enquete_supports
  alter column notification_a_partir_de set default now();

grant update (notification_a_partir_de, notification_envoyee_le)
  on table public.enquete_supports to service_role;

create index enquete_supports_notification_a_faire
  on public.enquete_supports (notification_a_partir_de)
  where notification_envoyee_le is null and notification_a_partir_de is not null;
