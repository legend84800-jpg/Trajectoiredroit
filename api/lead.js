// Fonction serverless Vercel — capture d'email vers Brevo depuis l'assistant.
// La clé Brevo reste côté serveur (variable d'environnement BREVO_API_KEY).
// BREVO_LIST_ID (optionnel) range le contact dans une liste précise.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Configuration manquante." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const email = (body.email || "").trim().toLowerCase();
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "assistant-chat";

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "Email invalide." });
      return;
    }

    const payload = {
      email,
      updateEnabled: true,
      attributes: { SOURCE: source },
    };
    const listId = parseInt(process.env.BREVO_LIST_ID || "", 10);
    if (!Number.isNaN(listId)) payload.listIds = [listId];

    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": apiKey,
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    // 201 = créé, 204 = mis à jour. Un contact déjà présent n'est pas une erreur.
    if (brevoRes.ok || brevoRes.status === 204) {
      res.status(200).json({ ok: true });
      return;
    }

    const detail = await brevoRes.json().catch(() => ({}));
    if (detail && detail.code === "duplicate_parameter") {
      res.status(200).json({ ok: true });
      return;
    }

    console.error("Brevo error:", brevoRes.status, detail);
    res.status(502).json({ error: "Inscription impossible pour le moment." });
  } catch (err) {
    console.error("lead handler error:", err);
    res.status(500).json({ error: "Une erreur est survenue." });
  }
}
