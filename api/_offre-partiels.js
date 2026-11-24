const { offre_partiels: offre } = require("../assets/data/saison.json");

function offrePartielsActive(maintenant = Date.now()) {
  if (!offre) return null;
  return Date.parse(offre.debut) <= maintenant && maintenant < Date.parse(offre.fin) ? offre : null;
}

function prixOffrePartiels(centimes, offreActive) {
  return offreActive.prix_ronds_centimes?.[centimes] ?? (centimes - Math.round(centimes * offreActive.taux / 100));
}

function bornerSessionOffrePartiels(params, offreActive, maintenant = Date.now()) {
  // Stripe impose 30 minutes minimum. Une session ouverte à temps garde
  // sa remise le temps de la terminer, sans lien de récupération réutilisable.
  const fin = Math.floor(Date.parse(offreActive.fin) / 1000);
  const expirationMinimale = Math.floor(maintenant / 1000) + 31 * 60;
  const suite = {
    ...params,
    expires_at: Math.min(params.expires_at, Math.max(fin, expirationMinimale)),
    metadata: { ...params.metadata, offrePartiels: offreActive.id },
  };
  delete suite.after_expiration;
  return suite;
}

function avecCouponOffrePartiels(params, offreActive) {
  const suite = bornerSessionOffrePartiels(params, offreActive);
  delete suite.allow_promotion_codes;
  suite.discounts = [{ coupon: offreActive.id }];
  return suite;
}

function avecPrixOffrePartiels(params, offreActive) {
  const prixRonds = offreActive.prix_ronds_centimes;
  const prixFixes = prixRonds && params.line_items.some((ligne) => prixRonds[ligne.price_data?.unit_amount] != null);
  if (!prixFixes) return avecCouponOffrePartiels(params, offreActive);

  const suite = bornerSessionOffrePartiels(params, offreActive);
  delete suite.allow_promotion_codes;
  delete suite.discounts;
  suite.line_items = params.line_items.map((ligne) => ({
    ...ligne,
    price_data: {
      ...ligne.price_data,
      unit_amount: prixOffrePartiels(ligne.price_data.unit_amount, offreActive),
    },
  }));
  return suite;
}

module.exports = {
  offrePartielsActive, prixOffrePartiels, bornerSessionOffrePartiels, avecCouponOffrePartiels, avecPrixOffrePartiels,
};
