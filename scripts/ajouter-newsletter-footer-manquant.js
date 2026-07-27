// Vague 4.13 : 8 pages avaient un footer appauvri sans la colonne Newsletter
// présente partout ailleurs (maillage interne et capture email perdus).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PAGES = ["404.html", "ambassadeurs.html", "arrets-expliques.html", "bientot.html", "merci-achat.html", "quiz-methode.html", "ressources-gratuites.html", "top-ventes.html"];
const SIBFORMS_ACTION =
  "https://70e8de88.sibforms.com/serve/MUIFAAzh2VGBFy_yNhMy1bxQ-GlGi60jI4nJWPJsRuL-YSALofNbm6iQW7cM7-Ke4EZJXcOIByqYeJNOy7JDDNtPZsBawO7LQ4yjlzpM0km-EZEQ84ywQ6wAbgBwzeGcXGhuJXbc996n96lqcXcRIxxHPaf3X_00EnoAtxH-zW6OWz9wxIzwK6MNyNxxW7PX9961aEp-qrv-GDYGCA==";

function construireBloc(nomPage) {
  return `        <div>
          <h4>Newsletter</h4>
          <p style="color:rgba(255,255,255,.65); font-size:.9rem; margin-bottom:12px">Fiche méthode gratuite chaque semaine.</p>
          <form action="${SIBFORMS_ACTION}" method="POST" style="display:flex; gap:8px; flex-direction:column">
            <input type="email" name="email" required placeholder="ton@email.com" class="form__input" style="background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.18); color:#fff" aria-label="Email">
            <input type="hidden" name="_subject" value="Newsletter (page ${nomPage})">
            <button class="btn btn--primary btn--full" type="submit">S'inscrire</button>
          </form>
        </div>
`;
}

let traites = 0;
for (const fichier of PAGES) {
  const chemin = path.join(ROOT, fichier);
  if (!fs.existsSync(chemin)) { console.log("  ! introuvable : " + fichier); continue; }
  let html = fs.readFileSync(chemin, "utf8");
  if (html.includes("<h4>Newsletter</h4>")) { console.log("--  " + fichier + " (déjà à jour)"); continue; }

  const regexMultiligne = /(<div>\s*<h4[^>]*>Légal<\/h4>\s*(?:<a[^>]*>[^<]*<\/a>\s*)+<\/div>\n)(\s*<\/div>)/;
  const regexCompacte = /(<div class="footer-legal-mini"><h4[^>]*>Légal<\/h4>(?:<a[^>]*>[^<]*<\/a>)+<\/div>\n)(\s*<\/div>)/;
  const nomPage = fichier.replace(".html", "").replace(/-/g, " ");
  const bloc = construireBloc(nomPage);

  if (regexMultiligne.test(html)) {
    html = html.replace(regexMultiligne, (m, colonneLegal, fermeture) => colonneLegal + bloc + fermeture);
  } else if (regexCompacte.test(html)) {
    html = html.replace(regexCompacte, (m, colonneLegal, fermeture) => colonneLegal + bloc + fermeture);
  } else {
    console.log("  ! " + fichier + " : ancre colonne Légal introuvable");
    continue;
  }
  fs.writeFileSync(chemin, html, "utf8");
  console.log("OK  " + fichier);
  traites++;
}
console.log("Terminé. " + traites + " pages mises à jour.");
