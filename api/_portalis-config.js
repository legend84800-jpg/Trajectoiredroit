const LIMITES = Object.freeze({ reponses: 60, caracteres: 30000, pages: 15, octetsPDF: 20 * 1024 * 1024, jetonsEntree: 20000 });
// Les montants seront renseignés après la réponse de Julien sur les tarifs.
const FORMULES = Object.freeze({
  portalis: Object.freeze({ nom: "Portalis", effort: "low", jetonsSortie: 3000, prix: null, recharges: {} }),
  classique: Object.freeze({ nom: "Portalis Classique", effort: "medium", jetonsSortie: 5000, prix: null, recharges: {} }),
  pro: Object.freeze({ nom: "Portalis Pro", effort: "high", jetonsSortie: 8000, prix: null, recharges: {} }),
});
const MODELE = "claude-sonnet-5-5";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function formuleValide(v) { return typeof v === "string" && Object.hasOwn(FORMULES, v); }
function configurationPublique() {
  return {limites:{reponses:LIMITES.reponses,caracteres:LIMITES.caracteres,pages:LIMITES.pages,octetsPDF:LIMITES.octetsPDF},
    formules:Object.fromEntries(Object.entries(FORMULES).map(([code,p])=>[code,{nom:p.nom,prix:p.prix,recharges:p.recharges}]))};
}
module.exports = { LIMITES, FORMULES, MODELE, UUID, formuleValide, configurationPublique };
