// Sonde de diagnostic temporaire : indique si les variables sont injectées
// (booléens seulement, aucune valeur exposée) et quel commit est déployé.
module.exports = (req, res) => {
  res.status(200).json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    brevo: !!process.env.BREVO_API_KEY,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "inconnu").slice(0, 7),
    env: process.env.VERCEL_ENV || "inconnu"
  });
};
