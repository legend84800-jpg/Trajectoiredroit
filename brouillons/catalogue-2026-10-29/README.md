# Aperçus des filtres du catalogue

Les deux pages reprennent les cartes et les couleurs du site. Elles restent dans `brouillons/`, qui est exclu du déploiement Vercel.

La variante des fiches place les filtres et les cartes à l’unité juste après la présentation. Les packs viennent ensuite. Le visiteur trouve donc sa matière plus tôt, tandis que les packs deviennent moins visibles au début.

La variante des cours reprend ce même ordre et ajoute les choix L1, L2 et L3 à la recherche existante. Le niveau reste sélectionné entre les deux aperçus. De plus, la recherche et le filtre par année fonctionnent ensemble, avec un nombre de résultats affiché. Enfin, le bouton Réinitialiser remet tous les supports à l’écran et efface cette sélection.

Les pages publiques conservent leur disposition actuelle. Ces aperçus servent à choisir le rendu avant une modification du site. Le script `generer-apercus-filtres.py` permet de les reconstruire depuis les fichiers publics locaux, pour reprendre les dernières compositions et versions de fichiers.
