// Vague 3.4 : retire l'aggregateRating (162 avis Superprof, qui portent sur les cours
// particuliers) copié sur chaque Product JSON-LD des pages produit. Un vrai risque
// Google (avis "produit" qui n'existent pas pour ce PDF précis) et un mélange de
// preuves trompeur (cours particuliers vs fiches PDF). Idempotent (grep avant écriture).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REGEX = /,\s*"aggregateRating":\s*\{\s*"@type":\s*"AggregateRating"[^}]*\}/g;

const fichiers = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
let traites = 0;
let occurrencesTotal = 0;

for (const fichier of fichiers) {
  const chemin = path.join(ROOT, fichier);
  let html = fs.readFileSync(chemin, "utf8");
  const occurrences = (html.match(REGEX) || []).length;
  if (!occurrences) continue;
  html = html.replace(REGEX, "");
  fs.writeFileSync(chemin, html, "utf8");
  console.log("OK  " + fichier + " (" + occurrences + " bloc(s) retiré(s))");
  traites++;
  occurrencesTotal += occurrences;
}
console.log("Terminé. " + traites + " pages modifiées, " + occurrencesTotal + " blocs aggregateRating retirés.");
