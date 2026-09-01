# Audit SEO et GEO du 31 août 2026

## Sources examinées

- Présentation d'audit de Ligia Loterio datée du 21 août 2026
- Tableau de bord Looker Studio, données GSC sur 90 jours et GA4 sur 28 jours
- Crawl et inspection du dépôt Trajectoire Droit
- Vérification directe de l'indexation dans Google le 31 août 2026

## Constats de l'audit externe

La présentation soulève trois points. Trois pages de matières auraient été absentes de l'index, les articles gagneraient à être déplacés sous `/blog/`, et les liens du logo devraient pointer vers `/` plutôt que vers `/index.html`.

## Décisions et corrections

### Pages de matières

Les pages `droit-commercial-l3.html`, `droit-des-biens-l2.html` et `droit-penal-l2.html` sont désormais présentes dans les résultats de Google. Elles figurent aussi dans le sitemap et reçoivent déjà des liens depuis `formations.html` et la navigation principale. Aucune demande de réindexation n'est nécessaire au 31 août 2026.

### Accueil canonique

Tous les liens internes exacts vers `index.html` ont été remplacés par `/` dans les pages HTML situées à la racine du site. Les fragments partagés du header et du footer ont reçu la même correction. Le moteur de recherche interne et l'attribution de la page d'entrée utilisent également `/`. Une redirection permanente de `/index.html` vers `/` complète la consolidation.

### Architecture du blog

Le déplacement massif des articles vers `/blog/` n'est pas retenu. Les articles possèdent déjà une URL stable, une page hub `blog.html`, un fil d'Ariane, des données structurées `Article` et `BreadcrumbList`, ainsi que des liens internes cohérents. Une migration modifierait de nombreuses URL indexées sans bénéfice mesuré et créerait une période de volatilité inutile.

## Lecture du tableau de bord

- Les sessions organiques sont passées de 39 en juin à 86 en juillet puis 183 en août.
- La recherche organique a généré 4 conversions en août.
- Les requêtes les plus visibles concernent notamment le droit administratif L2, le droit des obligations L2 et le droit des sociétés L3.
- Le trafic issu des moteurs d'IA est passé de 3 sessions en juillet à 8 en août, principalement via ChatGPT, sans conversion observée.
- Les articles de blog génèrent encore peu de sessions dans cette fenêtre de mesure.

## Priorité GEO retenue

Les pages de cours et plusieurs contenus éditoriaux disposent déjà de réponses directes, de FAQ explicites, de données structurées et d'un fichier `llms.txt`. Une nouvelle réécriture générale de ces blocs n'est donc pas prioritaire. Le prochain gain GEO doit surtout venir de l'autorité externe, des citations de marque et de contenus originaux susceptibles d'être repris par des sources tierces.

## Vérifications locales

- Aucun lien interne exact vers `index.html` ne subsiste dans les fichiers HTML.
- `vercel.json` est un document JSON valide.
- Le contrôle de santé valide 301 fichiers produits et 317 liens internes, sans erreur.
- Le diff HTML ne modifie que les destinations de liens vers l'accueil.

Après déploiement, il reste à confirmer la redirection publique de `/index.html` vers `/` et le chargement public de l'accueil ainsi que des trois pages de matières.
