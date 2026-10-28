const { PRODUITS_STRIPE_CADEAUX, codeCadeauEleve, lireCadeauEleve, avecProduitCadeauEleve } = require("./_cadeau-eleve");
const CODE_MATHILDE = "MATHILDE";
const PRODUIT_STRIPE_MATHILDE = PRODUITS_STRIPE_CADEAUX[CODE_MATHILDE];

function lireCadeauMathilde(corps, produits) {
  if (codeCadeauEleve(corps.code) !== CODE_MATHILDE) return null;
  return lireCadeauEleve(corps, produits);
}

function avecProduitCadeauMathilde(params, produit) {
  return avecProduitCadeauEleve(params, produit, CODE_MATHILDE);
}

module.exports = { CODE_MATHILDE, PRODUIT_STRIPE_MATHILDE, lireCadeauMathilde, avecProduitCadeauMathilde };
