// Tâche planifiée quotidienne de relance des inscrits du corrigé offert (vercel.json, crons).
// Détail du mécanisme dans _relance-recueil.js.
//   GET  avec l'en-tête Authorization: Bearer CRON_SECRET  -> passage réel ;
//   GET  ...&essai=1 (même en-tête)                         -> bilan sans rien écrire ni envoyer ;
//   GET  ?stop=<jeton>                                      -> page de désinscription (bouton) ;
//   POST ?stop=<jeton>                                      -> désinscription confirmée.
// La désinscription passe par un bouton, car les antivirus de messagerie ouvrent parfois les liens
// d'un email tout seuls : un simple GET désinscrirait l'étudiant sans qu'il l'ait voulu.

const { passer, lireJetonStop, brevo } = require("./_relance-recueil");

// Textes passés par redaction-julien le 15/11/2026.
function page(titre, corps) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>' + titre + ' · Trajectoire Droit</title></head>'
    + '<body style="font:17px Arial,sans-serif;line-height:1.6;max-width:520px;margin:48px auto;padding:0 18px;color:#1F1F1F;background:#fff">'
    + corps + "</body></html>";
}
const masquer = e => e.replace(/^(.).*?(@.*)$/, "$1***$2");

async function handler(req, res) {
  const q = req.query || {};
  const secret = process.env.CRON_SECRET;
  try {
    if (q.stop) {
      const email = lireJetonStop(q.stop, secret);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (!email) {
        res.status(400).send(page("Lien expiré", "<p>Ce lien de désinscription ne fonctionne plus. Réponds à mon dernier email avec le mot stop, et je retire ton adresse moi-même.</p>"));
        return;
      }
      if (req.method === "POST") {
        await brevo(process.env.BREVO_API_KEY).bloquer(email);
        res.status(200).send(page("Désinscription", "<p>C'est fait. L'adresse " + masquer(email) + " est retirée de mes envois, et tu ne recevras plus mes emails.</p><p>Julien, Trajectoire Droit</p>"));
        return;
      }
      res.status(200).send(page("Désinscription",
        "<p>Le bouton ci-dessous retire l'adresse " + masquer(email) + " de mes envois. Tu ne recevras plus aucun email de Trajectoire Droit.</p>"
        + '<form method="post"><button type="submit" style="font:bold 16px Arial;padding:12px 20px;background:#1A2851;color:#fff;border:0;border-radius:8px;cursor:pointer">Me désinscrire</button></form>'));
      return;
    }
    if (!secret || (req.headers && req.headers.authorization) !== `Bearer ${secret}`) {
      res.status(401).json({ erreur: "Non autorisé" });
      return;
    }
    const bilan = await passer({ essai: q.essai === "1" });
    console.log("relance-recueil", JSON.stringify(bilan));
    res.status(200).json(bilan);
  } catch (e) {
    console.error("relance-recueil:", e && e.message ? e.message : e);
    res.status(500).json({ erreur: "Passage impossible" });
  }
}

module.exports = handler;
