const Stripe = require("stripe");

const STRIPE_API_VERSION = "2026-08-26.dahlia";
let runtimeIdentifie = false;

const INTEGRATION_IDS = Object.freeze({
  checkout: "trajectoire_droit_kqjfzrpa",
  relance: "trajectoire_relance_wmhtxkqd",
  portalis: "trajectoire_portalis_bvcnzgye",
});

function creerClientStripe(cleSecrete) {
  if (!cleSecrete) throw new Error("Configuration Stripe manquante");
  if (!runtimeIdentifie) {
    console.info(JSON.stringify({ event: "stripe_runtime", node: process.version }));
    runtimeIdentifie = true;
  }
  return new Stripe(cleSecrete, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: {
      name: "Trajectoire Droit",
      version: "1.0.0",
      url: "https://trajectoiredroit.com",
    },
  });
}

module.exports = { creerClientStripe, INTEGRATION_IDS, STRIPE_API_VERSION };
