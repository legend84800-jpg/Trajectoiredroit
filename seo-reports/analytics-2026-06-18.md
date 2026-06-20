# RAPPORT PERFORMANCE — TRAJECTOIRE DROIT — 2026-06-18

**Mode : Données réelles (Mode A).** La clé de compte de service Search Console est en place (`livrables/inbox/tjd-analytics-seo-key.json`), donc ce rapport sort enfin avec les vrais clics, les vraies impressions et les vraies positions Google. C'est un grand pas par rapport au rapport du 15/06 qui tournait à l'aveugle en Mode B.

**Période :** 28 derniers jours pour Search Console et Analytics, ce qui couvre en pratique toute la vie des pages publiées le 09/06. Comparaison avec le rapport du 15/06/2026.

**Note d'emplacement :** la routine pointait vers un dossier `livrables/sites-web/...` qui n'existe pas sur cette machine. J'ai gardé le rapport dans `livrables/contenus-tjd/Vrai-site-Web-Julienpro/seo-reports/`, là où vivent déjà les rapports précédents et les fichiers du site, pour ne pas couper la suite des rapports en deux.

---

## CHIFFRES CLÉS

Search Console (Google), 28 jours : 9 clics, 189 impressions, CTR 4,8 %, position moyenne 8,1.

Analytics (toutes sources), 28 jours : 6 visiteurs uniques, 11 sessions, 25 pages vues. Canaux d'acquisition : 10 sessions en accès direct, 2 non attribuées, et zéro session rangée en organique côté GA4. Le décalage avec les 9 clics vus par Search Console est normal, les deux outils ne comptent pas pareil et leurs fenêtres d'attribution diffèrent. La leçon reste la même, presque tout le trafic actuel arrive en tapant l'adresse à la main, pas encore par Google.

Le point le plus important du rapport. Les 6 pages cibles sont indexées et remontent vraiment dans Google. Chacune a des impressions réelles, donc chacune apparaît bien dans les résultats. Le Mode B annonçait « 0 page indexée » le 15/06, c'était faux, et on en a maintenant la preuve directe.

---

## CE QUI MARCHE

Top 3 pages :
1. `droit-administratif-l2.html`, 8 clics et 118 impressions, position moyenne 8,3. C'est la locomotive du site, elle ramène à elle seule presque tout le trafic Google. Elle est tout près d'entrer dans le top 5.
2. `droit-des-societes-l3.html`, 1 clic et 31 impressions, position 7,0. Deuxième page la plus vue dans les résultats, déjà en première page.
3. `procedure-penale-l3.html`, 0 clic mais position moyenne 4,0, la meilleure de tout le site. Elle est très bien placée, il lui manque seulement du volume de recherche sur ses requêtes.

Top 3 requêtes qui amènent des impressions :
1. « fiche droit administratif l2 », position 8, 3 impressions.
2. « droit des sociétés l3 », position 6,5, 2 impressions.
3. « droit des contrats l2 », position 8, 2 impressions.

Aucune requête n'a encore généré de clic mesuré, normal pour des pages de neuf jours posées en bas de la première page ou en deuxième page. Le signal positif, c'est que le site se montre déjà sur ses mots-clés exacts.

---

## CE QUI PEUT MIEUX FAIRE

3 pages avec du potentiel inexploité :

1. `droit-administratif-l2.html`. Elle se positionne très bien sur la longue traîne (« fiche droit administratif l2 » en position 8) mais elle reste en position 15,5 sur le terme principal « droit administratif l2 ». C'est là qu'est le gros volume. Action, renforcer le ciblage de la requête tête dans le title, le H1 et le premier paragraphe.

2. `formations.html`, la page pilier, ne récolte que 5 impressions et reste en position 8,8. Elle devrait tirer tout le site. Action, enrichir son contenu et son maillage pour qu'elle se positionne sur des termes larges comme « cours de droit en ligne » et « fiches de droit PDF ».

3. `droit-constitutionnel-l1.html`, 11 impressions, position 8,4, mais toujours zéro clic. Son image de partage social est cassée depuis le rapport du 15/06 et n'a pas été corrigée. Le fichier pointe encore vers `assets/cours-contrats-hero.jpg`, l'image d'une autre matière. Action, faire pointer la page vers une image de droit constitutionnel.

Requêtes en position 5 à 15 à pousser en priorité (les vrais quick wins) :
1. « droit administratif l2 », position 15,5, sur `droit-administratif-l2.html`. Action, viser ce terme exact dans le title et un bloc de contenu dédié pour passer de la page 2 à la page 1.
2. « cours droit administratif l2 », position 10, même page. Action, ajouter une section « le cours » clairement titrée.
3. « fiche de révision droit administratif l2 », position 12, même page. Action, nommer explicitement une fiche de révision dans le contenu.

Tout converge vers une seule page, ce qui rend l'action prioritaire évidente.

---

## ACTION PRIORITAIRE DE LA SEMAINE

Renforcer `droit-administratif-l2.html` pour la faire passer de la position 8 au top 5. C'est la page qui a déjà prouvé qu'elle ramène du trafic, donc chaque position gagnée rapporte beaucoup plus que sur n'importe quelle autre page. Elle a 118 impressions, le moindre gain de rang se transforme directement en clics.

Fichier à modifier : `livrables/contenus-tjd/Vrai-site-Web-Julienpro/droit-administratif-l2.html`.

Trois retouches précises sur cette page :
1. Garder le mot-clé principal exact « droit administratif L2 » en tout début de title et de H1, ce qui est déjà le cas, et l'ancrer aussi dans la première phrase visible.
2. Ajouter un court bloc de contenu qui titre noir sur blanc « cours de droit administratif L2 » et « fiches de révision droit administratif L2 », pour capter les trois requêtes longues déjà en position 8 à 12.
3. Renforcer un ou deux liens internes depuis `formations.html` et depuis les autres pages matières vers cette page, pour lui passer de l'autorité.

À faire en parallèle, vite et sans effort, corriger l'image de partage de `droit-constitutionnel-l1.html`. Remplacer la ligne `<meta property="og:image" content="https://trajectoiredroit.com/assets/cours-contrats-hero.jpg">` par une image de droit constitutionnel. Ce point traîne depuis le rapport du 15/06.
