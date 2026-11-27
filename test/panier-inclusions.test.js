const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const PRODUITS = require('../api/_produits');
const { construireInclusionsPanier } = require('../scripts/generer-inclusions-panier');

const source = fs.readFileSync(require.resolve('../assets/js/achat.js'), 'utf8');
const scenario = source.replace(/\}\)\(\);\s*$/, `
  panierRafraichir = function () {};
  window.panier = { ajouter: panierAjouter, lire: panierLire, rendre: panierRendreListe, payer: panierCheckout,
    choix: panierChoix, synchroniser: panierSyncLien };
})();`);
assert.notEqual(scenario, source);
const pack = 'pack-matiere-da-l2';
const fiche = 'fiche-da-l2-s1';
const autreFiche = 'fiche-contrats-l2-s1';
const donnees = construireInclusionsPanier(PRODUITS);
const erreurReseau = () => { throw new Error('Réseau indisponible'); };
const viderMicrotaches = () => new Promise(setImmediate);

function bouton(id) {
  return {
    disabled: false,
    getAttribute(nom) { return nom === 'data-tjd-panier-retirer' ? id : null; },
    hasAttribute() { return false; },
    setAttribute(nom, valeur) { this[nom] = valeur; },
    addEventListener(nom, action) { if (nom === 'click') this.action = action; },
  };
}

function navigateur(reponse = () => ({ ok: true, json: async () => donnees })) {
  const requetes = [];
  const lignes = new Map();
  const elements = {
    tjdPanierListe: {
      set innerHTML(html) {
        this.html = html;
        lignes.clear();
        for (const resultat of html.matchAll(/data-tjd-panier-produit="([^"]+)"/g)) {
          const id = resultat[1];
          const titre = { textContent: '' };
          const retrait = bouton(id);
          lignes.set(id, {
            titre,
            retrait,
            querySelector: (selecteur) => ({
              '.tjd-panier-item__nom': titre, '.tjd-panier-item__retirer': retrait,
            }[selecteur]),
            getAttribute: () => id,
          });
        }
      },
      querySelectorAll(selecteur) {
        const articles = [...lignes.values()];
        return selecteur === '[data-tjd-panier-produit]' ? articles : articles.map(({ retrait }) => retrait);
      },
    },
    tjdPanierCta: { disabled: false, getAttribute: () => null, focus() { this.aLeFocus = true; } },
    tjdPanierContinuer: { hidden: true, focus() { this.aLeFocus = true; } },
    tjdPanierEnvoi: { hidden: false },
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
    ajouter(id, prixCentimes = PRODUITS[id].prix) {
      window.panier.ajouter([{ id, nom: 'Titre capté sur la page', prixCentimes }]);
    },
    ids: () => Array.from(window.panier.lire(), ({ id }) => id),
  };
}

test('le catalogue publie les inclusions strictes, les intitulés et les prix publics', () => {
  const fichiers = {
    'pack-exemple': { nom: 'Pack exemple', blobs: ['a.pdf', 'b.pdf', 'c.pdf'] },
    'fiche-incluse': { nom: 'Fiche incluse', blobs: ['a.pdf', 'b.pdf'] },
    'fiche-partielle': { nom: 'Fiche partielle', prix: 1999, blobs: ['a.pdf', 'x.pdf'] },
    'pack-identique': { nom: 'Pack identique', blobs: ['a.pdf', 'b.pdf', 'c.pdf'] },
    'fiche-vide': { nom: 'Fiche vide', blobs: [] },
    'fiche-suspendue': { nom: 'Fiche suspendue', blobs: ['a.pdf'], venteSuspendue: true },
  };
  const graphe = construireInclusionsPanier(fichiers);
  assert.deepEqual(graphe.inclusions['pack-exemple'], ['fiche-incluse']);
  assert.deepEqual(graphe.inclusions['pack-identique'], ['fiche-incluse']);
  assert.equal(graphe.noms['fiche-incluse'], 'Fiche incluse');
  assert.equal(graphe.noms['fiche-partielle'], 'Fiche partielle');
  assert.equal(graphe.noms['fiche-suspendue'], undefined);
  assert.deepEqual(graphe.prix, { 'fiche-partielle': 1999 });
  assert.deepEqual(Object.keys(graphe), ['inclusions', 'noms', 'prix']);
  assert.doesNotMatch(JSON.stringify(graphe), /\.pdf/);
  assert.ok(donnees.inclusions[pack].includes(fiche));
  assert.ok(donnees.inclusions[pack].includes('fiche-da-l2-s2'));
  assert.equal(donnees.inclusions[pack].includes(autreFiche), false);
});

test('le panier garde la fiche et le pack dans les deux ordres d’ajout et permet le retrait habituel', async () => {
  assert.doesNotMatch(source, /tjdPanierInclusions|data-tjd-panier-retrait-inclus|Retirer la fiche seule/);
  for (const ordre of [[pack, fiche], [fiche, pack]]) {
    const b = navigateur();
    ordre.forEach((id) => b.ajouter(id));
    b.panier.rendre();
    await viderMicrotaches();
    assert.deepEqual(b.ids(), ordre);
    assert.match(b.elements.tjdPanierTotalMontant.textContent, /44,97/);
    assert.equal(b.elements.tjdPanierCta.disabled, false);

    const ligne = b.lignes.get(fiche);
    assert.equal(ligne.titre.textContent, PRODUITS[fiche].nom);
    assert.equal(b.requetes.length, 1);
    assert.equal(b.requetes[0].options.credentials, 'omit');

    ligne.retrait.action();
    assert.deepEqual(b.ids(), [pack]);
    assert.equal(b.lignes.has(fiche), false);
    assert.match(b.elements.tjdPanierTotalMontant.textContent, /29,98/);
    assert.equal(b.elements.tjdPanierCta.disabled, false);
    assert.equal(b.requetes.length, 1);
  }
});

test('le paiement conserve les deux offres choisies', async () => {
  const b = navigateur();
  b.ajouter(pack);
  b.ajouter(fiche);
  b.panier.rendre();
  await viderMicrotaches();
  b.panier.payer();
  assert.equal(b.lignes.get(fiche).retrait.disabled, true);
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
    assert.match(b.elements.tjdPanierTotalMontant.textContent, /44,97/);
    assert.equal(b.elements.tjdPanierCta.disabled, false);
  }
});

test('une seule ligne héritée reçoit son nom et son prix catalogue à l’arrivée du réseau', async () => {
  let repondre;
  const reponse = new Promise(resolve => { repondre = resolve; });
  const b = navigateur(() => reponse);
  b.ajouter('fiche-intro-droit-l1', 1799);
  b.panier.rendre();
  const ligne = b.lignes.get('fiche-intro-droit-l1');
  ligne.retrait.aLeFocus = true;
  await viderMicrotaches();
  assert.equal(b.requetes.length, 1);
  assert.equal(b.elements.tjdPanierTotalMontant.textContent, '17,99 €');
  repondre({ ok: true, json: async () => donnees });
  await viderMicrotaches();
  assert.equal(b.lignes.get('fiche-intro-droit-l1'), ligne);
  assert.equal(ligne.retrait.aLeFocus, true);
  assert.equal(ligne.titre.textContent, PRODUITS['fiche-intro-droit-l1'].nom);
  assert.equal(ligne.retrait['aria-label'], 'Retirer du panier ' + PRODUITS['fiche-intro-droit-l1'].nom);
  assert.equal(b.elements.tjdPanierTotalMontant.textContent, '14,99 €');
  assert.equal(b.panier.lire()[0].prixCentimes, 1499);
});

test('une case cochée complète le panier sans dupliquer la fiche, la quantité ou le prix', async () => {
  const fiche = 'fiche-contrats-speciaux-l3';
  const cas = 'cas-pratique-contrats-speciaux-l3';
  const b = navigateur();
  const caseComplement = { checked: false };
  const lien = {
    dataset: { produitId: fiche, nom: 'Fiche complète', prix: '1999' },
    tjdComplement: { caseComplement, article: { id: cas, nom: 'Cas pratiques corrigés', prixCentimes: null } },
  };
  b.panier.ajouter(b.panier.choix(lien));
  b.panier.synchroniser(lien);
  assert.equal(lien.disabled, true);
  assert.deepEqual(b.ids(), [fiche]);
  b.panier.rendre();
  await viderMicrotaches();

  caseComplement.checked = true;
  b.panier.synchroniser(lien);
  assert.equal(lien.disabled, false);
  b.panier.ajouter(b.panier.choix(lien));
  b.panier.ajouter(b.panier.choix(lien));
  b.panier.synchroniser(lien);
  assert.equal(lien.disabled, true);
  assert.deepEqual(b.ids(), [fiche, cas]);
  assert.equal(b.panier.lire()[1].prixCentimes, PRODUITS[cas].prix);
  b.panier.rendre();
  assert.equal(b.elements.tjdPanierTotalMontant.textContent, '29,98 €');

  b.panier.payer();
  await viderMicrotaches();
  const achat = b.requetes.find(({ url }) => url === '/api/create-checkout');
  assert.deepEqual(JSON.parse(achat.options.body).produitIds, [fiche, cas]);
});

test('sans catalogue réseau, un complément au montant connu reste ajouté avec le prix de son étiquette', async () => {
  const b = navigateur(erreurReseau);
  const lien = {
    dataset: { produitId: fiche, nom: 'Fiche complète S1', prix: '1999' },
    tjdComplement: { caseComplement: { checked: true }, article: { id: 'fiche-da-l2-s2', nom: 'Fiche complète S2', prixCentimes: 1999 } },
  };
  b.panier.ajouter(b.panier.choix(lien));
  b.panier.rendre();
  await viderMicrotaches();
  assert.deepEqual(b.ids(), [fiche, 'fiche-da-l2-s2']);
  assert.equal(b.elements.tjdPanierTotalMontant.textContent, '39,98 €');
});


test('le panier vide affiche une sortie et retrouve les commandes de paiement dès l’ajout', () => {
  const b = navigateur();
  const { tjdPanierListe: liste, tjdPanierTotal: total, tjdPanierCta: paiement, tjdPanierContinuer: continuer, tjdPanierEnvoi: envoi } = b.elements;
  b.panier.rendre();
  assert.equal(liste.html, '<p class="tjd-panier-vide" id="tjdPanierEtatVide">Ton panier est vide.</p>');
  assert.equal(continuer.hidden, false);
  assert.equal(total.hidden, true);
  assert.equal(envoi.hidden, true);
  assert.equal(paiement.hidden, true);
  assert.equal(paiement.disabled, true);

  b.ajouter(fiche);
  b.panier.rendre();
  assert.equal(continuer.hidden, true);
  assert.equal(total.hidden, false);
  assert.equal(envoi.hidden, false);
  assert.equal(paiement.hidden, false);
  assert.equal(paiement.disabled, false);

  b.lignes.get(fiche).retrait.action();
  assert.equal(paiement.hidden, true);
  assert.equal(continuer.hidden, false);
  assert.equal(continuer.aLeFocus, true);
  assert.deepEqual(b.ids(), []);
});
