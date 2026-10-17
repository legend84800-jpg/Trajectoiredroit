// Les montants et les offres restent déterminés par le catalogue du serveur.
const NOMS = ['atelierFunnelId','atelierStepId','atelierVariantId','affiliateClickId','affiliateCampaignId','affiliatePartnerId'];
module.exports = function attributionAtelier(corps = {}) {
  const result = { atelierBrand: 'tjd' };
  if (corps.utm_source !== 'atelier-conversion') return result;
  for (const name of NOMS) {
    const value = corps[name];
    if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value)) result[name] = value;
  }
  return result;
};
