const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/catalogue.js'), 'utf8');

function environnement({ url = 'https://trajectoiredroit.com/formations.html', memoire = new Map(), stockageRefuse = false, format = 'fiches', cartesReelles = null } = {}) {
  let actif = null;
  function element(attributs = {}, texte = '') {
    const classes = new Set();
    return {
      attributs: { ...attributs }, textContent: texte, value: '', hidden: false, style: { display: '' }, evenements: {},
      classList: { toggle(nom, etat) { if (etat) classes.add(nom); else classes.delete(nom); }, contains: (nom) => classes.has(nom) },
      getAttribute(nom) { return Object.hasOwn(this.attributs, nom) ? this.attributs[nom] : null; },
      setAttribute(nom, valeur) { this.attributs[nom] = valeur; },
      addEventListener(nom, fonction) { (this.evenements[nom] ||= []).push(fonction); },
      declencher(nom) { for (const fonction of this.evenements[nom] || []) fonction({ target: this }); },
      focus() { actif = this; }, scrollIntoView() { this.defilements = (this.defilements || 0) + 1; }
    };
  }
  const donnees = cartesReelles || [
    { niveau: 'L1', matiere: 'civil', texte: 'Droit des personnes L1', id: 'personnes' },
    { niveau: 'L2', matiere: 'public', texte: 'Droit administratif L2 semestre 1', id: 'administratif' },
    { niveau: 'L2', matiere: 'penal', texte: 'Droit pénal L2 semestre 1', id: 'penal' },
    { niveau: 'L3', matiere: 'civil', texte: 'Contrats spéciaux L3', id: 'contrats' }
  ];
  const cartes = donnees.map((d) => Object.assign(element({ 'data-niveau': d.niveau, 'data-matiere': d.matiere }, d.texte), { id: d.id }));
  cartes[0].style.display = 'flex';
  const recherche = element(), compteur = element(), vide = element(), reset = element();
  const niveaux = ['tous', 'L1', 'L2', 'L3'].map((n) => element({ 'data-catalogue-niveau': n }));
  const matieres = format === 'fiches' ? ['tous', 'civil', 'public', 'penal'].map((m) => element({ 'data-catalogue-matiere': m })) : [];
  const liens = [
    element({ href: 'cours-fiches.html?utm_source=comparatif#grille-cours-fiches' }),
    element({ href: 'formations.html#a-l-unite' }),
    element({ href: 'formations.html#cours-l1' }),
    element({ href: 'https://exemple.com/formations.html' }),
    element({ href: 'majeures-preparees.html' })
  ];
  const grille = { querySelectorAll: () => cartes };
  const racine = element({ 'data-catalogue-format': format });
  const controles = { '[data-catalogue-grille]': grille, '[data-catalogue-recherche]': recherche, '[data-catalogue-compteur]': compteur, '[data-catalogue-vide]': vide, '[data-catalogue-reset]': reset };
  racine.querySelector = (s) => controles[s];
  racine.querySelectorAll = (s) => s === '[data-catalogue-niveau]' ? niveaux : s === '[data-catalogue-matiere]' ? matieres : [];
  const ecouteurs = {};
  const window = {
    location: new URL(url),
    history: { state: null, replaceState(_etat, _titre, adresse) { window.location.href = new URL(adresse, window.location.href).href; } },
    addEventListener(nom, fn) { (ecouteurs[nom] ||= []).push(fn); }
  };
  const document = { readyState: 'complete', querySelectorAll: (s) => s === '[data-tjd-catalogue]' ? [racine] : s === 'a[href]' ? liens : [] };
  const contexte = { window, document, URL };
  Object.defineProperty(contexte, 'sessionStorage', { get() {
    if (stockageRefuse) throw new DOMException('Stockage refusé', 'SecurityError');
    return { getItem: (cle) => memoire.get(cle) || null, setItem: (cle, valeur) => memoire.set(cle, valeur), removeItem: (cle) => memoire.delete(cle) };
  } });
  vm.runInNewContext(source, contexte);
  return {
    window, cartes, compteur, vide, recherche, reset, niveaux, matieres, liens, memoire, racine,
    niveau(nom) { niveaux.find((b) => b.getAttribute('data-catalogue-niveau') === nom).declencher('click'); },
    matiere(nom) { matieres.find((b) => b.getAttribute('data-catalogue-matiere') === nom).declencher('click'); },
    chercher(texte) { recherche.value = texte; recherche.declencher('input'); },
    visibles() { return cartes.filter((c) => !c.hidden).map((c) => c.id); },
    hash(hash) { window.location.hash = hash; for (const fn of ecouteurs.hashchange || []) fn(); },
    actif: () => actif
  };
}

function cartesPage(nom) {
  const html = fs.readFileSync(path.join(__dirname, '..', nom), 'utf8');
  return Array.from(html.matchAll(/<article\b([^>]*\bdata-niveau="([^"]+)"[^>]*)>([\s\S]*?)<\/article>/g), (m) => ({
    niveau: m[2], matiere: m[1].match(/data-matiere="([^"]+)"/)?.[1] || '',
    texte: m[3].replace(/<[^>]*>/g, ' '), id: m[3].match(/data-tjd-produit="([^"]+)"/)?.[1]
  }));
}

test('niveau, matière et mots recherchés se combinent sans retirer les cartes du catalogue', () => {
  const e = environnement();
  e.niveau('L2'); e.matiere('public'); e.chercher('L2 ADMINISTRATIF');
  assert.deepEqual(e.visibles(), ['administratif']);
  assert.equal(e.compteur.textContent, '1 support affiché sur 4');
  assert.equal(e.cartes.length, 4);
  assert.equal(e.cartes[0].style.display, 'none');
  assert.equal(e.niveaux[2].getAttribute('aria-pressed'), 'true');
});

test('une recherche vide affiche le message prévu puis Réinitialiser rétablit tout', () => {
  const e = environnement({ url: 'https://trajectoiredroit.com/formations.html#cours-l2' });
  e.matiere('public'); e.chercher('texte absent');
  assert.deepEqual(e.visibles(), []);
  assert.equal(e.vide.hidden, false);
  assert.equal(e.compteur.textContent, '0 support affiché sur 4');
  e.reset.declencher('click');
  assert.equal(e.visibles().length, 4);
  assert.equal(e.cartes[0].style.display, 'flex');
  assert.equal(e.recherche.value, '');
  assert.equal(e.vide.hidden, true);
  assert.equal(e.vide.style.display, 'none');
  assert.equal(e.actif(), e.recherche);
  assert.equal(e.memoire.has('tjd_catalogue_niveau'), false);
  assert.equal(e.window.location.search, '');
  assert.equal(e.window.location.hash, '#a-l-unite');
});

test('le lien de méga-menu L1 prime sur L2 enregistré et hashchange sélectionne le niveau demandé', () => {
  const memoire = new Map([['tjd_catalogue_niveau', 'L2']]);
  const e = environnement({ memoire, url: 'https://trajectoiredroit.com/formations.html#cours-l1' });
  assert.deepEqual(e.visibles(), ['personnes']);
  assert.equal(e.racine.defilements, 1);
  assert.equal(e.memoire.get('tjd_catalogue_niveau'), 'L1');
  e.hash('#cours-l3');
  assert.deepEqual(e.visibles(), ['contrats']);
  assert.equal(e.racine.defilements, 2);
  assert.equal(e.window.location.search, '?niveau=l3');
});

test('les liens conservent le niveau entre fiches et cours, avec leur ancre et leurs autres paramètres', () => {
  const e = environnement(); e.niveau('L2');
  const lien = new URL(e.liens[0].getAttribute('href'), e.window.location.href);
  assert.equal(lien.searchParams.get('niveau'), 'l2');
  assert.equal(lien.searchParams.get('utm_source'), 'comparatif');
  assert.equal(lien.hash, '#grille-cours-fiches');
  const cours = environnement({ format: 'cours', memoire: e.memoire, url: lien.href });
  assert.deepEqual(cours.visibles(), ['administratif', 'penal']);
  assert.equal(e.liens[3].getAttribute('href'), 'https://exemple.com/formations.html');
  assert.equal(e.liens[4].getAttribute('href'), 'majeures-preparees.html');
});

test('le refus du stockage conserve les filtres et le niveau porté par le lien suivant', () => {
  const e = environnement({ stockageRefuse: true });
  e.niveau('L3'); e.chercher('spéciaux contrats');
  assert.deepEqual(e.visibles(), ['contrats']);
  const cours = environnement({ stockageRefuse: true, format: 'cours', url: new URL(e.liens[0].getAttribute('href'), e.window.location.href).href });
  assert.deepEqual(cours.visibles(), ['contrats']);
  cours.reset.declencher('click');
  assert.equal(cours.visibles().length, 4);
});

test('les deux pages réelles restent cherchables sans accents et avec des mots dans un autre ordre', () => {
  for (const nom of ['formations.html', 'cours-fiches.html']) {
    const cartes = cartesPage(nom);
    assert.equal(cartes.length, 24, nom);
    const e = environnement({ cartesReelles: cartes, format: nom === 'formations.html' ? 'fiches' : 'cours' });
    e.chercher('penal L2'); const sansAccents = e.visibles();
    assert.ok(sansAccents.length > 0, nom);
    e.chercher('L2 pénal');
    assert.deepEqual(e.visibles(), sansAccents);
    e.niveau('L2'); e.chercher('L2 administratif');
    assert.equal(e.visibles().length, 2, nom);
    assert.equal(e.cartes.length, 24);
  }
});
