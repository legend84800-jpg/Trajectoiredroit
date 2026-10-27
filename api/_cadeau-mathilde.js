const CODE_MATHILDE = "MATHILDE";
const PRODUIT_STRIPE_MATHILDE = "prod_tjd_cadeau_mathilde_20";
const MAXIMUM_CENTIMES = 2000;

function lireCadeauMathilde(corps, produits) {
  if (typeof corps.code !== "string" || corps.code.trim().toUpperCase() !== CODE_MATHILDE) return null;
  const ids = Array.isArray(corps.produitIds)
    ? corps.produitIds
    : [corps.produitId, corps.bumpId].filter(Boolean);
  const uniques = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];
  const produit = uniques.length === 1 ? produits[uniques[0]] : null;
  if (!produit || produit.venteSuspendue || !Number.isInteger(produit.prix)
    || produit.prix < 0 || produit.prix > MAXIMUM_CENTIMES || corps.echeances
    || corps.mode === "subscription" || corps.type) {
    return { erreur: "Le code MATHILDE offre un seul produit par commande, jusqu’à 20 €.", code: "cadeau_ineligible" };
  }
  return { produit, id: uniques[0] };
}

function avecProduitCadeauMathilde(params, produit) {
  const ligne = params.line_items[0];
  const { product_data, ...prix } = ligne.price_data;
  return {
    ...params,
    line_items: [{ ...ligne, price_data: { ...prix, product: PRODUIT_STRIPE_MATHILDE } }],
    custom_text: {
      ...params.custom_text,
      submit: { message: `Tu as choisi « ${produit.nom} ». Vérifie ton adresse email, car tes fichiers y sont envoyés juste après la confirmation.` },
    },
  };
}

module.exports = { CODE_MATHILDE, PRODUIT_STRIPE_MATHILDE, lireCadeauMathilde, avecProduitCadeauMathilde };
