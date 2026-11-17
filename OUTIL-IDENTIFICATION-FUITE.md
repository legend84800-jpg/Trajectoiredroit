# Identifier l'origine d'un PDF diffusé

Cet outil local analyse un PDF ou une photo de page et compare ses marques à
l'historique des achats. Il vérifie ensuite la session Stripe avant d'afficher
le titulaire de la licence.

## Utilisation simple sur le Mac

1. Ouvre `scripts/identifier-fuite-pdf.command`.
2. Choisis le PDF ou une photo JPEG ou PNG dans la fenêtre.
3. Lis le résultat dans le Terminal.

Pour une photo, garde la page entière dans l’image. Un recadrage qui coupe une
partie de la page peut supprimer les marques dont l’outil a besoin.

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

Le fichier analysé reste sur le Mac. Seuls l'identifiant de la commande retrouvée et les
requêtes nécessaires à sa vérification sont envoyés à Supabase et à Stripe.
Les clés restent dans les variables d'environnement locales et ne sont jamais
écrites dans le rapport. La clé réservée à cet outil est stockée dans le fichier
local ignoré par Git et dans une variable Vercel sensible.

## Couverture du catalogue

Le serveur personnalise les PDF achetés. Les PDF sources sont stockés en privé.
Le catalogue contient 343 PDF distincts au 17 novembre 2026.

Les fichiers Anki `.apkg` restent inchangés. Le stage en direct ne livre aucun
PDF. Les anciens liens reçus avant la généralisation continuent de fonctionner
pendant leur durée initiale. Les copies déjà générées pendant le pilote Droit
pénal restent identifiables.

## Expérience acheteur

La protection n'ajoute aucun champ et aucune question dans Stripe Checkout.
Le nom de licence vient des informations normales de paiement. Si Stripe ne
fournit pas de nom, le système utilise une forme lisible dérivée de l'adresse
email.

Au premier téléchargement, le serveur crée la copie dans le stockage privé.
Il génère une adresse valable quinze minutes à chaque clic. Quand le PDF source
change, le serveur crée un nouvel exemplaire au prochain téléchargement.

## Résistance et vérifications

Chaque PDF contient une licence visible discrète dans la marge droite, un email
partiellement masqué, des métadonnées, un texte invisible et des micro-marqueurs
visuels redondants. L'outil peut retrouver l'achat après suppression des
métadonnées, retrait de la licence visible ou aplatissement du PDF, tant que
suffisamment de micro-marqueurs sont encore présents.

L'attribution finale exige toujours une commande Supabase cohérente, une session
Stripe payée, le bon produit et la même adresse email. Une correspondance locale
seule ne suffit jamais à désigner un acheteur.
