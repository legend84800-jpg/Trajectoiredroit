// Vague 2.13 : bloc "fiche offerte contre email" sur les 18 pages matière, qui n'en
// avaient aucune (seul le pied de page newsletter générique existait). Réutilise le
// lead magnet déjà en place ailleurs sur le site (fiche "10 tips pour apprendre le
// droit", servie par merci.html) plutôt que de fabriquer un nouveau PDF par matière,
// décision de Julien pour ne pas immobiliser du contenu à créer.
const fs = require("fs");
const path = require("path");
const { MATIERES } = require("./mapping-matieres");

const ROOT = path.join(__dirname, "..");
const MARQUEUR = "<!-- vague2:lead-magnet-matiere -->";
const CIBLE = "<!-- vague2:tout-pour-ta-matiere -->";
const SIBFORMS_ACTION =
  "https://70e8de88.sibforms.com/serve/MUIFAAzh2VGBFy_yNhMy1bxQ-GlGi60jI4nJWPJsRuL-YSALofNbm6iQW7cM7-Ke4EZJXcOIByqYeJNOy7JDDNtPZsBawO7LQ4yjlzpM0km-EZEQ84ywQ6wAbgBwzeGcXGhuJXbc996n96lqcXcRIxxHPaf3X_00EnoAtxH-zW6OWz9wxIzwK6MNyNxxW7PX9961aEp-qrv-GDYGCA==";

function construireBloc(nomMatiere) {
  return `${MARQUEUR}
    <section class="section section--alt">
      <div class="container container--narrow">
        <div class="inline-capture" style="max-width:560px; margin:0 auto">
          <p class="inline-capture__title">Pas encore prêt à acheter ?</p>
          <p class="inline-capture__text">Reçois gratuitement mon guide « 10 tips pour apprendre le droit », pour t'aider à réviser ${nomMatiere} (et le reste) sans t'épuiser.</p>
          <form action="${SIBFORMS_ACTION}" method="POST">
            <input type="email" name="email" required placeholder="ton@email.com" aria-label="Email">
            <input type="hidden" name="_subject" value="Lead magnet (page matière : ${nomMatiere})">
            <input type="hidden" name="_next" value="https://trajectoiredroit.com/merci.html">
            <button class="btn btn--primary" type="submit">Recevoir mon guide →</button>
          </form>
        </div>
      </div>
    </section>
`;
}

let traites = 0;
for (const slug of Object.keys(MATIERES)) {
  const fichier = slug + ".html";
  const chemin = path.join(ROOT, fichier);
  if (!fs.existsSync(chemin)) {
    console.log("  ! fichier introuvable : " + fichier);
    continue;
  }
  let html = fs.readFileSync(chemin, "utf8");
  if (html.includes(MARQUEUR)) {
    console.log("--  " + fichier + " (déjà à jour)");
    continue;
  }
  const idx = html.indexOf(CIBLE);
  if (idx === -1) {
    console.log("  ! " + fichier + " : ancre 'Tout pour ta matière' introuvable");
    continue;
  }
  const finSection = html.indexOf("</section>", idx);
  if (finSection === -1) {
    console.log("  ! " + fichier + " : fermeture de section introuvable");
    continue;
  }
  const pointInsertion = finSection + "</section>".length;
  const bloc = construireBloc(MATIERES[slug].nom);
  html = html.slice(0, pointInsertion) + "\n" + bloc + html.slice(pointInsertion);
  fs.writeFileSync(chemin, html, "utf8");
  console.log("OK  " + fichier);
  traites++;
}
console.log("Terminé. " + traites + " pages mises à jour.");
