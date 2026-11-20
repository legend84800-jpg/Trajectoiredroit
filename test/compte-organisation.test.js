const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const produits = require('../api/_produits');
const { construireLiensTelechargement, genererToken } = require('../api/_liens-telechargement');

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
  const ids = ['etatChargement', 'etatConnexion', 'etatConnecte', 'connexionForm', 'connexionEmail', 'connexionSubmit', 'connexionError', 'connexionSuccess', 'compteEmail', 'deconnexionBtn', 'achatsListe', 'achatsVide', 'achatsReessayer', 'resterConnecte', 'codeForm', 'connexionCode', 'codeSubmit', 'codeDestinataire', 'renvoyerCode', 'changerEmail', 'achatsOutils', 'achatsRecherche', 'achatsProduit', 'achatsSemestre', 'achatsReinitialiser', 'achatsResultat'];
  const elements = {};
  for (const id of ids) {
    if (options.ancienHtml && id === 'achatsReessayer') continue;
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

const panneServeur = { ok: false, status: 500 };
const reponseAchats = (achats = historique()) => ({ ok: true, status: 200, json: async () => ({ achats }) });

test('après un échec, la relance de Mes documents réutilise la session et bloque un deuxième clic', async () => {
  const attente = differe();
  let nombre = 0;
  const b = navigateur({ fetch: () => ++nombre === 1 ? panneServeur : attente.promise });
  await b.flush();
  const { achatsReessayer, achatsVide, etatConnecte, achatsListe } = b.elements;
  assert.equal(achatsVide.textContent, 'Le chargement de tes documents a échoué.');
  assert.equal(achatsReessayer.hidden, false);
  assert.equal(achatsReessayer.disabled, false);
  assert.ok(etatConnecte.classList.contains('is-active'));

  const chargement = achatsReessayer.listeners.click();
  achatsReessayer.listeners.click();
  assert.equal(achatsVide.textContent, 'Chargement des documents…');
  assert.equal(achatsReessayer.disabled, true);
  assert.equal(b.demandes.length, 2);
  assert.deepEqual(b.demandes[1], b.demandes[0]);
  assert.equal(b.demandes[1].url, '/api/mes-telechargements');

  attente.resolve(reponseAchats());
  await chargement;
  assert.match(achatsListe.innerHTML, /Pack Ultra L2 S1/);
  assert.equal(achatsVide.style.display, 'none');
  assert.equal(achatsReessayer.hidden, true);
  achatsReessayer.listeners.click();
  assert.equal(b.demandes.length, 2);
});

test('une panne persistante rend le bouton disponible pour une nouvelle tentative', async () => {
  let nombre = 0;
  const b = navigateur({ fetch: async () => {
    if (++nombre === 2) throw new Error('Réseau indisponible');
    return nombre < 3 ? panneServeur : reponseAchats([]);
  } });
  await b.flush();
  await b.elements.achatsReessayer.listeners.click();
  assert.equal(b.elements.achatsReessayer.hidden, false);
  assert.equal(b.elements.achatsReessayer.disabled, false);
  assert.equal(b.elements.achatsVide.textContent, 'Le chargement de tes documents a échoué.');

  await b.elements.achatsReessayer.listeners.click();
  assert.equal(b.demandes.length, 3);
  assert.equal(b.elements.achatsReessayer.hidden, true);
  assert.equal(b.elements.achatsVide.textContent, "Aucun achat pour l'instant.");
  assert.equal(b.elements.achatsVide.style.display, 'block');
});

test('la page antérieure charge toujours ses documents sans le nouveau bouton', async () => {
  const b = navigateur({ ancienHtml: true });
  await b.flush();
  assert.equal(b.elements.achatsReessayer, undefined);
  assert.match(b.elements.achatsListe.innerHTML, /Pack Ultra L2 S1/);
  assert.equal(b.elements.achatsVide.style.display, 'none');

  const enPanne = navigateur({ ancienHtml: true, fetch: () => panneServeur });
  await enPanne.flush();
  assert.ok(enPanne.elements.etatConnecte.classList.contains('is-active'));
  assert.equal(enPanne.elements.achatsVide.textContent, 'Le chargement de tes documents a échoué.');
});

test('une session expirée pendant le réessai retourne à la connexion', async () => {
  let nombre = 0;
  const b = navigateur({ fetch: () => ++nombre === 1 ? panneServeur : { ok: false, status: 401 } });
  await b.flush();
  await b.elements.achatsReessayer.listeners.click();
  assert.ok(b.elements.etatConnexion.classList.contains('is-active'));
  assert.match(b.elements.connexionError.textContent, /session a expiré/);
  assert.equal(b.elements.achatsReessayer.hidden, true);
  b.elements.achatsReessayer.listeners.click();
  assert.equal(b.demandes.length, 2);
});

test('la réponse du réessai en cours est ignorée après une déconnexion ou un changement de compte', async () => {
  for (const changerCompte of [false, true]) {
    const attente = differe();
    let nombre = 0;
    const b = navigateur({ fetch: () => {
      ++nombre;
      if (nombre === 1) return panneServeur;
      if (nombre === 2) return attente.promise;
      return reponseAchats([]);
    } });
    await b.flush();
    const chargement = b.elements.achatsReessayer.listeners.click();
    await b.elements.deconnexionBtn.listeners.click();
    if (changerCompte) {
      b.evenement('SIGNED_IN', { access_token: 'autre-jeton-factice' });
      await b.flush();
    }
    attente.resolve(reponseAchats());
    await chargement;
    assert.equal(b.elements.achatsListe.innerHTML, '');
    assert.equal(b.elements.achatsReessayer.hidden, true);
    b.elements.achatsReessayer.listeners.click();
    assert.equal(b.demandes.length, changerCompte ? 3 : 2);
  }
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

test('Mon compte montre le guide Anki près des seuls téléchargements .apkg', async () => {
  const secret = 'secret-de-test';
  const sessionId = 'cs_test_anki_42';
  const produitsAchetes = [
    'flashcards-qcm-contrats-l2-s1',
    'pack-flashcards-qcm-l2',
    'pack-ultra-l2-s1',
    'pack-partiel-l2-s1',
    'pack-kit-partiels-l2--administratif-s1--contrats--penal',
    'fiche-contrats-l2-s1',
  ].map(id => {
    const produit = produits[id];
    const fichiers = construireLiensTelechargement(id, produit, secret, 'https://trajectoiredroit.com', 900, { sessionId });
    for (const [index, fichier] of fichiers.entries()) {
      const extension = produit.blobs[index].split('.').at(-1);
      assert.equal(fichier.format, extension === 'apkg' ? 'apkg' : undefined);
      assert.equal(fichier.type, { mp4: 'video', m4a: 'audio' }[extension] || 'pdf');
      if (fichier.format !== 'apkg') continue;
      const url = new URL(fichier.url);
      const expiration = Number(url.searchParams.get('exp'));
      assert.equal(url.searchParams.get('sid'), sessionId);
      assert.equal(url.searchParams.get('sig'), genererToken(id, index, expiration, secret, sessionId));
    }
    return { id, nom: produit.nom, fichiers };
  });
  const b = navigateur({ achats: [{ date: '2026-11-19', produits: produitsAchetes }] });
  await b.flush();
  const rendu = b.elements.achatsListe.innerHTML;
  const paquets = produitsAchetes.flatMap(p => p.fichiers.filter(fichier => fichier.format === 'apkg'));
  assert.equal(paquets.length, 15);
  const liensAnki = Array.from(rendu.matchAll(/href="([^"]+)"[^>]*>Télécharger [^<>]+<\/a><a [^>]*href="flashcards-qcm\.html#importer-anki"[^>]*>Importer les cartes dans Anki<\/a>/g), m => m[1]);
  assert.deepEqual(liensAnki, paquets.map(fichier => fichier.url));
  assert.match(rendu, /<audio controls/);
  assert.match(rendu, /<video controls/);

  const guide = fs.readFileSync(path.join(__dirname, '../flashcards-qcm.html'), 'utf8');
  assert.match(guide, /<div class="accordion__body" id="importer-anki"[^>]*>\s*<p><strong>Sur ordinateur<\/strong>[^<]+\.apkg/);
  assert.equal((guide.match(/id="importer-anki"/g) || []).length, 1);
});
