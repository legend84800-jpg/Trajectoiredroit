// Portalis est retiré. Cette réponse protège les anciennes pages encore en cache.
// Aucun appel au modèle ni aucune modification de quota ou d'abonnement.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({
    erreur: "Portalis a été retiré du site.",
    code: "offre_retiree",
  });
};
