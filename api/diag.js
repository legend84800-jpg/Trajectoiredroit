module.exports = (req, res) => {
  res.status(200).json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    brevo: !!process.env.BREVO_API_KEY,
    diag_test: process.env.DIAG_TEST || null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "inconnu").slice(0, 7),
    env: process.env.VERCEL_ENV || "inconnu"
  });
};
