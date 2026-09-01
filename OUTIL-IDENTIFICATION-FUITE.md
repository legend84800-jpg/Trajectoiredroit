# Identifier l'origine d'un PDF diffusé

Cet outil local analyse un PDF suspect, retrouve ses marqueurs et les compare à
l'historique des achats. Il vérifie ensuite la session Stripe avant d'afficher
le titulaire de la licence.

## Utilisation simple sur le Mac

1. Ouvre `scripts/identifier-fuite-pdf.command`.
2. Choisis le PDF suspect dans la fenêtre qui s'affiche.
3. Lis le résultat dans le Terminal.

Tu peux aussi déposer directement un PDF sur le fichier `.command` depuis le
Finder.

## Utilisation depuis le Terminal

```bash
./scripts/identifier-fuite-pdf.command "/chemin/vers/le-pdf-suspect.pdf"
```

Pour conserver un rapport JSON, qui contient des données personnelles, précise
un emplacement privé.

```bash
./scripts/identifier-fuite-pdf.command \
  "/chemin/vers/le-pdf-suspect.pdf" \
  --rapport "/chemin/prive/rapport-fuite.json"
```

Le PDF reste sur le Mac. Seuls l'identifiant de la commande retrouvée et les
requêtes nécessaires à sa vérification sont envoyés à Supabase et à Stripe.
Les clés restent dans les variables d'environnement locales et ne sont jamais
écrites dans le rapport. La clé réservée à cet outil est stockée dans le fichier
local ignoré par Git et dans une variable Vercel sensible.

## Couverture du catalogue

Tous les PDF du catalogue passent automatiquement par la personnalisation. La
couverture actuelle comprend 180 produits, 690 livraisons PDF et 283 fichiers
distincts. Une nouvelle création PDF ajoutée à `api/_produits.js` est protégée
sans modification supplémentaire de son générateur.

Les fichiers Anki `.apkg` restent inchangés. Le stage en direct ne livre aucun
PDF. Les anciens liens reçus avant la généralisation continuent de fonctionner
pendant leur durée initiale. Les copies déjà générées pendant le pilote Droit
pénal restent identifiables.

## Expérience acheteur

La protection n'ajoute aucun champ et aucune question dans Stripe Checkout.
Le nom de licence vient des informations normales de paiement. Si Stripe ne
fournit pas de nom, le système utilise une forme lisible dérivée de l'adresse
email.

Au premier téléchargement, le serveur génère la copie, la place sur R2 sous
une adresse non devinable, puis lance le téléchargement. La copie est réutilisée
aux téléchargements suivants. Une republication du PDF source invalide
automatiquement cette copie et provoque une nouvelle génération.

## Résistance et vérifications

Chaque PDF contient une licence visible discrète dans la marge droite, un email
partiellement masqué, des métadonnées, un texte invisible et des micro-marqueurs
visuels redondants. L'outil peut retrouver l'achat après suppression des
métadonnées, retrait de la licence visible ou aplatissement du PDF, tant que
suffisamment de micro-marqueurs sont encore présents.

L'attribution finale exige toujours une commande Supabase cohérente, une session
Stripe payée, le bon produit et la même adresse email. Une correspondance locale
seule ne suffit jamais à désigner un acheteur.
