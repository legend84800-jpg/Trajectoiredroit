const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const PRODUITS = require('../api/_produits');
const { construireInclusionsPanier } = require('../scripts/generer-inclusions-panier');

const source = fs.readFileSync(require.resolve('../assets/js/achat.js'), 'utf8');
const scenario = source.replace(/\}\)\(\);\s*$/, `
  panierRafraichir = function () {};
  window.panier = { ajouter: panierAjouter, lire: panierLire, rendre: panierRendreListe, payer: panierCheckout };
})();`);
assert.notEqual(scenario, source);
const pack = 'pack-matiere-da-l2';
const fiche = 'fiche-da-l2-s1';
const autreFiche = 'fiche-contrats-l2-s1';
const donnees = construireInclusionsPanier(PRODUITS);
const erreurReseau = () => { throw new Error('Réseau indisponible'); };
const viderMicrotaches = () => new Promise(setImmediate);

function bouton(id, inclus = false) {
  return {
    disabled: false,
    getAttribute(nom) { return nom === 'data-tjd-panier-retirer' ? id : null; },
    hasAttribute(nom) { return inclus && nom === 'data-tjd-panier-retrait-inclus'; },
    addEventListener(nom, action) { if (nom === 'click') this.action = action; },
  };
}

function navigateur(reponse = () => ({ ok: true, json: async () => donnees })) {
  const requetes = [];
  const lignes = new Map();
  const elements = {
    tjdPanierListe: {
      set innerHTML(html) {
        lignes.clear();
        for (const resultat of html.matchAll(/data-tjd-panier-inclusion="([^"]+)"/g)) {
          const id = resultat[1];
          const titre = { textContent: '' };
          const retrait = bouton(id);
          const bloc = {
            html: '',
            retrait: null,
            parentElement: { querySelector: () => titre },
            getAttribute: () => id,
            set innerHTML(nouvelleNote) {
              this.html = nouvelleNote;
              this.retrait = bouton(id, true);
            },
            querySelectorAll: () => bloc.retrait ? [bloc.retrait] : [],
          };
          lignes.set(id, { titre, bloc, retrait });
        }
      },
      querySelectorAll(selecteur) {
        const articles = [...lignes.values()];
        return selecteur === '[data-tjd-panier-inclusion]'
          ? articles.map(({ bloc }) => bloc)
          : articles.flatMap(({ retrait, bloc }) => [retrait, ...bloc.querySelectorAll()]);
      },
    },
    tjdPanierCta: { disabled: false, getAttribute: () => null, focus() { this.aLeFocus = true; } },
    tjdPanierTotal: { hidden: true },
    tjdPanierTotalMontant: { textContent: '' },
  };
  const valeurs = new Map();
  const stockage = {
    getItem: (cle) => valeurs.get(cle) || null,
    setItem: (cle, valeur) => valeurs.set(cle, valeur),
    removeItem: (cle) => valeurs.delete(cle),
  };
  const document = {
    addEventListener() {}, readyState: 'loading', cookie: '', referrer: '',
    documentElement: { clientWidth: 390, clientHeight: 800 },
    querySelectorAll: () => [],
    getElementById: (id) => elements[id],
  };
  const window = {
    location: {
      search: '', hostname: 'trajectoiredroit.com', protocol: 'https:',
      pathname: '/droit-administratif-l2.html', hash: '', assign() {},
    },
    innerWidth: 390, innerHeight: 800,
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' },
  };
  const fetch = async (url, options) => {
    requetes.push({ url, options });
    if (url === '/assets/panier-inclusions.json') return reponse();
    assert.equal(url, '/api/create-checkout');
    return { ok: true, json: async () => ({ url: 'https://example.invalid/checkout' }) };
  };
  vm.runInNewContext(scenario, { window, document, URLSearchParams, localStorage: stockage, sessionStorage: stockage, fetch });
  return {
    elements, lignes, requetes, panier: window.panier,
    ajouter(id) { window.panier.ajouter(id, 'Titre capté sur la page', PRODUITS[id].prix); },
    ids: () => Array.from(window.panier.lire(), ({ id }) => id),
  };
}

test('le catalogue ne publie que les inclusions strictes et des intitulés', () => {
  const fichiers = {
    'pack-exemple': { nom: 'Pack exemple', blobs: ['a.pdf', 'b.pdf', 'c.pdf'] },
    'fiche-incluse': { nom: 'Fiche incluse', blobs: ['a.pdf', 'b.pdf'] },
    'fiche-partielle': { nom: 'Fiche partielle', blobs: ['a.pdf', 'x.pdf'] },
    'pack-identique': { nom: 'Pack identique', blobs: ['a.pdf', 'b.pdf', 'c.pdf'] },
    'fiche-vide': { nom: 'Fiche vide', blobs: [] },
    'fiche-suspendue': { nom: 'Fiche suspendue', blobs: ['a.pdf'], venteSuspendue: true },
  };
  const graphe = construireInclusionsPanier(fichiers);
  assert.deepEqual(graphe.inclusions['pack-exemple'], ['fiche-incluse']);
  assert.deepEqual(graphe.inclusions['pack-identique'], ['fiche-incluse']);
  assert.deepEqual(graphe.noms, { 'fiche-incluse': 'Fiche incluse' });
  assert.doesNotMatch(JSON.stringify(graphe), /\.pdf/);
  assert.ok(donnees.inclusions[pack].includes(fiche));
  assert.ok(donnees.inclusions[pack].includes('fiche-da-l2-s2'));
  assert.equal(donnees.inclusions[pack].includes(autreFiche), false);
});

test('le panier avertit dans les deux ordres d’ajout et retire la fiche seulement au clic', async () => {
  for (const ordre of [[pack, fiche], [fiche, pack]]) {
    const b = navigateur();
    ordre.forEach((id) => b.ajouter(id));
    b.panier.rendre();
    await viderMicrotaches();
    assert.deepEqual(b.ids(), ordre);
    assert.match(b.elements.tjdPanierTotalMontant.textContent, /49,97/);
    assert.equal(b.elements.tjdPanierCta.disabled, false);

    const ligne = b.lignes.get(fiche);
    assert.equal(ligne.titre.textContent, PRODUITS[fiche].nom);
    assert.match(ligne.bloc.html, /Ce support est déjà compris dans un pack du panier\./);
    assert.match(ligne.bloc.html, /aria-label="Retirer du panier Fiche complète Droit administratif L2 S1"/);
    assert.equal(b.lignes.get(pack).bloc.html, '');
    assert.equal(b.requetes.length, 1);
    assert.equal(b.requetes[0].options.credentials, 'omit');

    ligne.bloc.retrait.action();
    assert.deepEqual(b.ids(), [pack]);
    assert.equal(b.lignes.has(fiche), false);
    assert.equal(b.elements.tjdPanierCta.aLeFocus, true);
    assert.match(b.elements.tjdPanierTotalMontant.textContent, /29,98/);
    assert.equal(b.elements.tjdPanierCta.disabled, false);
    assert.equal(b.requetes.length, 1);
  }
});

test('le paiement peut conserver les deux offres malgré l’avertissement', async () => {
  const b = navigateur();
  b.ajouter(pack);
  b.ajouter(fiche);
  b.panier.rendre();
  await viderMicrotaches();
  b.panier.payer();
  assert.equal(b.lignes.get(fiche).bloc.retrait.disabled, true);
  await viderMicrotaches();
  const achat = b.requetes.find(({ url }) => url === '/api/create-checkout');
  assert.deepEqual(JSON.parse(achat.options.body).produitIds, [pack, fiche]);
  assert.deepEqual(b.ids(), [pack, fiche]);
});

test('des offres distinctes et un fichier public indisponible laissent le panier utilisable', async () => {
  for (const [ids, reponse] of [
    [[pack, autreFiche], undefined],
    [[pack, fiche], erreurReseau],
    [[pack, fiche], () => ({ ok: false, status: 404 })],
    [[pack, fiche], () => ({ ok: true, json: async () => ({ erreur: 'réponse incomplète' }) })],
  ]) {
    const b = navigateur(reponse);
    ids.forEach((id) => b.ajouter(id));
    b.panier.rendre();
    await viderMicrotaches();
    assert.deepEqual(b.ids(), ids);
    assert.ok(ids.every((id) => b.lignes.get(id).bloc.html === ''));
    assert.match(b.elements.tjdPanierTotalMontant.textContent, /49,97/);
    assert.equal(b.elements.tjdPanierCta.disabled, false);
  }
});
