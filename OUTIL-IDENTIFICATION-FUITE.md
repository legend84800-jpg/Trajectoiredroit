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

La première version reconnaît le produit pilote `maj-penal-l2-s1`. Elle peut
retrouver la copie après suppression des métadonnées, retrait de la licence
visible ou aplatissement du PDF, tant que suffisamment de micro-marqueurs sont
encore présents.
