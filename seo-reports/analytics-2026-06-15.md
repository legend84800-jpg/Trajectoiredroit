# RAPPORT PERFORMANCE — TRAJECTOIRE DROIT — 2026-06-15

**Mode : Analyse externe (Mode B).** Aucune clé Search Console ou Analytics dans le `.env`, donc pas de données réelles de clics ou de positions. Les chiffres ci-dessous viennent d'un moteur de recherche externe qui indexe mal les sites français récents. À lire comme une tendance, jamais comme un verdict.

**Période :** premier rapport de suivi. La base de comparaison est l'audit du 09/06/2026, jour de création des 5 pages de contenu. On est donc à 6 jours après la publication.

---

## CHIFFRES CLÉS

Le nombre de pages indexées reste indisponible de façon fiable. Le moteur externe ne remonte pas du tout le domaine trajectoiredroit.com, comme déjà constaté le 10/06. Ce n'est pas la preuve que les pages ne sont pas indexées, c'est la limite connue du Mode B. La vérité se lit dans Search Console, onglet Inspection de l'URL.

La présence sur les requêtes cibles testées est de 0 sur 3. Sur "droit constitutionnel L1", "procédure pénale L3 étapes du procès" et "différence SARL SAS SA", le site n'apparaît pas dans les premiers résultats. Ce sont les concurrents installés qui occupent tout, comme fiches-droit.com, jurislogic.fr, cours-de-droit.net, aideauxtd.com et pamplemousse-magazine. C'est un résultat attendu à 6 jours, une page neuve met 4 à 12 semaines à se positionner.

---

## CE QUI MARCHE

Les 5 pages sont en ligne et bien construites. J'ai vérifié chacune en direct.

Top 3 vérifications positives :
1. `droit-constitutionnel-l1.html` en ligne. Title propre avec le mot-clé et l'année ("Droit constitutionnel L1 : cours, fiches et notions clés (2026)"), H1 unique avec le mot-clé, meta description présente et claire. Rien à corriger sur la structure.
2. `formations.html` (la page pilier) en ligne. Title qui vise le mot-clé large ("Cours de droit en ligne : fiches L1, L2, L3 (2026)"). Le maillage interne vers les 5 guides de matière est bien en place, Google a donc un chemin pour découvrir les pages.
3. `droit-des-societes-l3.html` et `procedure-penale-l3.html` en ligne. Ce sont les deux requêtes les moins défendues du lot, donc celles qui rankeront le plus vite. La procédure pénale L3 reste la meilleure cible pour atteindre une bonne position en premier.

---

## CE QUI PEUT MIEUX FAIRE

3 points avec du potentiel inexploité :

1. L'image de partage social est mal réglée sur la page de droit constitutionnel. Le fichier `droit-constitutionnel-l1.html` pointe vers `assets/cours-contrats-hero.jpg`, l'image d'une autre matière (les contrats). Quand quelqu'un partage cette page sur WhatsApp ou LinkedIn, il voit une image qui ne correspond pas au sujet, ce qui baisse le taux de clic. Il faut faire pointer chaque page vers une image cohérente avec sa matière, ou créer une vraie image de marque 1200×630 par page.

2. Le rapport tourne à l'aveugle sur les positions réelles. Le Mode B ne voit pas où le site se classe vraiment sur Google France. Tant que l'API Search Console n'est pas branchée, on ne peut pas repérer les requêtes où le site est déjà en position 10 à 20 avec des impressions, ce qu'on appelle les quick wins. C'est le plus gros gisement de trafic rapide et il reste invisible. La solution est l'action prioritaire ci-dessous.

3. Il est trop tôt pour juger l'effet des pages. À 6 jours, rien ne permet encore de dire quelles pages prennent et lesquelles stagnent. Mieux vaut ne pas pondre de nouvelle page dans la précipitation, garder le rythme d'une page par jour maximum et laisser Google indexer le premier lot.

---

## ACTION PRIORITAIRE DE LA SEMAINE

Brancher l'API Google Search Console pour que le prochain rapport sorte en Mode A, avec les vraies positions et les vrais clics.

C'est le seul levier qui débloque toute l'intelligence du suivi. Sans lui, chaque rapport restera aveugle sur l'essentiel. Les étapes, à faire une seule fois :
1. Dans Google Cloud Console, créer un compte de service, activer la Google Search Console API, télécharger la clé JSON.
2. Dans Search Console (Paramètres, puis Utilisateurs et autorisations), ajouter l'email du compte de service (`xxx@xxx.iam.gserviceaccount.com`) comme utilisateur.
3. Déposer le fichier JSON dans `livrables/inbox/`. Le script `visites_search_console.py` du skill le détecte tout seul.

En attendant, action concrète et immédiate sur un fichier : corriger l'image de partage de `livrables/contenus-tjd/Vrai-site-Web-Julienpro/droit-constitutionnel-l1.html`. Remplacer la ligne

`<meta property="og:image" content="https://trajectoiredroit.com/assets/cours-contrats-hero.jpg">`

par une image qui parle bien du droit constitutionnel (image dédiée à venir, ou une image constit déjà présente dans `assets/`), pour que les partages de cette page affichent le bon visuel.
