const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/compte.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function differe() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function historique() {
  return [
    { date: '2026-10-20T12:00:00Z', produits: [{ id: 'pack-ultra-l2-s1', nom: 'Pack Ultra L2 S1', fichiers: [
      { nom: 'La formation du contrat', groupe: 'Droit des contrats', url: 'https://example.invalid/contrats.pdf' },
      { nom: 'Le contrat en vidéo', groupe: 'Droit des contrats', type: 'video', url: 'https://example.invalid/contrats.mp4' },
      { nom: 'La règle de droit en audio', groupe: 'Droit administratif', type: 'audio', url: 'https://example.invalid/admin.m4a' },
    ] }] },
    { date: '2026-10-10T12:00:00Z', produits: [{ id: 'fiche-droit-personnes', nom: 'Droit des personnes', fichiers: [
      { nom: 'La personnalité juridique', url: 'https://example.invalid/personnes.pdf' },
    ] }] },
    { date: '2026-10-01T12:00:00Z', produits: [{ id: 'pack-annuel', nom: 'Pack annuel de fiches', fichiers: [
      { nom: 'Fiche de droit S1', url: 'https://example.invalid/annuel-s1.pdf' },
      { nom: 'Fiche de droit semestre 2', url: 'https://example.invalid/annuel-s2.pdf' },
    ] }] },
  ];
}
function navigateur(options = {}) {
  const ids = ['etatChargement', 'etatConnexion', 'etatConnecte', 'connexionForm', 'connexionEmail', 'connexionSubmit', 'connexionError', 'connexionSuccess', 'compteEmail', 'deconnexionBtn', 'achatsListe', 'achatsVide', 'resterConnecte', 'codeForm', 'connexionCode', 'codeSubmit', 'codeDestinataire', 'renvoyerCode', 'changerEmail', 'achatsOutils', 'achatsRecherche', 'achatsProduit', 'achatsSemestre', 'achatsReinitialiser', 'achatsResultat'];
  const elements = {};
  for (const id of ids) {
    const classes = new Set();
    elements[id] = { style: {}, textContent: '', innerHTML: '', value: '', hidden: true, listeners: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
      addEventListener(event, fn) { this.listeners[event] = fn; }, focus() {},
    };
  }
  const timers = [];
  const demandes = [];
  let callback;
  const stockage = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
  const auth = {
    getSession: async () => ({ data: { session: { access_token: 'jeton-factice' } } }),
    getUser: async () => ({ data: { user: { email: 'apercu@example.invalid', email_confirmed_at: '2026-10-01', is_anonymous: false } } }),
    onAuthStateChange(fn) { callback = fn; },
    signOut: async () => { callback('SIGNED_OUT', null); return {}; },
  };
  const achats = options.achats || historique();
  const window = { supabase: { createClient: () => ({ auth }) }, localStorage: stockage(), sessionStorage: stockage(), setTimeout: fn => { timers.push(fn); }, location: { search: '' } };
  vm.runInNewContext(source, { window, document: { getElementById: id => elements[id] || null }, Date, URLSearchParams,
    fetch: async (url, req) => { demandes.push({ url, req }); return options.fetch ? options.fetch(url, req) : { ok: true, status: 200, json: async () => ({ achats }) }; },
  });
  return {
    elements, demandes,
    async flush() { await tick(); for (const fn of timers.splice(0)) fn(); await tick(); },
    evenement: (type, session) => callback(type, session),
    chercher(value) { elements.achatsRecherche.value = value; elements.achatsRecherche.listeners.input(); },
    filtrer(id, value) { elements[id].value = value; elements[id].listeners.change(); },
    effacer() { elements.achatsReinitialiser.listeners.click(); },
  };
}

test('le compte garde les achats datés, les groupes et les lecteurs existants', async () => {
  const b = navigateur(); await b.flush();
  const rendu = b.elements.achatsListe.innerHTML;
  assert.match(rendu, /Pack Ultra L2 S1/);
  assert.match(rendu, /Droit des personnes/);
  assert.match(rendu, /20\/10\/2026/);
  assert.match(rendu, /<summary>Droit des contrats<\/summary>/);
  assert.equal((rendu.match(/<video /g) || []).length, 1);
  assert.equal((rendu.match(/<audio /g) || []).length, 1);
  assert.equal(b.elements.achatsResultat.textContent, '3 achats affichés sur 3');
  assert.equal(b.elements.achatsOutils.hidden, false);
});

test('la recherche ignore les accents et cherche tous les mots dans un groupe du Pack Ultra', async () => {
  const b = navigateur(); await b.flush(); b.chercher('CONTRATS video');
  const rendu = b.elements.achatsListe.innerHTML;
  assert.match(rendu, /contrats.mp4/);
  assert.doesNotMatch(rendu, /contrats.pdf|admin.m4a|personnes.pdf/);
  assert.equal(b.elements.achatsResultat.textContent, '1 achat affiché sur 3');
});

test('le filtre de matière réduit les fichiers du Pack Ultra sans perdre leur groupe', async () => {
  const b = navigateur(); await b.flush(); b.filtrer('achatsProduit', 'Droit administratif');
  assert.match(b.elements.achatsListe.innerHTML, /<summary>Droit administratif<\/summary>/);
  assert.match(b.elements.achatsListe.innerHTML, /admin.m4a/);
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /contrats.pdf|personnes.pdf/);
});

test('le semestre provient du nom ou de l’identifiant, et distingue les fichiers d’un pack annuel', async () => {
  const b = navigateur(); await b.flush(); b.filtrer('achatsSemestre', '2');
  assert.match(b.elements.achatsListe.innerHTML, /annuel-s2.pdf/);
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /annuel-s1.pdf|contrats.pdf|personnes.pdf/);
  b.filtrer('achatsSemestre', 'non-precise');
  assert.match(b.elements.achatsListe.innerHTML, /personnes.pdf/);
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /annuel-s1.pdf|annuel-s2.pdf|contrats.pdf/);
});

test('les filtres se combinent et leur remise à zéro restaure l’historique intact', async () => {
  const achats = historique(); const copie = JSON.stringify(achats);
  const b = navigateur({ achats }); await b.flush(); const initial = b.elements.achatsListe.innerHTML;
  b.filtrer('achatsProduit', 'Droit des contrats'); b.filtrer('achatsSemestre', '1'); b.chercher('formation');
  assert.match(b.elements.achatsListe.innerHTML, /contrats.pdf/);
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /contrats.mp4|admin.m4a/);
  b.effacer();
  assert.equal(b.elements.achatsListe.innerHTML, initial);
  assert.equal(JSON.stringify(achats), copie);
  assert.equal(b.demandes.length, 1);
});

test('une recherche vide de résultats affiche une aide sans confondre absence d’achat et filtre', async () => {
  const b = navigateur(); await b.flush(); b.chercher('matiere-inexistante');
  assert.equal(b.elements.achatsListe.innerHTML, '');
  assert.match(b.elements.achatsVide.textContent, /correspond à ces filtres/);
  assert.equal(b.elements.achatsResultat.textContent, '0 achats affichés sur 3');
  b.effacer(); assert.equal(b.elements.achatsVide.style.display, 'none');
});

test('la déconnexion efface aussi les filtres et les achats conservés pour la recherche', async () => {
  const b = navigateur(); await b.flush(); b.chercher('contrats');
  await b.elements.deconnexionBtn.listeners.click(); b.chercher('personnes');
  assert.equal(b.elements.achatsListe.innerHTML, '');
  assert.equal(b.elements.achatsOutils.hidden, true);
  assert.equal(b.elements.achatsProduit.innerHTML, '');
  assert.equal(b.elements.achatsResultat.textContent, '');
});

test('une réponse tardive ne remplit ni l’historique ni les nouveaux filtres après déconnexion', async () => {
  const attente = differe(); const b = navigateur({ fetch: () => attente.promise }); await b.flush();
  await b.elements.deconnexionBtn.listeners.click();
  attente.resolve({ ok: true, status: 200, json: async () => ({ achats: historique() }) });
  await b.flush(); b.chercher('contrats');
  assert.equal(b.elements.achatsListe.innerHTML, '');
  assert.equal(b.elements.achatsOutils.hidden, true);
  assert.equal(b.elements.achatsProduit.innerHTML, '');
});

test('un changement de compte remplace les choix et efface les recherches du compte précédent', async () => {
  let passage = 0;
  const b = navigateur({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ achats: passage++ ? [{ date: '2026-10-01', produits: [{ nom: 'Ressource du second compte', fichiers: [] }] }] : historique() }) }) });
  await b.flush(); b.chercher('contrats'); b.evenement('SIGNED_IN', { access_token: 'autre-jeton-factice' }); await b.flush();
  assert.equal(b.elements.achatsRecherche.value, '');
  assert.match(b.elements.achatsListe.innerHTML, /Ressource du second compte/);
  assert.doesNotMatch(b.elements.achatsProduit.innerHTML, /Pack Ultra|Droit des personnes/);
});

test('les noms utilisés dans les options sont échappés', async () => {
  const b = navigateur({ achats: [{ date: '2026-10-01', produits: [{ nom: 'Cours <script> & "copie"', fichiers: [] }] }] });
  await b.flush();
  assert.match(b.elements.achatsProduit.innerHTML, /&lt;script&gt; &amp; &quot;copie&quot;/);
  assert.doesNotMatch(b.elements.achatsProduit.innerHTML, /<script>/);
});
