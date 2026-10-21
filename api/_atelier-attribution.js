// Les montants et les offres restent déterminés par le catalogue du serveur.
const NOMS = ['atelierFunnelId','atelierStepId','atelierVariantId','affiliateClickId','affiliateCampaignId','affiliatePartnerId'];
module.exports = function attributionAtelier(corps = {}) {
  const result = { atelierBrand: 'tjd' };
  if (typeof corps.comportementReceipt === 'string' && /^acb3\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.\d{10}\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(corps.comportementReceipt)) {
    result.comportementReceipt = corps.comportementReceipt;
  }
  if (corps.utm_source !== 'atelier-conversion') return result;
  for (const name of NOMS) {
    const value = corps[name];
    if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value)) result[name] = value;
  }
  return result;
};
