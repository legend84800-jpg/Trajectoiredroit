// Option « podcasts et vidéos » par matière : un podcast et une vidéo par leçon
// du cours, écoutés et regardés en ligne depuis Mon compte (jamais envoyés par
// email, car une matière compte une quarantaine de fichiers). Les fichiers sont
// sur R2 sous un dossier au nom aléatoire. Les données (titres, adresses) sont
// dans _audio-video-data.json, produit par le script d'envoi vers R2. Le champ « nom »
// de ces données remplace l'intitulé de la fiche complète quand il existe.

const DONNEES = require("./_audio-video-data.json");

const PRIX_OPTION = 2499;

function nomMatiere(slug, catalogue) {
  const fiche = catalogue[`fiche-${slug}`];
  if (!fiche) throw new Error(`audio-video-${slug}: fiche complète introuvable pour nommer la matière.`);
  return fiche.nom.replace(/^Fiche complète /, "");
}

function construireProduits(catalogue) {
  const produits = {};
  for (const [slug, donnees] of Object.entries(DONNEES)) {
    const id = `audio-video-${slug}`;
    const nom = `Podcasts et vidéos ${donnees.nom || nomMatiere(slug, catalogue)}`;
    const blobs = [];
    const blobsMeta = [];
    donnees.unites.forEach((unite, index) => {
      const lecon = `Leçon ${index + 1}, ${unite.titre}`;
      blobs.push(unite.audio, unite.video);
      blobsMeta.push(
        { reference: id, nom, libelle: `${lecon} · podcast` },
        { reference: id, nom, libelle: `${lecon} · vidéo` }
      );
    });
    produits[id] = { nom, prix: PRIX_OPTION, blobs, blobsMeta, mediaEnLigne: true, lecons: donnees.unites.length };
  }
  return produits;
}

module.exports = { PRIX_OPTION, construireProduits };
