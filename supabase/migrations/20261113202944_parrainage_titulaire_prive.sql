do $migration$
begin
  if exists (select 1 from public.parrains) then
    raise exception 'La table des parrains doit être vide avant le changement de clé';
  end if;
  alter table public.parrains drop constraint parrains_email_check;
  alter table public.parrains rename column email to titulaire;
  alter table public.parrains add constraint parrains_titulaire_check check (titulaire ~ '^[a-f0-9]{64}$');
end
$migration$;
