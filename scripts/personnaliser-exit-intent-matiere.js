// Vague 2.14 : personnalise le texte de la modale exit-intent déjà présente sur les
// 18 pages matière (auparavant identique partout : "Avant de partir... guide Réviser
// le droit sans s'épuiser"), pour mentionner la matière réellement consultée plutôt
// qu'une promesse générique. Idempotent (ne réécrit rien si déjà personnalisé).
const fs = require("fs");
const path = require("path");
const { MATIERES } = require("./mapping-matieres");

const ROOT = path.join(__dirname, "..");
// \s tolère l'espace insécable (U+00A0) placé avant « » en typographie française,
// qui a fait échouer une comparaison littérale sur 5 des 18 pages au premier essai.
const REGEX_GENERIQUE = /<p class="lead" style="margin-bottom:24px">Reçois mon <strong>guide «\s*Réviser le droit sans s'épuiser\s*»<\/strong>, <strong>gratuitement<\/strong>\.<\/p>/;

let traites = 0;
for (const [slug, m] of Object.entries(MATIERES)) {
  const fichier = slug + ".html";
  const chemin = path.join(ROOT, fichier);
  if (!fs.existsSync(chemin)) {
    console.log("  ! fichier introuvable : " + fichier);
    continue;
  }
  let html = fs.readFileSync(chemin, "utf8");
  if (!REGEX_GENERIQUE.test(html)) {
    console.log("--  " + fichier + " (déjà personnalisé ou texte différent)");
    continue;
  }
  const texteNouveau = `<p class="lead" style="margin-bottom:24px">Tu révises ${m.nom} ? Reçois mon <strong>guide « 10 tips pour apprendre le droit »</strong>, <strong>gratuitement</strong>, pour réviser sans t'épuiser.</p>`;
  html = html.replace(REGEX_GENERIQUE, texteNouveau);
  fs.writeFileSync(chemin, html, "utf8");
  console.log("OK  " + fichier);
  traites++;
}
console.log("Terminé. " + traites + " pages mises à jour.");
