const test=require('node:test');
const assert=require('node:assert/strict');
const attribution=require('../api/_atelier-attribution');
test('La marque Checkout appartient au serveur et les champs non déclarés restent exclus',()=>{
  assert.deepEqual(attribution({atelierBrand:'philo',amount:1,affiliateClickId:'abc'}),{atelierBrand:'tjd'});
  assert.deepEqual(attribution({utm_source:'atelier-conversion',atelierBrand:'philo',atelierFunnelId:'parcours-1',affiliateClickId:'clic-2',affiliatePartnerId:'<script>',price:1}),{atelierBrand:'tjd',atelierFunnelId:'parcours-1',affiliateClickId:'clic-2'});
  assert.equal(attribution({utm_source:'atelier-conversion',atelierFunnelId:'x'.repeat(121)}).atelierFunnelId,undefined);
});
test('Les seules routes publiques Atelier traversent la passerelle, les API existantes restent sur le site',()=>{
 const config=require('../vercel.json');
 assert.deepEqual(config.rewrites.map(r=>r.source),['/f/:path*','/public/:path*','/learn/:path*','/members/:path*','/r/:path*']);
 for(const r of config.rewrites)assert.equal(r.destination,'https://stats.trajectoiredroit.com'+r.source);
 assert.ok(!config.rewrites.some(r=>r.source.startsWith('/api') || r.source==='/(.*)'));
});
