// F1 (audit CTA du 15/11/2026) : table « page d'arrivée -> produit recommandé » lue par
// merci.html (D7) et quiz-methode.html (D9). Lancé à chaque construction (npm run build),
// pour que chaque nouvelle page entre dans la table, puis met à jour le ?v= des deux pages.
// Le produit retenu est celui de l'offre de fin d'une fiche d'arrêt, sinon celui du premier
// encart d'offre, sinon le premier bouton d'achat de la page. Le cours en images, produit
// de test, n'est retenu que sur sa propre page.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const PRODUITS = require("../api/_produits");

const ROOT = path.resolve(__dirname, "..");
const SORTIE = path.join(ROOT, "assets/js/merci-reco-data.js");
const PAGES_LECTRICES = ["merci.html", "quiz-methode.html"];
const EXCLUS = /^(merci|mon-compte|panier|404|index|formations|cours-fiches|corriges|revisions|fiche-arrets|commentaires-arret-corriges|blog|methode|galop|methodologie|pack-ultra|top-ventes|a-propos|faq|cgu|cgv|mentions|confidentialite|ambassadeurs|temoignages|garantie|parents|portalis|quiz|ressources|produit-template|bientot|google|complements|guide|donner|contact|connexion|stage|podcasts|majeures-preparees|cas-pratiques-corriges|flashcards-qcm|fiches-de-citations)/;
const MOTIFS = [
  /data-offre-fin-arret="([^"]+)"/g,
  /class="conversion-offer[\s\S]*?data-tjd-produit="([^"]+)"/g,
  /data-tjd-produit="([^"]+)"/g,
];

function produitDeLaPage(fichier, html) {
  const main = (html.match(/<main[^>]*>([\s\S]*)<\/main>/) || [null, html])[1];
  for (const motif of MOTIFS) {
    for (const m of main.matchAll(motif)) {
      const id = m[1];
      if (!PRODUITS[id] || PRODUITS[id].venteSuspendue) continue;
      if (id.startsWith("cours-images-") && !fichier.includes("en-images")) continue;
      return id;
    }
  }
  return null;
}

function generer() {
  const pages = {};
  const utilises = new Set();
  for (const fichier of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort()) {
    if (EXCLUS.test(fichier)) continue;
    const id = produitDeLaPage(fichier, fs.readFileSync(path.join(ROOT, fichier), "utf8"));
    if (!id) continue;
    pages[fichier.replace(/\.html$/, "")] = id;
    utilises.add(id);
  }
  const produits = Object.fromEntries([...utilises].sort().map((id) => [id, [PRODUITS[id].nom, PRODUITS[id].prix]]));
  return "/* D7 CTA 2026-11-15 : produit recommandé selon la page d'arrivée (généré par scripts/generer-reco-merci.js) */\n" +
    "window.TJD_RECO_MERCI={pages:" + JSON.stringify(pages) + ",produits:" + JSON.stringify(produits) + "};\n";
}

function main() {
  const contenu = generer();
  const ancien = fs.existsSync(SORTIE) ? fs.readFileSync(SORTIE, "utf8") : "";
  if (contenu !== ancien) fs.writeFileSync(SORTIE, contenu);
  const version = crypto.createHash("md5").update(contenu).digest("hex").slice(0, 8);
  for (const page of PAGES_LECTRICES) {
    const chemin = path.join(ROOT, page);
    const html = fs.readFileSync(chemin, "utf8");
    const nouveau = html.replace(/merci-reco-data\.js\?v=[0-9a-f]+/g, `merci-reco-data.js?v=${version}`);
    if (nouveau !== html) fs.writeFileSync(chemin, nouveau);
  }
  const n = (contenu.match(/"[a-z0-9-]+":"/g) || []).length;
  console.log(`Table merci : ${n} pages reliées à un produit, version ${version}.`);
}

if (require.main === module) main();
module.exports = { generer, produitDeLaPage };
