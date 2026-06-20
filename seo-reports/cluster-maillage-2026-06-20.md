# SEO en cluster par matière, finalisation, 2026-06-20

Chantier n°4 de l'audit marketing du 20 juin. Objectif, donner à chaque matière un vrai cluster de liens internes par domaine, au lieu du seul maillage générique vers les 5 pages cornerstone.

## Constat avant travaux

Le maillage cornerstone existait déjà (footer « Matières » qui renvoie partout vers intro, constit, contrats, DA, procédure pénale). Le vrai cluster topique par domaine, lui, manquait presque partout. Seule la page droit administratif L2 avait un cluster complet, avec ses 4 arrêts expliqués (Blanco, Nicolo, Dame Lamotte, Benjamin) liés dans les deux sens. Les autres pages matière avaient 2 à 6 liens, surtout vers les cornerstones, et trois pages (histoire du droit, histoire des institutions, relations internationales) n'avaient aucun lien méthode.

## Ce qui a été fait

Un bloc « Les autres matières à réviser avec [matière] » posé avant `</main>` sur les 18 pages matière. Chaque bloc relie la page à ses vraies sœurs de domaine, avec des ancres descriptives, plus le lien méthode pertinent et l'arrêt expliqué quand il existe. Cinq domaines servent de regroupement.

- **Droit civil L1-L2** : introduction au droit, personnes, famille, obligations, contrats, biens.
- **Droit public** : constitutionnel, administratif, relations internationales, histoire des institutions.
- **Droit pénal** : pénal général L1, pénal L2, procédure pénale L3.
- **Droit des affaires L3** : commercial, sociétés, travail, contrats spéciaux.
- **Histoire** : histoire du droit, histoire des institutions, en lien avec le constitutionnel.

Réciprocité de l'arrêt sur la cause du contrat (`la-cause-en-droit.html`), qui pointe maintenant vers droit des contrats L2 et droit des obligations L2, plus la méthode du commentaire d'arrêt. Les 4 arrêts de droit administratif pointaient déjà vers leur pilier.

Liens méthode comblés sur les pages histoire du droit, histoire des institutions et relations internationales, qui n'en avaient pas (méthode de la dissertation juridique).

## Résultat mesuré

Chaque page matière a maintenant 5 à 8 liens vers d'autres matières du même domaine, contre 2 à 6 avant, avec un plancher remonté. Toutes les pages ont au moins un lien méthode. Intégrité HTML vérifiée, équilibre des balises `<section>` correct sur les 19 pages touchées, un seul bloc cluster par page (insertion idempotente, marqueur `<!-- cluster-domaine -->`).

## Outil

`livrables/automatisation/cluster_maillage_site.py`, réutilisable. La carte des clusters (titres, phrases, ancres) y est éditable. Le script vérifie l'existence de chaque page cible avant d'insérer le lien et ne pose jamais deux fois le bloc.

## Ce qui n'a pas été fait, volontairement

Création en masse de pages-satellites d'arrêts par matière. Le skill l'interdit pour un site jeune, Google sanctionne la publication de dix pages d'un coup. Ces pages se créent au rythme d'une par jour par la routine blog (cron). Le cluster s'enrichira donc tout seul, chaque nouvel arrêt expliqué se rattachant à son pilier.

Réécriture du fond des pages matière. C'est le chantier séparé d'enrichissement des compilations, et la profondeur du contenu se compare à la concurrence dans ce cadre, pas ici.

## Points mineurs laissés en l'état

Cinq meta descriptions dépassent 160 caractères et seront tronquées dans les résultats Google, à savoir droit pénal général L1 (199), droit des personnes L1 (188), droit des obligations L2 (186), droit commercial L3 (184), droit du travail L3 (182). Le title de droit pénal L2 est court (47 caractères). Aucun n'est bloquant. À retravailler lors d'une passe title et meta dédiée.

## Suivi

Relancer un audit Search Console dans trois semaines pour mesurer l'effet du maillage sur les positions et les pages explorées.
