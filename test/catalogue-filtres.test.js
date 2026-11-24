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
  const cartes = donnees.map((d) => {
    const carte = element({ 'data-niveau': d.niveau, 'data-matiere': d.matiere }, d.texte);
    const champs = Object.fromEntries(Object.entries(d.champs || { 'product__title': d.texte }).map(
      ([classe, texte]) => ['.' + classe, { textContent: texte }]
    ));
    carte.id = d.id;
    carte.querySelector = (s) => champs[s] || null;
    carte.querySelectorAll = (s) => s.split(', ').map((selecteur) => champs[selecteur]).filter(Boolean);
    return carte;
  });
  cartes[0].style.display = 'flex';
  const recherche = element(), compteur = element(), vide = element(), reset = element();
  const suggestion = format === 'fiches' ? element() : null;
  const niveaux = ['tous', 'L1', 'L2', 'L3'].map((n) => element({ 'data-catalogue-niveau': n }));
  const matieres = format === 'fiches' ? ['tous', 'civil', 'public', 'penal'].map((m) => element({ 'data-catalogue-matiere': m })) : [];
  const liens = [
    element({ href: 'formations.html?utm_source=comparatif#a-l-unite' }),
    element({ href: 'formations.html#a-l-unite' }),
    element({ href: 'formations.html#cours-l1' }),
    element({ href: 'https://exemple.com/formations.html' }),
    element({ href: 'majeures-preparees.html' })
  ];
  const grille = { querySelectorAll: () => cartes };
  const racine = element({ 'data-catalogue-format': format });
  const controles = { '[data-catalogue-grille]': grille, '[data-catalogue-recherche]': recherche, '[data-catalogue-compteur]': compteur, '[data-catalogue-vide]': vide, '[data-catalogue-reset]': reset, '[data-catalogue-suggestion]': suggestion };
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
    window, cartes, compteur, vide, recherche, reset, niveaux, matieres, liens, memoire, racine, suggestion,
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
    texte: m[3].replace(/<[^>]*>/g, ''),
    id: m[3].match(/data-tjd-produit="([^"]+)"/)?.[1],
    champs: Object.fromEntries(Array.from(
      m[3].matchAll(/<(\w+) [^>]*class="(?:badge )?(badge--format|product__(?:title|meta|edition|desc|sommaire-list))"[^>]*>([\s\S]*?)<\/\1>/g),
      ([, , classe, contenu]) => [classe, contenu.replace(/<[^>]*>/g, '')]
    ))
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

test('les contrôles attendent que le catalogue soit prêt', () => {
  const html = fs.readFileSync(path.join(__dirname, '../formations.html'), 'utf8');
  const controles = html.match(/<(?:button|input)\b[^>]*\bdata-catalogue-(?:niveau|matiere|recherche|reset)\b[^>]*>/g);
  assert.ok(controles.length > 0);
  assert.ok(controles.every((controle) => /\sdisabled(?:\s|>)/.test(controle)));

  const e = environnement();
  const actives = [...e.niveaux, ...e.matieres, e.recherche, e.reset];
  assert.ok(actives.every((controle) => controle.disabled === false));
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

test('les liens conservent le niveau dans le catalogue, avec leur ancre et leurs autres paramètres', () => {
  const e = environnement(); e.niveau('L2');
  const lien = new URL(e.liens[0].getAttribute('href'), e.window.location.href);
  assert.equal(lien.searchParams.get('niveau'), 'l2');
  assert.equal(lien.searchParams.get('utm_source'), 'comparatif');
  assert.equal(lien.hash, '#a-l-unite');
  const catalogue = environnement({ memoire: e.memoire, url: lien.href });
  assert.deepEqual(catalogue.visibles(), ['administratif', 'penal']);
  assert.equal(e.liens[3].getAttribute('href'), 'https://exemple.com/formations.html');
  assert.equal(e.liens[4].getAttribute('href'), 'majeures-preparees.html');
});

test('le refus du stockage conserve les filtres et le niveau porté par le lien suivant', () => {
  const e = environnement({ stockageRefuse: true });
  e.niveau('L3'); e.chercher('spéciaux contrats');
  assert.deepEqual(e.visibles(), ['contrats']);
  const catalogue = environnement({ stockageRefuse: true, url: new URL(e.liens[0].getAttribute('href'), e.window.location.href).href });
  assert.deepEqual(catalogue.visibles(), ['contrats']);
  catalogue.reset.declencher('click');
  assert.equal(catalogue.visibles().length, 4);
});

test('le catalogue de fiches reste cherchable sans accents et avec des mots dans un autre ordre', () => {
  const nom = 'formations.html';
  const cartes = cartesPage(nom);
  assert.equal(cartes.length, 24, nom);
  const e = environnement({ cartesReelles: cartes, format: 'fiches' });
  e.chercher('penal L2'); const sansAccents = e.visibles();
  assert.ok(sansAccents.length > 0, nom);
  e.chercher('L2 pénal');
  assert.deepEqual(e.visibles(), sansAccents);
  e.niveau('L2'); e.chercher('L2 administratif');
  assert.equal(e.visibles().length, 2, nom);
  assert.equal(e.cartes.length, 24);
});

test('une recherche que le niveau mémorisé masque propose les résultats dans le bon niveau', () => {
  const e = environnement({
    cartesReelles: cartesPage('formations.html'),
    memoire: new Map([['tjd_catalogue_niveau', 'L3']])
  });
  e.matiere('public'); e.chercher('droit administratif');
  assert.deepEqual(e.visibles(), []);
  assert.equal(e.vide.hidden, true);
  assert.equal(e.suggestion.hidden, false);
  assert.equal(e.suggestion.textContent, 'Voir les 2 résultats en L2');
  assert.equal(e.memoire.get('tjd_catalogue_niveau'), 'L3');

  e.suggestion.declencher('click');
  assert.deepEqual(e.visibles(), ['fiche-da-l2-s1', 'fiche-da-l2-s2']);
  assert.equal(e.recherche.value, 'droit administratif');
  assert.equal(e.matieres[2].getAttribute('aria-pressed'), 'true');
  assert.equal(e.niveaux[2].getAttribute('aria-pressed'), 'true');
  assert.equal(e.memoire.get('tjd_catalogue_niveau'), 'L2');
  assert.equal(e.window.location.searchParams.get('niveau'), 'l2');
  assert.equal(e.suggestion.hidden, true);
  assert.equal(e.actif().id, 'fiche-da-l2-s1');
});

test('la suggestion respecte le semestre et disparaît si la recherche suivante est sans résultat', () => {
  const e = environnement({ cartesReelles: cartesPage('formations.html') });
  e.niveau('L3'); e.chercher('droit administratif S2');
  assert.equal(e.suggestion.textContent, 'Voir le résultat en L2');
  e.chercher('droit administratif S2 extraterrestre');
  assert.equal(e.suggestion.hidden, true);
  assert.equal(e.suggestion.textContent, '');
  assert.equal(e.vide.hidden, false);
  e.suggestion.declencher('click');
  assert.equal(e.niveaux[3].getAttribute('aria-pressed'), 'true');
});

test('des résultats dans plusieurs années ouvrent Tous sans modifier la matière recherchée', () => {
  const e = environnement();
  e.niveau('L2'); e.matiere('civil'); e.chercher('L1 L3');
  assert.equal(e.suggestion.textContent, 'Voir les 2 résultats dans toutes les années');
  e.suggestion.declencher('click');
  assert.deepEqual(e.visibles(), ['personnes', 'contrats']);
  assert.equal(e.recherche.value, 'L1 L3');
  assert.equal(e.matieres[1].getAttribute('aria-pressed'), 'true');
  assert.equal(e.niveaux[0].getAttribute('aria-pressed'), 'true');
  assert.equal(e.memoire.has('tjd_catalogue_niveau'), false);
});

test('élargir la matière retrouve les fiches dans l’année choisie sans effacer la recherche', () => {
  const e = environnement({ cartesReelles: cartesPage('formations.html') });
  e.niveau('L2'); e.matiere('public'); e.chercher('droit des contrats L2 S1');
  assert.deepEqual(e.visibles(), []);
  assert.equal(e.suggestion.hidden, false);
  assert.equal(e.suggestion.textContent, 'Voir les résultats dans toutes les matières');
  assert.equal(e.vide.hidden, true);
  const adresse = e.window.location.href;

  e.suggestion.declencher('click');
  assert.ok(e.visibles().includes('fiche-contrats-l2-s1'));
  assert.equal(e.niveaux[2].getAttribute('aria-pressed'), 'true');
  assert.equal(e.matieres[0].getAttribute('aria-pressed'), 'true');
  assert.equal(e.matieres[2].getAttribute('aria-pressed'), 'false');
  assert.equal(e.memoire.get('tjd_catalogue_niveau'), 'L2');
  assert.equal(e.window.location.href, adresse);
  assert.equal(e.recherche.value, 'droit des contrats L2 S1');
  assert.equal(e.suggestion.hidden, true);
  const premiere = e.cartes.find(carte => !carte.hidden);
  assert.equal(e.actif(), premiere);
  assert.equal(premiere.getAttribute('tabindex'), '-1');
});

test('la suggestion au singulier disparaît quand aucune fiche ne correspond', () => {
  const e = environnement();
  e.niveau('L2'); e.matiere('public'); e.chercher('droit pénal');
  assert.equal(e.suggestion.textContent, 'Voir le résultat dans toutes les matières');
  e.suggestion.declencher('click');
  assert.deepEqual(e.visibles(), ['penal']);
  e.chercher('introuvableqz');
  assert.equal(e.suggestion.hidden, true);
  assert.equal(e.suggestion.textContent, '');
  assert.equal(e.vide.hidden, false);
});

test('aucune suggestion ne change les deux filtres à la fois', () => {
  const e = environnement();
  e.niveau('L3'); e.matiere('public');
  assert.equal(e.suggestion.hidden, true);
  e.chercher('droit des personnes');
  assert.equal(e.suggestion.hidden, true);
  assert.equal(e.vide.hidden, false);
});

test('une année tapée sélectionne le niveau de la fiche, même après un choix mémorisé', () => {
  const memoire = new Map([['tjd_catalogue_niveau', 'L3']]);
  const e = environnement({
    cartesReelles: cartesPage('formations.html'),
    memoire,
    url: 'https://trajectoiredroit.com/formations.html?utm_source=cours#cours-l3'
  });
  assert.equal(e.niveaux[3].getAttribute('aria-pressed'), 'true');
  e.chercher('droit administratif L2 S2');
  assert.deepEqual(e.visibles(), ['fiche-da-l2-s2']);
  assert.equal(e.niveaux[2].getAttribute('aria-pressed'), 'true');
  assert.equal(e.niveaux[2].classList.contains('active'), true);
  assert.equal(e.niveaux[3].getAttribute('aria-pressed'), 'false');
  assert.equal(e.vide.hidden, true);
  assert.equal(e.window.location.searchParams.get('niveau'), 'l2');
  assert.equal(e.window.location.searchParams.get('utm_source'), 'cours');
  assert.equal(e.window.location.hash, '#cours-l2');
  assert.equal(e.memoire.get('tjd_catalogue_niveau'), 'L2');
});

test('une recherche ambiguë ou effacée conserve le niveau affiché et le filtre reste manuel', () => {
  const e = environnement();
  e.niveau('L3');
  e.chercher('L1 L3');
  assert.deepEqual(e.visibles(), ['contrats']);
  assert.equal(e.niveaux[3].getAttribute('aria-pressed'), 'true');

  e.chercher('Licence 2 L2');
  assert.deepEqual(e.visibles(), ['administratif', 'penal']);
  e.chercher('');
  assert.deepEqual(e.visibles(), ['administratif', 'penal']);
  assert.equal(e.niveaux[2].getAttribute('aria-pressed'), 'true');

  e.niveau('L1');
  e.chercher('personnes');
  assert.deepEqual(e.visibles(), ['personnes']);
  assert.equal(e.window.location.searchParams.get('niveau'), 'l1');
});

test('le semestre recherché correspond à la fiche et exclut les offres d’ajout', () => {
  const e = environnement({ cartesReelles: cartesPage('formations.html') });
  e.niveau('L2');
  for (const [recherche, produits] of [
    ['droit administratif semestre 1', ['fiche-da-l2-s1']],
    ['droit administratif S1', ['fiche-da-l2-s1']],
    ['droit administratif S.1', ['fiche-da-l2-s1']],
    ['droit administratif semestre 2', ['fiche-da-l2-s2']],
    ['droit administratif S2', ['fiche-da-l2-s2']],
    ['Droit administratif, S 2', ['fiche-da-l2-s2']],
    ['contrats semestre 1', ['cours-images-contrats-l2-s1', 'fiche-contrats-l2-s1']],
    ['contrats S1', ['cours-images-contrats-l2-s1', 'fiche-contrats-l2-s1']],
    ['contrats L2S1', ['cours-images-contrats-l2-s1', 'fiche-contrats-l2-s1']],
    ['contrats L2-S1', ['cours-images-contrats-l2-s1', 'fiche-contrats-l2-s1']],
    ['contrats L2 S1', ['cours-images-contrats-l2-s1', 'fiche-contrats-l2-s1']],
    ['droit pénal L2 S1', ['fiche-penal-general-l1', 'fiche-penal-l2-s1']],
    ['droit pénal L2-S2', ['fiche-penal-general-l1']],
    ['droit pénal général L2 S1', ['fiche-penal-general-l1']],
    ['responsabilité civile S2', ['fiche-obligations-l2-s2']],
    ['droit des biens', ['fiche-biens-l2']]
  ]) {
    e.chercher(recherche);
    assert.deepEqual(e.visibles(), produits, recherche);
  }
});

test('une matière nommée reste trouvable si sa fiche couvre l’année entière', () => {
  const e = environnement({ cartesReelles: cartesPage('formations.html') });
  e.chercher('droit des biens S2');
  assert.deepEqual(e.visibles(), ['fiche-biens-l2']);
  e.chercher('Droit des biens, semestre 1');
  assert.deepEqual(e.visibles(), ['fiche-biens-l2']);
  e.chercher('contrats spéciaux S2');
  assert.deepEqual(e.visibles(), ['fiche-contrats-speciaux-l3']);
  e.chercher('contrats spéciaux L2 S2');
  assert.deepEqual(e.visibles(), ['fiche-obligations-l2-s2']);
  e.chercher('contrats spéciaux S2');
  assert.deepEqual(e.visibles(), []);
  assert.equal(e.suggestion.textContent, 'Voir le résultat en L3');
  e.suggestion.declencher('click');
  assert.deepEqual(e.visibles(), ['fiche-contrats-speciaux-l3']);
  e.chercher('spéciaux contrats L3 S2');
  assert.deepEqual(e.visibles(), ['fiche-contrats-speciaux-l3']);
  e.chercher('contrats S1');
  assert.ok(!e.visibles().includes('fiche-contrats-speciaux-l3'));
  e.chercher('S2');
  assert.ok(!e.visibles().includes('fiche-contrats-speciaux-l3'));
  e.chercher('contrats spéciaux S2 privé');
  assert.deepEqual(e.visibles(), []);
});

test('une ancre de fiche rend sa carte visible malgré les filtres et place le focus à son début', () => {
  const cartes = cartesPage('formations.html');
  const ancre = 'fiche-obligations-l2-s2';
  const memo = new Map([['tjd_catalogue_niveau', 'L3']]);
  const depuisAutrePage = environnement({ cartesReelles: cartes, memoire: memo, url: 'https://trajectoiredroit.com/formations.html#' + ancre });
  assert.ok(depuisAutrePage.visibles().includes(ancre));
  assert.equal(depuisAutrePage.actif().id, ancre);
  assert.equal(depuisAutrePage.actif().defilements, 1);
  const depuisCatalogue = environnement({ cartesReelles: cartes });
  depuisCatalogue.niveau('L3');
  depuisCatalogue.matiere('public');
  depuisCatalogue.chercher('distinction SPA/SPIC');
  depuisCatalogue.hash('#' + ancre);
  assert.ok(depuisCatalogue.visibles().includes(ancre));
  assert.equal(depuisCatalogue.recherche.value, '');
  assert.equal(depuisCatalogue.actif().id, ancre);
  assert.equal(depuisCatalogue.window.location.searchParams.get('niveau'), 'l2');
});

const cleRetourPaiement = 'tjd_catalogue_retour_paiement';
const adresseRetourPaiement = 'formations.html#retour-paiement';

test('le retour explicite de paiement restaure les trois filtres du même onglet une seule fois', () => {
  const e = environnement();
  assert.equal(e.window.tjdRetourCatalogue.adresse(), null);
  e.niveau('L2'); e.matiere('public'); e.chercher('administratif');
  assert.equal(e.window.tjdRetourCatalogue.adresse(), adresseRetourPaiement);
  assert.equal(e.memoire.has(cleRetourPaiement), false);
  e.window.tjdRetourCatalogue.memoriser(adresseRetourPaiement);

  const ordinaire = environnement({ memoire: e.memoire });
  assert.equal(ordinaire.recherche.value, '');
  assert.equal(ordinaire.matieres[0].getAttribute('aria-pressed'), 'true');
  assert.equal(e.memoire.has(cleRetourPaiement), true);

  const e2 = environnement({ memoire: e.memoire, url: 'https://trajectoiredroit.com/' + adresseRetourPaiement });
  assert.equal(e2.recherche.value, 'administratif');
  assert.equal(e2.niveaux[2].getAttribute('aria-pressed'), 'true');
  assert.equal(e2.matieres[2].getAttribute('aria-pressed'), 'true');
  assert.deepEqual(e2.visibles(), ['administratif']);
  assert.equal(e2.window.location.hash, '#a-l-unite');
  assert.equal(e2.window.location.search, '?niveau=l2');
  assert.equal(e2.racine.defilements, 1);
  assert.equal(e.memoire.has(cleRetourPaiement), false);

  const recharge = environnement({ memoire: e.memoire, url: e2.window.location.href });
  assert.equal(recharge.recherche.value, '');
  assert.equal(recharge.matieres[0].getAttribute('aria-pressed'), 'true');
});

test('les liens explicites aux cartes du catalogue priment sur un retour mémorisé', () => {
  const e = environnement();
  e.niveau('L3'); e.matiere('civil'); e.chercher('contrats');
  e.window.tjdRetourCatalogue.memoriser(adresseRetourPaiement);
  const carte = environnement({ memoire: e.memoire, url: 'https://trajectoiredroit.com/formations.html#administratif' });
  assert.equal(carte.recherche.value, '');
  assert.equal(carte.actif().id, 'administratif');
  assert.equal(carte.window.tjdRetourCatalogue.adresse(), null);
  assert.equal(e.memoire.has(cleRetourPaiement), true);
});

test('le retour au catalogue écarte un état corrompu et fonctionne sans stockage', () => {
  for (const sauvegarde of ['{', JSON.stringify({ recherche: 'introuvable', niveau: 'L2', matiere: 'ancien_code', ancre: '#a-l-unite' }),
    JSON.stringify({ recherche: 'introuvable', niveau: 'L2', matiere: 'civil', ancre: '#contrats' })]) {
    const e = environnement({
      memoire: new Map([[cleRetourPaiement, sauvegarde]]),
      url: 'https://trajectoiredroit.com/' + adresseRetourPaiement
    });
    assert.equal(e.recherche.value, '');
    assert.equal(e.window.location.hash, '#a-l-unite');
    assert.equal(e.memoire.has(cleRetourPaiement), false);
  }
  const e = environnement({ stockageRefuse: true, url: 'https://trajectoiredroit.com/' + adresseRetourPaiement });
  assert.equal(e.window.location.hash, '#a-l-unite');
  e.chercher('administratif');
  assert.equal(e.window.tjdRetourCatalogue.adresse(), null);
});
