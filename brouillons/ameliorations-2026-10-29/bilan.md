# Améliorations de Trajectoire Droit du 29 octobre 2026

Les améliorations validées sont publiées sur le site. Après examen des aperçus, Julien a retenu P11 et P14. Il a écarté P12.

| Proposition | Application retenue | État |
|---|---|---|
| P1 | Preuves chiffrées reprises, avec 3 500+ utilisateurs et +3 pts de moyenne conservés sur instruction de Julien | Ensemble final |
| P3 | Méthodes, FAQ et données structurées synchronisées, avec les sept temps de l’introduction de dissertation | Ensemble final |
| P4 | Anciennes offres « bientôt » de la bibliothèque remplacées par les recueils disponibles, avec les 98 fiches gratuites conservées | Ensemble final |
| P5 | Recherche fondée sur les pages du site, avec plusieurs mots dans un ordre différent, dont KPMG et L2 contrats | Ensemble final |
| P7 | Bouton d’extrait de l’accueil nommé « majeure préparée », comme le document montré | Ensemble final |
| P8 | Bandeau mobile lisible en entier et barres fixes coordonnées | Ensemble final |
| P9 | Carte de réservation retirée de l’accueil, cours particuliers toujours accessibles dans le menu et leur page | Ensemble final |
| P10 | Confirmation du guide conservée quand l’inscription réussit, même si la mesure échoue ou si le stockage est refusé | Ensemble final |
| P11 | Accueil raccourci avec les formules remontées et les répétitions retirées | Publié après validation |
| P12 | Paragraphe de présentation proposé sous le titre actuel | Écarté par Julien |
| P13 | Comparateur organisé autour de six besoins, avec les prix du catalogue | Ensemble final |
| P14 | Filtres avant les packs, recherche combinée, niveau conservé entre fiches et cours, compteur et réinitialisation | Publié après validation |
| P15 | Quatre aperçus et sommaires des fiches et cours de finances publiques et de philosophie du droit | Ensemble final |
| P16 | Sommaires dans les quatre méthodes, avec les développements et les exemples conservés | Ensemble final |
| P17 | Inventaire des ressources gratuites corrigé et guides existants reliés | Ensemble final |
| P18 | Commentaire de texte ajouté au choix des méthodes, note de synthèse présentée selon le contenu disponible | Ensemble final |
| P20 | Aperçus, recherche et panier utilisables au clavier, avec fermeture par Échap et retour du focus | Ensemble final |
| P21 | Attente de paiement expliquée après 30 secondes, possibilité de réessayer, référence conservée dix minutes et délais Stripe côté serveur | Correction Stripe publiée, suite dans l’ensemble final |
| P24 | Narcy, Manoukian, exercices d’introduction au droit L1 et cas pratique de sociétés améliorés dans l’autre chat | Publié séparément |
| P25 | Comparateurs et présentations des packs contrôlés rapprochés du catalogue de livraison | Ensemble final |
| P26 | Pénal général L1 S2 ajouté au pack L1, sociétés S2 ajouté aux packs L3 et Licence | Ensemble final |
| P28 | Page de licence à distance orientée vers les supports autonomes et les méthodes | Ensemble final |
| P29 | Recherche et filtres des achats dans Mon compte, y compris les groupes des Packs Ultra | Ensemble final |
| P30 | Recherche séparée du fichier principal et index chargé seulement pour la recherche | Ensemble final |

Les prix des packs restent identiques. De plus, aucun ancien fichier inclus n’est retiré. Les achats antérieurs conservent leurs identifiants de produits, donc les ajouts enrichissent les mêmes packs dans Mon compte.

P25 couvre les comparateurs et les présentations des packs contrôlés. La centralisation de toute information commerciale dans chaque page reste plus large que ce périmètre. Les prix et les fichiers livrés gardent leur source dans [le catalogue des produits](../../api/_produits.js), tandis que [les présentations communes](../../scripts/catalogue-presentations.js) et [leur synchronisation](../../scripts/synchroniser-presentations-catalogue.js) reprennent les blocs concernés.

## Vérifications et publications

À ce stade, 444 tests réussissent. Le contrôle de santé examine également 323 produits et 469 liens. Les contrôles de recherche et de Mon compte couvrent notamment les filtres et les changements de session. Les résultats de vente après publication restent à mesurer.

Le fichier principal passe de 53 505 à 52 055 octets. Sa version compressée gzip passe de 15 615 à 15 511 octets. De plus, l’index rassemble 350 pages et représente environ 80 ko, chargés seulement pour la recherche. Ces chiffres décrivent les fichiers. Le temps de chargement réel reste donc à mesurer.

La correction Stripe est publiée dans le commit `72240cba`. P24 est également publié dans le commit `5131e20f`, depuis le chat `01a1895a`. L’ensemble final est publié dans les commits `b2b694c3` et `88ff7a1c`. Le déploiement Vercel est prêt et le domaine public affiche donc les nouvelles compositions des packs. L’ouverture de Stripe a été vérifiée depuis cette version, sans finaliser de commande.

Le dossier `build/site-public` contient les fichiers servis aux visiteurs. Les sources des fonctions du serveur restent dans leur dossier séparé.

P11 est publié dans le commit `ee7f3ca1`. P14 est appliqué avec `14b05f46`, puis les liens d’arrivée au catalogue sont ajustés dans `6b5fcc5c`.

## Corrections de rédaction

Le bouton « Voir un extrait de mes fiches » devient « Voir un extrait de majeure préparée ». Le libellé désigne ainsi le format du document montré.

Le titre « Le support dépend du travail que tu dois faire » devient « Les formats que tu peux utiliser à distance ». Il nomme les supports présentés dans les cartes qui suivent.

Le catalogue est désormais placé plus haut, donc le renvoi « juste en dessous » a été remplacé par un lien vers les fiches à l’unité.

## Versions à consulter

- [P11, accueil raccourci](index-p11.html)
- [P12, proposition écartée](index-p12.html)
- [Mon compte avec des achats fictifs](compte-exemple.html)
- [P14, catalogue des fiches publié](../../formations.html#a-l-unite) et [catalogue des cours publié](../../cours-fiches.html#grille-cours-fiches)
- [Schéma du déplacement P14](../catalogue-2026-10-29/p14-explication.html), puis [filtres des fiches avant les packs](../catalogue-2026-10-29/fiches-filtres-en-haut.html) et [filtres harmonisés des cours](../catalogue-2026-10-29/cours-filtres-harmonises.html)
- [Vue commune des aperçus](index.html)
