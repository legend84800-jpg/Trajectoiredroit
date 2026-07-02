#!/usr/bin/env node
// Gestion des codes ambassadeurs TJD.
// Usage :
//   node ambassadeurs.js ajouter LYON3JULIE    → crée le code LYON3JULIE dans Stripe
//   node ambassadeurs.js lister               → liste tous les codes actifs + nb utilisations

const path = require("path");
const fs = require("fs");

function chargerEnv(chemin) {
  try {
    const contenu = fs.readFileSync(chemin, "utf-8");
    contenu.split("\n").forEach(ligne => {
      const m = ligne.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    });
  } catch {}
}

const ROOT = path.resolve(__dirname);
chargerEnv(path.join(ROOT, ".env.local"));
chargerEnv(path.join(ROOT, ".env"));

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) { console.error("STRIPE_SECRET_KEY introuvable dans .env"); process.exit(1); }

const COUPON_ID = "1Kq3atBa"; // Ambassadeurs TJD -10%

async function stripePost(endpoint, params) {
  const body = new URLSearchParams(params).toString();
  const resp = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Stripe ${resp.status}: ${data.error?.message}`);
  return data;
}

async function stripeGet(endpoint) {
  const resp = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Stripe GET ${resp.status}: ${data.error?.message}`);
  return data;
}

async function ajouter(nomCode) {
  if (!nomCode) { console.error("Donne un nom de code, ex: node ambassadeurs.js ajouter LYON3JULIE"); process.exit(1); }
  const code = nomCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pc = await stripePost("promotion_codes", {
    coupon: COUPON_ID,
    code,
    "metadata[ambassadeur]": nomCode,
  });
  console.log(`Code créé : ${pc.code}`);
  console.log(`Réduction : ${pc.coupon.percent_off}% sur le premier achat`);
  console.log(`À communiquer à l'ambassadeur : taper "${pc.code}" au moment de payer sur trajectoiredroit.com`);
}

async function lister() {
  const liste = await stripeGet(`promotion_codes?coupon=${COUPON_ID}&limit=100`);
  if (!liste.data.length) { console.log("Aucun code ambassadeur actif."); return; }
  console.log(`Codes ambassadeurs actifs (coupon ${COUPON_ID} -10%) :\n`);
  for (const pc of liste.data) {
    const utilisations = pc.times_redeemed || 0;
    const statut = pc.active ? "actif" : "inactif";
    console.log(`  ${pc.code.padEnd(20)} ${String(utilisations).padStart(3)} utilisation(s)   [${statut}]`);
  }
}

const [, , commande, arg] = process.argv;
if (commande === "ajouter") ajouter(arg).catch(e => { console.error(e.message); process.exit(1); });
else if (commande === "lister") lister().catch(e => { console.error(e.message); process.exit(1); });
else {
  console.log("Usage :");
  console.log("  node ambassadeurs.js ajouter NOM_CODE   — crée un nouveau code ambassadeur");
  console.log("  node ambassadeurs.js lister             — liste les codes actifs et leurs utilisations");
}
