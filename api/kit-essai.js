const { KIT } = require("./_essai-majeures");

module.exports = function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  // Les liens des anciens emails restent utilisables avec le PDF actuel.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", KIT);
  return res.status(302).end();
};
