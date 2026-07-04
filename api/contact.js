// Endpoint serverless Vercel — reçoit les demandes de cours particulier et
// les inscriptions au stage, envoie un email transactionnel à Julien via
// l'API Brevo. Fusion de contact-cours.js et contact-stage.js pour rester
// sous la limite de 12 fonctions serverless du plan Vercel Hobby.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Configuration manquante.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const type = body.type === 'stage' ? 'stage' : 'cours';

  const nom      = String(body.nom      || '').trim() || '(non renseigné)';
  const email    = String(body.email    || '').trim();
  const whatsapp = String(body.whatsapp || '').trim() || '(non renseigné)';
  const niveau   = String(body.niveau   || '').trim() || '(non renseigné)';
  const message  = String(body.message  || '').trim() || '(aucun message)';

  const subject = type === 'stage'
    ? `Nouvelle inscription stage — ${nom}`
    : `Nouvelle demande de cours — ${nom}`;

  const titre = type === 'stage'
    ? 'Nouvelle demande d\'inscription au stage'
    : 'Nouvelle demande de cours particulier';

  const rows = [
    ['Nom', nom],
    ['Email', `<a href="mailto:${email}">${email}</a>`],
    ['WhatsApp', whatsapp],
    ['Niveau', niveau],
  ];

  if (type === 'cours') {
    const formule = String(body.formule || '').trim() || '(non renseignée)';
    rows.push(['Formule', formule]);
  }

  rows.push(['Message', message.replace(/\n/g, '<br>')]);

  const emailPayload = {
    sender:  { name: 'TrajectoireDroit', email: 'julien.prof1@gmail.com' },
    to:      [{ email: 'julien.prof1@gmail.com', name: 'Julien' }],
    replyTo: { email: email || 'julien.prof1@gmail.com', name: nom },
    subject,
    htmlContent: `
      <h2>${titre}</h2>
      <table style="border-collapse:collapse; width:100%; max-width:600px">
        ${rows.map(([label, value]) => `<tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4; vertical-align:top">${label}</td><td style="padding:8px 12px">${value}</td></tr>`).join('\n        ')}
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
    console.error('contact handler error:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
