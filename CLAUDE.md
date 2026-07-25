# CLAUDE.md, site Trajectoire Droit

> Ce dossier vit hors du workspace Jarvis (`/Users/julienfnl/Claude/`), donc aucune règle de ce workspace ne se charge ici toute seule. Ce fichier porte le minimum vital. Pour le contexte complet de Julien, ouvrir une session depuis le workspace ou lire `/Users/julienfnl/Claude/CLAUDE.md`.

## Ce que c'est

Le site vitrine et la boutique de Trajectoire Droit, la plateforme de cours et de fiches de droit de Julien. Environ 153 pages HTML statiques, plus des fonctions serverless Vercel dans `api/`. C'est la priorité absolue de Julien et sa source de revenus produit, donc rien ne se casse ici sans être vu tout de suite.

Le paiement passe par Stripe Checkout, la livraison des PDF par Cloudflare R2 et Brevo, les comptes utilisateurs par Supabase, et les mesures d'audience par Search Console, GA4 et Matomo auto-hébergé.

## Style, non négociable

Tout texte visible par un visiteur passe par le skill `redaction-julien` du workspace (`/Users/julienfnl/Claude/.claude/skills/redaction-julien/SKILL.md`), checklist complète et passe adversariale comprises. En résumé, écriture affirmative directe, mots simples, tutoiement de l'étudiant, aucune métaphore inventée, aucune formule marketing creuse.

**JAMAIS de tirets cadratins ni demi-cadratins dans une page, aucune exception.** Remplacer par une virgule, un point, une parenthèse, ou reformuler.

**Pas de deux-points au milieu d'une phrase** pour introduire un mot ou une idée.

## Publier

Le dépôt a deux remotes et les deux reçoivent chaque publication. Le push est automatique dès qu'un fichier HTML, CSS ou JS est modifié, sans demander confirmation, et les modifications enchaînées se regroupent en un seul commit.

```bash
git pull && git add -A && git commit -m "…" && git push origin main && git push prod main
```

Un `git pull` s'impose à l'ouverture de toute session sur ce dossier, avant la moindre modification.

## Cache-busting, à faire à chaque fois

Les assets sont servis avec un hash de version, du type `style.css?v=721b039e` et `main.js?v=ee37c3d3`. Vercel les met en cache une heure.

**Toute modification de `assets/css/style.css` ou de `assets/js/main.js` oblige à régénérer le hash `?v=` sur toutes les pages qui les appellent.** Sans ça le changement reste invisible pour les visiteurs pendant une heure, et Julien croit que le travail n'a pas été fait.

## Vérifier avant de publier

```bash
python3 /Users/julienfnl/Claude/livrables/automatisation/verifier_sante_site.py --site /Users/julienfnl/Sites/trajectoiredroit
```

Le contrôle passe les liens internes et les fichiers produits. Si une anomalie sort, la corriger, relancer le contrôle, et publier seulement quand il est vert. Rien ne part sur une impression que ça a l'air bon.

## Ce qu'on ne touche pas

- Les clés et les jetons. Ils vivent dans le `.env` local et dans les variables d'environnement Vercel, jamais en clair dans une page ni dans un commit.
- La devise. Le prix vu par le client est en euros, fixé en dur par `currency: "eur"` dans `api/create-checkout.js` et `api/stripe-webhook.js`.
- Les statistiques affichées sur les pages. Elles doivent rester les vrais chiffres vérifiables (620+ étudiants, 4 500 h de cours, 162 avis 5/5 Superprof). Aucun chiffre inventé, sous peine de pratique commerciale trompeuse au sens de l'article L121-2 du Code de la consommation.
- Superprof n'est jamais cité dans un document officiel ou financier.

## Structure

| Dossier | Contenu |
|---|---|
| racine | les pages HTML, une par produit, matière ou page pilier |
| `api/` | fonctions serverless Vercel (Stripe, webhooks, leads, méthodes Portalis) |
| `assets/` | `css/style.css`, `js/main.js`, `js/achat.js`, images |
| `supabase/` | comptes utilisateurs et essais gratuits de Portalis |
| `seo-reports/` | sorties des routines SEO, pas du contenu servi |
| `brouillons/` | travail en cours, jamais publié tel quel |
