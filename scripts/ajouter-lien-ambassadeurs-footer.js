// Vague 3.7 : le programme ambassadeurs (page finie, code Stripe prêt) n'avait
// zéro lien entrant sur tout le site. Ajoute un lien dans la colonne "Produits"
// du footer, partout où ce bloc existe. Idempotent (vérifie l'absence avant écriture).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIEN_INLINE = '<a href="ambassadeurs.html">Programme ambassadeurs</a>';
const LIEN_MULTILIGNE = '          <a href="ambassadeurs.html">Programme ambassadeurs</a>\n';

// Format 1, footer compact tout sur une ligne : <div><h4>Produits</h4><a ...>...</a></div>
const REGEX_PRODUITS_INLINE = /(<div><h4>Produits<\/h4>(?:<a[^>]*>[^<]*<\/a>)+)<\/div>/g;
// Format 2, footer étendu multi-lignes (pages matière) : colonne "Ressources", pas de "Produits".
const REGEX_RESSOURCES_MULTILIGNE = /(\n\s*<h4>Ressources<\/h4>\n(?:\s*<a[^>]*>[^<]*<\/a>\n)+)(\s*<\/div>)/;

const fichiers = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && f !== "ambassadeurs.html");
let traites = 0;

for (const fichier of fichiers) {
  const chemin = path.join(ROOT, fichier);
  let html = fs.readFileSync(chemin, "utf8");
  if (html.includes('href="ambassadeurs.html"')) continue; // déjà fait

  let modifie = false;
  if (REGEX_PRODUITS_INLINE.test(html)) {
    REGEX_PRODUITS_INLINE.lastIndex = 0;
    html = html.replace(REGEX_PRODUITS_INLINE, (m, avant) => avant + LIEN_INLINE + "</div>");
    modifie = true;
  } else if (REGEX_RESSOURCES_MULTILIGNE.test(html)) {
    html = html.replace(REGEX_RESSOURCES_MULTILIGNE, (m, bloc, fermeture) => bloc + LIEN_MULTILIGNE + fermeture);
    modifie = true;
  }

  if (!modifie) {
    console.log("  ! " + fichier + " : aucun pattern de footer reconnu");
    continue;
  }
  fs.writeFileSync(chemin, html, "utf8");
  console.log("OK  " + fichier);
  traites++;
}
console.log("Terminé. " + traites + " pages mises à jour.");
