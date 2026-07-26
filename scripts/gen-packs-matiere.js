const PRODUITS = require("../api/_produits.js");

// matiereSlug -> { nom, composants: [idProduit, ...] }
const PACKS = {
  "pack-matiere-da-l2": { nom: "Pack Droit administratif L2 complet (fiche + flashcards + arrêts + cas pratiques)", composants: ["fiche-da-l2-s1", "fiche-da-l2-s2", "flashcards-qcm-da-l2-s1", "flashcards-qcm-da-l2-s2", "fiche-arret-administratif", "cas-pratique-da-l2-s1", "cas-pratique-da-l2-s2"] },
  "pack-matiere-commercial-l3": { nom: "Pack Droit commercial L3 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-commercial-l3-s1", "flashcards-qcm-commercial-l3-s1", "fiche-arret-commercial-l3-s1", "cas-pratique-commercial-l3-s1"] },
  "pack-matiere-constit-l1": { nom: "Pack Droit constitutionnel L1 complet (fiche + flashcards + arrêts + dissertations)", composants: ["fiche-constit-l1-s1", "fiche-constit-l1-s2", "flashcards-qcm-constit-l1-s1", "flashcards-qcm-constit-l1-s2", "fiche-arret-constit-l1-s1", "fiche-arret-constit-l1-s2", "dissertation-constit-l1-s1", "dissertation-constit-l1-s2"] },
  "pack-matiere-famille-l1": { nom: "Pack Droit de la famille L1 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-famille-l1-s2", "flashcards-qcm-famille-l1-s2", "fiche-arret-famille", "cas-pratique-famille-l1-s2"] },
  "pack-matiere-biens-l2": { nom: "Pack Droit des biens L2 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-biens-l2", "flashcards-qcm-biens-l2", "fiche-arret-biens", "cas-pratique-biens-l2"] },
  "pack-matiere-contrats-l2": { nom: "Pack Droit des contrats L2 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-contrats-l2-s1", "flashcards-qcm-contrats-l2-s1", "fiche-arret-contrats", "cas-pratique-contrats-l2-s1"] },
  "pack-matiere-obligations-l2": { nom: "Pack Droit des obligations L2 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-obligations-l2-s2", "flashcards-qcm-obligations-l2-s2", "fiche-arret-obligations", "cas-pratique-obligations-l2-s2"] },
  "pack-matiere-personnes-l1": { nom: "Pack Droit des personnes L1 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-personnes-l1", "flashcards-qcm-personnes-l1", "fiche-arret-personnes", "cas-pratique-personnes-l1"] },
  "pack-matiere-societes-l3": { nom: "Pack Droit des sociétés L3 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-societes-l3-s1", "flashcards-qcm-societes-l3-s1", "fiche-arret-societes", "cas-pratique-societes-l3"] },
  "pack-matiere-travail-l3": { nom: "Pack Droit du travail L3 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-travail-l3-s1", "flashcards-qcm-travail-l3-s1", "fiche-arret-travail-l3-s1", "cas-pratique-travail-l3"] },
  "pack-matiere-penal-general-l1": { nom: "Pack Droit pénal général L1 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-penal-general-l1", "flashcards-qcm-penal-general-l1", "fiche-arret-penal", "cas-pratique-penal-general-l1"] },
  "pack-matiere-penal-l2": { nom: "Pack Droit pénal L2 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-penal-l2-s1", "flashcards-qcm-penal-l2-s1", "fiche-arret-penal", "cas-pratique-penal-l2-s1"] },
  "pack-matiere-intro-droit-l1": { nom: "Pack Introduction au droit L1 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-intro-droit-l1", "flashcards-qcm-intro-droit-l1", "fiche-arret-intro-droit-l1", "cas-pratique-intro-droit-l1"] },
  "pack-matiere-contrats-speciaux-l3": { nom: "Pack Contrats spéciaux L3 complet (fiche + flashcards + arrêts + cas pratique)", composants: ["fiche-contrats-speciaux-l3", "flashcards-qcm-contrats-speciaux-l3", "fiche-arret-contrats-speciaux-l3", "cas-pratique-contrats-speciaux-l3"] },
};

let manquants = [];
let out = "";
for (const [packId, def] of Object.entries(PACKS)) {
  let blobs = [];
  for (const compId of def.composants) {
    const p = PRODUITS[compId];
    if (!p) { manquants.push(compId + " (pour " + packId + ")"); continue; }
    blobs.push(...p.blobs);
  }
  const valeurUnite = def.composants.reduce((s, id) => s + (PRODUITS[id] ? PRODUITS[id].prix : 0), 0);
  out += `  "${packId}": { nom: "${def.nom}", prix: 2999, blobs: [\n`;
  for (const b of blobs) out += `      "${b}",\n`;
  out = out.replace(/,\n$/, "\n");
  out += `  ] }, // valeur à l'unité : ${(valeurUnite/100).toFixed(2)} €\n`;
}
if (manquants.length) console.error("MANQUANTS: " + manquants.join(", "));
console.log(out);
