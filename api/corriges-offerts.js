// Contenu et prix des recueils dont un cas complet est offert.
const PRODUITS = require('./_produits');
const { CORRIGES_OFFERTS } = require('./lead');

function offres() {
  return Object.entries(CORRIGES_OFFERTS).map(([id, compte]) => ({
    id,
    matiere: PRODUITS[id].nom.replace(/^Cas pratiques corrigés /, ''),
    cas: compte.cas,
    partiels: compte.partiels,
    prix: PRODUITS[id].prix,
    url: '/cas-pratiques-corriges.html?matiere=' + encodeURIComponent(id) + '#recueils-cas-pratiques'
  }));
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res.status(200).json({ offres: offres() });
};
module.exports.offres = offres;
