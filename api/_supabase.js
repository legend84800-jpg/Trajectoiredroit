// Helpers d'accès à Supabase (auth + Postgrest) en fetch brut, sans dépendance npm,
// cohérent avec le reste du dossier api/ (Stripe et Brevo sont aussi appelés en fetch brut).
// Nécessite SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY en variables d'environnement Vercel.

function base() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Configuration Supabase manquante");
  return { url, serviceKey };
}

// Vérifie un JWT de session envoyé par le front et retourne { id, email } ou null.
async function utilisateurDepuisJWT(jwt) {
  const { url, serviceKey } = base();
  if (!jwt) return null;
  const resp = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data && data.id ? { id: data.id, email: data.email } : null;
}

async function selectionner(table, requete) {
  const { url, serviceKey } = base();
  const resp = await fetch(`${url}/rest/v1/${table}?${requete}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!resp.ok) throw new Error(`Supabase select ${table}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function inserer(table, donnees) {
  const { url, serviceKey } = base();
  const resp = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(donnees),
  });
  if (!resp.ok) throw new Error(`Supabase insert ${table}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// Réserve une ligne sans écraser celle qui existe déjà. Avec une contrainte
// unique sur colonneConflit, un tableau vide signifie que l'événement a déjà
// été traité. Ce mécanisme sert de verrou durable pour les webhooks Stripe.
async function insererSiAbsent(table, donnees, colonneConflit) {
  const { url, serviceKey } = base();
  const resp = await fetch(`${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(colonneConflit)}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(donnees),
  });
  if (!resp.ok) throw new Error(`Supabase insert-if-absent ${table}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function supprimer(table, requete) {
  const { url, serviceKey } = base();
  const resp = await fetch(`${url}/rest/v1/${table}?${requete}`, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "return=representation",
    },
  });
  if (!resp.ok) throw new Error(`Supabase delete ${table}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// Insère ou met à jour selon une contrainte unique (ex: "user_id" ou "user_id,mois").
async function upsert(table, donnees, colonneConflit) {
  const { url, serviceKey } = base();
  const resp = await fetch(`${url}/rest/v1/${table}?on_conflict=${colonneConflit}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(donnees),
  });
  if (!resp.ok) throw new Error(`Supabase upsert ${table}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function mettreAJour(table, requete, donnees) {
  const { url, serviceKey } = base();
  const resp = await fetch(`${url}/rest/v1/${table}?${requete}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(donnees),
  });
  if (!resp.ok) throw new Error(`Supabase update ${table}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

module.exports = {
  utilisateurDepuisJWT,
  selectionner,
  inserer,
  insererSiAbsent,
  supprimer,
  upsert,
  mettreAJour,
};
