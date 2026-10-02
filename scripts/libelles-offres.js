const PRODUITS = require("../api/_produits");

// Libellés de présentation uniquement, sans modifier les identifiants ni les achats.
function libelleApercu(id) {
  const nom = PRODUITS[id]?.nom;
  const format = nom?.match(/^(Fiche complète|Cours complet|Majeures préparées) /)?.[1];
  if (!format) return null;
  const contenu = nom.slice(format.length + 1).match(/^(.*?) (L[123])(?: (S[12]))?$/);
  if (!contenu) return null;
  return `${contenu[1]} · ${contenu[2]}${contenu[3] ? ` ${contenu[3]}` : ""} · ${format}`;
}

function presentationPackMatiere(matiere) {
  const id = matiere.packMatiere.id;
  const produit = PRODUITS[id];
  if (!produit) throw new Error(`Pack inconnu, ${id}`);
  const fichiers = produit.blobs.map((url) => url.split("/").pop());
  const fiches = fichiers.filter((f) => /^fiche-.*\.pdf$/.test(f) && !/-plan|cartesmentales|^fiche-arret/.test(f));
  const double = fiches.length === 2;
  const nom = produit.nom.replace(/ complet.*$/, "").replace(/ (L[123])$/, " · $1");
  const ficheNom = PRODUITS[fiches[0]?.replace(/\.pdf$/, "")]?.nom;
  const semestre = double ? "S1 + S2" : ficheNom?.match(/ S([12])$/)?.[1];
  const titre = `${nom}${double ? ` ${semestre}` : semestre ? ` S${semestre}` : ""}`;
  let description;
  if (id === "pack-matiere-constit-l1") {
    description = "Le pack contient les fiches S1 et S2 avec leurs flashcards et QCM. Tu reçois aussi les fiches d'arrêt et deux dissertations corrigées. Les cours complets et les majeures préparées s'achètent à part.";
  } else if (double) {
    const flashcards = id === "pack-matiere-societes-l3" ? "les flashcards et QCM de S1" : "leurs flashcards et QCM";
    description = `Le pack contient les fiches S1 et S2 avec ${flashcards}. Tu reçois aussi les fiches d'arrêt et deux cas pratiques corrigés. Les cours complets et les majeures préparées s'achètent à part.`;
  } else {
    description = "Le pack contient la fiche complète et les flashcards avec QCM. Tu reçois aussi les fiches d'arrêt et un cas pratique corrigé. Le cours complet et les majeures préparées s'achètent à part.";
  }
  return { titre, description };
}

module.exports = { libelleApercu, presentationPackMatiere };
