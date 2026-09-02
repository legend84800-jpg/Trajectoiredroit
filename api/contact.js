// Endpoint serverless Vercel — reçoit les demandes de cours particulier et
// les inscriptions au stage, envoie un email transactionnel à Julien via
// l'API Brevo. Fusion de contact-cours.js et contact-stage.js pour rester
// sous la limite de 12 fonctions serverless du plan Vercel Hobby.

const ORIGINE_AUTORISEE = 'trajectoiredroit.com';

function origineValide(req) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || req.headers.referrer || '';
  if (origin) return origin.includes(ORIGINE_AUTORISEE);
  if (referer) return referer.includes(ORIGINE_AUTORISEE);
  return false;
}

function echapperHtml(valeur) {
  return String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tronquer(valeur, max) {
  return valeur.length > max ? valeur.slice(0, max) : valeur;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Configuration manquante.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

  // Honeypot : champ invisible pour un humain, quasi toujours rempli par un bot
  // qui poste directement sur l'API sans jamais afficher le vrai formulaire.
  // On répond 200 sans rien envoyer, pour ne pas révéler le piège au bot.
  if (String(body.site_web || '').trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  // Rejette toute requête qui ne vient pas du vrai formulaire du site (bot qui
  // poste en direct sur l'endpoint, jamais un Origin/Referer trajectoiredroit.com).
  if (!origineValide(req)) {
    return res.status(403).json({ error: 'Origine non autorisée.' });
  }

  const type = body.type === 'stage' ? 'stage' : 'cours';

  // Un seul \n possible dans les champs sur une ligne (nom, email, whatsapp, niveau,
  // formule) : sans ça une valeur avec retour à la ligne peut injecter un en-tête
  // ou un sujet d'email arbitraire.
  const uneLigneSansSaut = (valeur) => valeur.replace(/[\r\n]+/g, ' ').trim();

  const nom      = tronquer(uneLigneSansSaut(String(body.nom      || '')), 200) || '(non renseigné)';
  const emailBrut = tronquer(uneLigneSansSaut(String(body.email   || '')), 200);
  const whatsapp = tronquer(uneLigneSansSaut(String(body.whatsapp || '')), 50) || '(non renseigné)';
  const niveau   = tronquer(uneLigneSansSaut(String(body.niveau   || '')), 100) || '(non renseigné)';
  const message  = tronquer(String(body.message  || '').trim(), 4000) || '(aucun message)';

  const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBrut);
  const email = emailValide ? emailBrut : '';

  const subject = type === 'stage'
    ? `Nouvelle inscription stage — ${nom}`
    : `Nouvelle demande de cours — ${nom}`;

  const titre = type === 'stage'
    ? 'Nouvelle demande d\'inscription au stage'
    : 'Nouvelle demande de cours particulier';

  const rows = [
    ['Nom', echapperHtml(nom)],
    ['Email', email ? `<a href="mailto:${echapperHtml(email)}">${echapperHtml(email)}</a>` : echapperHtml(emailBrut) || '(non renseigné)'],
    ['WhatsApp', echapperHtml(whatsapp)],
    ['Niveau', echapperHtml(niveau)],
  ];

  if (type === 'cours') {
    const formule = tronquer(uneLigneSansSaut(String(body.formule || '')), 100) || '(non renseignée)';
    rows.push(['Formule', echapperHtml(formule)]);
  }

  rows.push(['Message', echapperHtml(message).replace(/\n/g, '<br>')]);

  const replyToDefaut = type === 'cours' ? 'contact@trajectoiredroit.com' : 'julien.prof1@gmail.com';

  const emailPayload = {
    sender:  { name: 'TrajectoireDroit', email: 'julien.prof1@gmail.com' },
    to:      [{ email: 'julien.prof1@gmail.com', name: 'Julien' }],
    replyTo: { email: email || replyToDefaut, name: nom },
    subject,
    htmlContent: `
      <h2>${titre}</h2>
      <table style="border-collapse:collapse; width:100%; max-width:600px">
        ${rows.map(([label, value], i) => `<tr><td style="padding:8px 12px; font-weight:bold; background:#f4f4f4${i === rows.length - 1 ? '; vertical-align:top' : ''}">${label}</td><td style="padding:8px 12px">${value}</td></tr>`).join('\n        ')}
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
