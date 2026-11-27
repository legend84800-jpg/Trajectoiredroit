alter table public.enquete_supports
  add column version_questionnaire smallint not null default 1 check (version_questionnaire in (1, 2)),
  add column partie_utilisee text check (partie_utilisee in ('regles', 'explications', 'exemples', 'references', 'plan', 'autre', 'aucune')),
  add column clarte text check (clarte in ('premiere_lecture', 'relecture', 'difficile', 'pas_assez')),
  add column frein text check (frein in ('plus_tard', 'temps', 'acces', 'debut', 'programme', 'autre_ressource', 'autre')),
  add column hesitation text check (hesitation in ('programme', 'format', 'prix', 'autre_ressource', 'usage', 'autre', 'aucune', 'pas_achete')),
  add constraint enquete_supports_parcours_check check (
    (version_questionnaire = 1 and partie_utilisee is null and clarte is null and frein is null and hesitation is null)
    or (version_questionnaire = 2 and (
      (usage = 'pas_encore' and frein is not null and partie_utilisee is null and clarte is null and priorite = 'pas_assez')
      or (usage <> 'pas_encore' and frein is null and partie_utilisee is not null and clarte is not null)
    ))
  );
