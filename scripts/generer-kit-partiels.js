const fs = require("node:fs");
const path = require("node:path");
const produits = require("../api/_produits");
const { donneesPage } = require("../api/_kits-partiels");

const catalogue = path.resolve(__dirname, "../assets/kit-partiels/catalogue.js");
fs.writeFileSync(catalogue, `window.catalogueKit = ${JSON.stringify(donneesPage(produits), null, 2)};\n`);
