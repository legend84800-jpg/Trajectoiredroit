// Conseil dicté par Julien pour la livraison des majeures, le 04/10/2026.
// Une seule source pour les emails HTML et texte, achat direct ou cadeau.
const PARAGRAPHES_MAJEURES = [
  "Utilise les majeures préparées pour des cas pratiques. Et c'est bien de les apprendre par cœur, environ 30 minutes par jour.",
  "Tu lis une majeure et puis après, sans regarder, tu essaies de te rappeler toutes les étapes par cœur. Comme ça, dans tes cas pratiques, tu vas être super efficace.",
];

function construireConseilUtilisation(produits) {
  // Les packs annuels et les Packs Ultra contiennent les mêmes fichiers que
  // les ventes à l'unité. Leur composition réelle détermine le conseil.
  const contientMajeures = (produits || []).some((produit) =>
    Array.isArray(produit.blobs)
      && produit.blobs.some((url) => /\/maj-[^/?#]+\.pdf(?:[?#]|$)/.test(url))
  );
  if (!contientMajeures) return { html: "", texte: "" };

  const html = PARAGRAPHES_MAJEURES.map((paragraphe, index) =>
    `<p style="font-size:15px;color:#333;margin:${index === 0 ? "24px 0 24px" : "0 0 24px"};">${paragraphe}</p>`
  ).join("\n          ");
  return { html, texte: PARAGRAPHES_MAJEURES.join("\n\n") };
}

module.exports = { construireConseilUtilisation, PARAGRAPHES_MAJEURES };
