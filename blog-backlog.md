# Backlog du blog Trajectoire Droit

La routine `redacteur-blog-tjd` prend le **premier sujet non coché** à chaque passage (du lundi au vendredi).
Quand le backlog est vide, elle pioche seule dans Search Console les requêtes où le site est en position 5 à 15.

**Format d'une ligne :**
```
- [ ] type:actu|arret|notion|comment-reviser | matiere:Matière Niveau | sujet:le sujet précis
```
- `type` : `actu` (actualité juridique), `arret` (grand arrêt), `notion` (notion clé), `comment-reviser` (page pilier « Comment réviser [matière] ? », rare, pas deux fois d'affilée). Pas de méthode (cas pratique, commentaire, dissertation), c'est déjà couvert ailleurs.
- Coche `- [x]` quand l'article ou la page est publiée (la routine le fait elle-même).
- Priorité quand plusieurs sujets se valent : actualité d'abord, grands arrêts ensuite, notions en dernier.

Tu peux ajouter, retirer ou réordonner les lignes quand tu veux, depuis ton Mac comme depuis le VPS.

---

- [x] type:arret | matiere:droit administratif L2 | sujet:l'arrêt Nicolo (CE 1989) et le contrôle de la loi face au traité par le juge administratif
- [x] type:arret | matiere:droit administratif L2 | sujet:l'arrêt Dame Lamotte (CE 1950) et le recours pour excès de pouvoir comme principe général du droit
- [x] type:arret | matiere:droit administratif L2 | sujet:l'arrêt Benjamin (CE, 19 mai 1933) et le contrôle du juge sur les mesures de police qui limitent une liberté
- [x] type:arret | matiere:droit administratif L2 | sujet:l'arrêt Bac d'Eloka (TC, 22 janvier 1921) et la naissance du service public industriel et commercial
- [x] type:arret | matiere:droit administratif L2 | sujet:l'arrêt Cadot (CE, 13 décembre 1889) et la fin de la théorie du ministre-juge
- [x] type:notion | matiere:droit administratif L2 | sujet:la notion de service public, ses critères et l'enjeu de la qualification
- [x] type:notion | matiere:droit administratif L2 | sujet:le recours pour excès de pouvoir, ses conditions et ses cas d'ouverture
- [x] type:notion | matiere:droit administratif L2 | sujet:la responsabilité de l'administration sans faute, du risque à la rupture d'égalité devant les charges publiques
- [x] type:arret | matiere:droit constitutionnel L1 | sujet:la décision Liberté d'association (CC, 16 juillet 1971) et la valeur constitutionnelle du préambule
- [x] type:arret | matiere:droit constitutionnel L1 | sujet:la décision IVG (CC, 15 janvier 1975) et le refus du Conseil de contrôler la loi face aux traités
- [x] type:notion | matiere:droit constitutionnel L1 | sujet:le bloc de constitutionnalité, ce que le Conseil constitutionnel protège vraiment (publié le 10/07/2026)
- [x] type:notion | matiere:droit constitutionnel L1 | sujet:la question prioritaire de constitutionnalité, à quoi elle sert et comment elle fonctionne (publié le 08/07/2026)
- [ ] type:notion | matiere:droit constitutionnel L1 | sujet:la séparation des pouvoirs, de Montesquieu à la Cinquième République
- [ ] type:arret | matiere:droit des contrats L2 | sujet:l'arrêt Chronopost (Cass. com., 22 octobre 1996) et la clause qui contredit l'obligation essentielle
- [ ] type:arret | matiere:droit des contrats L2 | sujet:l'arrêt Canal de Craponne (Cass. civ., 6 mars 1876) et le refus de l'imprévision
- [ ] type:arret | matiere:droit des contrats L2 | sujet:l'arrêt Baldus (Cass. civ. 1re, 3 mai 2000) et la réticence dolosive sur la valeur du bien
- [ ] type:notion | matiere:droit des contrats L2 | sujet:la cause du contrat, de l'article 1131 ancien à la réforme de 2016
- [ ] type:notion | matiere:droit des contrats L2 | sujet:les vices du consentement, l'erreur, le dol et la violence
- [ ] type:notion | matiere:droit des contrats L2 | sujet:la réforme du droit des contrats de 2016, ce qui a changé pour les étudiants
- [ ] type:notion | matiere:droit des sociétés L3 | sujet:l'affectio societatis, la volonté de s'associer et ses conséquences
- [ ] type:arret | matiere:droit des sociétés L3 | sujet:l'arrêt Fruehauf (CA Paris, 22 mai 1965) et l'intérêt social face à l'intérêt des associés
- [ ] type:notion | matiere:droit des sociétés L3 | sujet:la personnalité morale de la société, ce qu'elle change concrètement
- [ ] type:notion | matiere:procédure pénale L3 | sujet:la garde à vue, sa durée et les droits de la personne gardée à vue
- [ ] type:notion | matiere:procédure pénale L3 | sujet:la présomption d'innocence et sa portée dans le procès pénal
- [ ] type:notion | matiere:droit pénal général L1 | sujet:les trois éléments de l'infraction, légal, matériel et moral
- [ ] type:arret | matiere:droit pénal général L1 | sujet:l'arrêt Laboube (Cass. crim., 13 décembre 1956) et l'exigence de discernement
- [ ] type:notion | matiere:droit pénal général L1 | sujet:la tentative, du commencement d'exécution au désistement volontaire
- [ ] type:notion | matiere:droit pénal général L1 | sujet:le principe de légalité criminelle, pas d'infraction sans texte
- [ ] type:arret | matiere:droit civil L1 | sujet:l'arrêt Perruche (Cass. ass. plén., 17 novembre 2000) et le préjudice de l'enfant né handicapé
- [ ] type:notion | matiere:droit des personnes L1 | sujet:la personnalité juridique, son début à la naissance et sa fin à la mort
- [ ] type:notion | matiere:droit de la famille L1 | sujet:l'autorité parentale, ses titulaires et son exercice
- [x] type:comment-reviser | matiere:droit administratif L2 | sujet:comment réviser le droit administratif L2 (publié le 30/06/2026)
- [x] type:comment-reviser | matiere:droit des obligations L2 | sujet:comment réviser le droit des obligations L2 (publié le 03/07/2026)
- [ ] type:comment-reviser | matiere:introduction au droit L1 | sujet:comment réviser l'introduction au droit L1
- [ ] type:comment-reviser | matiere:droit constitutionnel L1 | sujet:comment réviser le droit constitutionnel L1
- [ ] type:comment-reviser | matiere:droit pénal général L1 | sujet:comment réviser le droit pénal général L1

- [ ] type:notion | matiere:droit du travail | sujet:travailler le dimanche et le 15 août peuvent-ils être imposés à un salarié sans son accord, le cas d'une préparatrice en pharmacie (question lecteur Reddit du 2026-07-03, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-03.md)
- [ ] type:notion | matiere:droit des contrats | sujet:une clause de non-concurrence dans un bail professionnel est-elle valable, le cas d'une psychologue libérale (question lecteur Reddit du 2026-07-05, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-05.md)
- [ ] type:notion | matiere:droit du travail | sujet:le montant minimum légal d'une indemnité de rupture conventionnelle et le cas particulier de l'inaptitude professionnelle (question lecteur Reddit du 2026-07-06, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-06.md)
- [ ] type:notion | matiere:droit civil, bail d'habitation | sujet:que devient un bail social au décès du locataire, résiliation de plein droit et restitution du dépôt de garantie aux héritiers (question lecteur Reddit du 2026-07-07, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-07.md)
- [ ] type:notion | matiere:droit du travail | sujet:qui paie la tenue de travail imposée par l'employeur, la distinction entre vêtement courant et tenue inhérente à l'emploi (question lecteur Reddit du 2026-07-08, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-08.md)
- [ ] type:notion | matiere:droit du travail | sujet:peut-on travailler en micro-entreprise pendant ses congés payés posés en préavis de démission, la clause d'exclusivité face à l'article L1121-1 (question lecteur Reddit du 2026-07-09, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-09.md)
- [ ] type:notion | matiere:droit de la consommation | sujet:voiture d'occasion en panne de climatisation dès l'achat chez un garage professionnel, garantie légale de conformité et garantie des vices cachés (question lecteur Reddit du 2026-07-10, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-10.md)
- [ ] type:notion | matiere:droit de la consommation | sujet:refus de rétractation après une vente de pompe à chaleur signée à domicile, le délai de 14 jours et les exceptions invoquées à tort (question lecteur Reddit du 2026-07-11, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-11.md)
- [ ] type:notion | matiere:droit de la famille | sujet:un parent doit-il informer l'autre parent avant un séjour de vacances de l'enfant chez un tiers (grands-parents), l'obligation d'information de l'article 373-2 du Code civil et l'absence de délai légal chiffré (question lecteur Reddit du 2026-07-12, fondement déjà vérifié dans livrables/automatisation/presence-hors-site-tjd/reddit-drafts/2026-07-12.md)
