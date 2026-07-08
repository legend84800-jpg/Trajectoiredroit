// Script one-shot : liste les Checkout Sessions Stripe historiques (achats
// ponctuels déjà passés) et les insère dans la table Supabase `achats`, pour
// que l'historique d'achats de mon-compte.html couvre aussi les ventes
// antérieures au lancement de cette fonctionnalité. Les achats à venir sont
// déjà enregistrés automatiquement par api/stripe-webhook.js, ce script ne
// sert donc qu'une fois.
//
// Usage : après avoir créé le schéma Supabase (supabase/schema.sql) et rempli
// les variables ci-dessous (ou export STRIPE_SECRET_KEY / SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY dans le shell), lancer :
//   node supabase/retro-remplir-achats.js

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function listerSessionsStripe() {
  const sessions = [];
  let startingAfter = null;
  for (;;) {
    const params = new URLSearchParams({ limit: "100", status: "complete" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Stripe erreur: ${JSON.stringify(data)}`);
    sessions.push(...data.data);
    if (!data.has_more) break;
    startingAfter = data.data[data.data.length - 1].id;
  }
  return sessions;
}

async function insererAchat(donnees) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/achats?on_conflict=session_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(donnees),
  });
  if (!resp.ok) throw new Error(`Supabase erreur ${resp.status}: ${await resp.text()}`);
}

async function main() {
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Variables manquantes : STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  console.log("Récupération des sessions Stripe...");
  const sessions = await listerSessionsStripe();
  console.log(`${sessions.length} sessions trouvées au total.`);

  let inserees = 0;
  let ignorees = 0;
  for (const session of sessions) {
    if (session.mode !== "payment") continue; // les abonnements sont gérés séparément (table abonnements)
    const produitIdsRaw = session.metadata && session.metadata.produitIds;
    const email = session.customer_details && session.customer_details.email;
    if (!produitIdsRaw || !email) { ignorees++; continue; }
    const produitIds = produitIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const montant = session.amount_total != null ? session.amount_total / 100 : null;

    try {
      await insererAchat({
        email,
        produit_ids: produitIds,
        session_id: session.id,
        montant,
        cree_le: new Date(session.created * 1000).toISOString(),
      });
      inserees++;
    } catch (e) {
      console.error(`Erreur insertion ${session.id}:`, e.message);
    }
  }
  console.log(`Terminé. ${inserees} achats traités (insérés ou déjà présents), ${ignorees} sessions ignorées (sans produit/email).`);
}

main();
