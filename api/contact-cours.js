// Endpoint serverless Vercel — reçoit les demandes de cours particulier et
// envoie un email transactionnel à Julien via l'API Brevo.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Configuration manquante.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const nom     = String(body.nom     || '').trim() || '(non renseigné)';
  const email   = String(body.email   || '').trim();
  const niveau  = String(body.niveau  || '').trim() || '(non renseigné)';
  const formule = String(body.formule || '').trim() || '(non renseignée)';
  const message = String(body.message || '').trim() || '(aucun message)';

  const emailPayload = {
    sender:  { name: 'TrajectoireDroit', email: 'julien.prof1@gmail.com' },
    to:      [{ email: 'julien.prof1@gmail.com', name: 'Julien' }],
    replyTo: { email: email || 'contact@trajectoiredroit.com', name: nom },
    subject: `Nouvelle demande de cours — ${nom}`,
    htmlContent: `
      <h2>Nouvelle demande de cours particulier</h2>
      <table style="border-collapse:collapse; width:100%; max-width:600px">
        <tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4">Nom</td><td style="padding:8px 12px">${nom}</td></tr>
        <tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4">Email</td><td style="padding:8px 12px"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4">Niveau</td><td style="padding:8px 12px">${niveau}</td></tr>
        <tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4">Formule</td><td style="padding:8px 12px">${formule}</td></tr>
        <tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4; vertical-align:top">Message</td><td style="padding:8px 12px">${message.replace(/\n/g, '<br>')}</td></tr>
      </table>
    `,
  };

  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': apiKey,
        accept: 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (brevoRes.ok) {
      return res.status(200).json({ ok: true });
    }

    const detail = await brevoRes.json().catch(() => ({}));
    console.error('Brevo SMTP error:', brevoRes.status, detail);
    return res.status(502).json({ error: 'Envoi impossible pour le moment.' });
  } catch (err) {
    console.error('contact-cours handler error:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
