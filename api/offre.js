// Redirection vers l'offre de la matière d'un inscrit (newsletter des trois astuces, 15/11/2026).
// Le lien du mail porte /api/offre?f=exercices&m={{contact.MATIERE}}&utm_... : Brevo remplace la
// variable par l'identifiant du contact, cette fonction choisit la page de sa matière et garde les
// paramètres UTM pour que Matomo attribue la visite à la campagne. Sans matière connue, le lien
// mène à la page générale du format (corrigés, majeures ou fiches complètes).

const { cheminOffre } = require("./_offres-matieres");

const GARDES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "code"];

function handler(req, res) {
  const q = req.query || {};
  const m = typeof q.m === "string" ? q.m.slice(0, 80) : "";
  const f = typeof q.f === "string" ? q.f : "exercices";
  const [base, ancre] = cheminOffre(m, f).split("#");
  const url = new URL("https://trajectoiredroit.com/" + base);
  for (const k of GARDES) {
    const v = typeof q[k] === "string" ? q[k].slice(0, 120) : "";
    if (v && /^[A-Za-z0-9_.-]+$/.test(v)) url.searchParams.set(k, v);
  }
  if (!url.searchParams.has("utm_content") && m) url.searchParams.set("utm_content", m.replace(/[^a-z0-9-]/gi, ""));
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = 302;
  res.setHeader("Location", url.pathname + url.search + (ancre ? "#" + ancre : ""));
  res.end();
}

module.exports = handler;
