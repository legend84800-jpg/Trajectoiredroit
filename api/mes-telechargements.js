// Accès à vie en self-service (vague 2.16) : régénère des liens de téléchargement
// signés à la demande depuis l'espace compte, plutôt que de dépendre du lien 48h
// envoyé une seule fois par email. Reçoit { accessToken } (session Supabase du front),
// vérifié serveur pour ne retourner que les achats du titulaire réel de cet email.

const PRODUITS = require("./_produits");
const { utilisateurDepuisJWT, selectionner } = require("./_supabase");
const { construireLiensTelechargement } = require("./_liens-telechargement");

const DUREE_LIEN_SECONDES = 15 * 60;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://trajectoiredroit.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erreur: "Méthode non autorisée" }); return; }

  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  corps = corps || {};

  const accessToken = typeof corps.accessToken === "string" ? corps.accessToken.trim() : "";
  if (!accessToken) { res.status(401).json({ erreur: "Non connecté" }); return; }

  const downloadSecret = process.env.DOWNLOAD_SECRET;
  if (!downloadSecret) { res.status(500).json({ erreur: "Configuration manquante" }); return; }

  let utilisateur;
  try {
    utilisateur = await utilisateurDepuisJWT(accessToken);
  } catch (e) {
    console.error("mes-telechargements erreur JWT:", e.message);
    res.status(500).json({ erreur: "Erreur interne" });
    return;
  }
  if (!utilisateur || !utilisateur.email) { res.status(401).json({ erreur: "Session invalide" }); return; }

  const origin = "https://trajectoiredroit.com";

  let lignes;
  try {
    lignes = await selectionner(
      "achats",
      `email=eq.${encodeURIComponent(utilisateur.email)}&select=produit_ids,cree_le,session_id&order=cree_le.desc`
    );
  } catch (e) {
    console.error("mes-telechargements erreur Supabase:", e.message);
    res.status(500).json({ erreur: "Erreur interne" });
    return;
  }

  const achats = lignes.map((ligne) => {
    const produits = (ligne.produit_ids || [])
      .map((id) => {
        const produit = PRODUITS[id];
        if (!produit) return null;
        return {
          id,
          nom: produit.nom,
          fichiers: construireLiensTelechargement(id, produit, downloadSecret, origin, DUREE_LIEN_SECONDES),
        };
      })
      .filter(Boolean);
    return { date: ligne.cree_le, sessionId: ligne.session_id, produits };
  });

  res.status(200).json({ achats });
};
