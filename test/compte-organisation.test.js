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
  const ids = ['etatChargement', 'etatConnexion', 'etatConnecte', 'connexionForm', 'connexionEmail', 'connexionSubmit', 'connexionError', 'connexionSuccess', 'compteEmail', 'deconnexionBtn', 'achatsListe', 'achatsVide', 'achatsReessayer', 'achatsAide', 'resterConnecte', 'codeForm', 'connexionCode', 'codeSubmit', 'codeDestinataire', 'renvoyerCode', 'changerEmail', 'achatsOutils', 'achatsRecherche', 'achatsProduit', 'achatsSemestre', 'achatsReinitialiser', 'achatsResultat'];
  if (options.parrainage) ids.push('parrainageBox', 'parrainageCopier', 'parrainageLien', 'parrainageStatut', 'parrainageCopieManuelle', 'parrainageBons', 'parrainageSolde');
  function nouveauElement() {
    const classes = new Set();
    return { style: {}, textContent: '', innerHTML: '', value: '', hidden: true, listeners: {}, children: [],
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
      addEventListener(event, fn) { this.listeners[event] = fn; },
      focus() { this.focused = true; },
      select() { this.selected = true; },
      replaceChildren() { this.children = []; },
      appendChild(el) { this.children.push(el); },
      contains(el) { return this.innerHTML.includes('data-pdf-compte="' + el.dataset.pdfCompte + '"'); },
      querySelectorAll(selecteur) {
        return selecteur === "audio, video" ? this.lecteurs || [] : this.liens || [];
      },
      querySelector(selector) {
        const [, index] = selector.match(/^a\[data-pdf-compte="(\d+)"\]$/);
        const lien = new RegExp('href="[^"]+" data-pdf-compte="' + index + '"');
        const liste = this;
        return lien.test(liste.innerHTML) ? {
          set href(url) {
            liste.innerHTML = liste.innerHTML.replace(lien, 'href="' + url.replaceAll('&', '&amp;') + '" data-pdf-compte="' + index + '"');
          }
        } : null;
      },
    };
  }
  const elements = {};
  for (const id of ids) {
    if (options.ancienHtml && ['achatsReessayer', 'achatsAide'].includes(id)) continue;
    elements[id] = nouveauElement();
  }
  if (options.parrainage) elements.parrainageCopier.textContent = 'Copier mon lien';
  const timers = [];
  const demandes = [];
  const destinations = [];
  let horloge = options.maintenant ?? Date.now();
  class DateSimulee extends Date {
    static now() { return horloge; }
  }
  let callback;
  const stockage = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
  const auth = {
    getSession: async () => ({ data: { session: { access_token: 'jeton-factice' } } }),
    getUser: async (jeton) => ({ data: { user: {
      id: options.identite ? options.identite(jeton) : 'titulaire-factice',
      email: 'apercu@example.invalid', email_confirmed_at: '2026-10-01', is_anonymous: false
    } } }),
    onAuthStateChange(fn) { callback = fn; },
    signOut: async () => { callback('SIGNED_OUT', null); return {}; },
  };
  const achats = options.achats || historique();
  const window = { supabase: { createClient: () => ({ auth }) }, localStorage: stockage(), sessionStorage: stockage(), setTimeout: fn => { timers.push(fn); }, location: { search: '', assign: url => destinations.push(url) } };
  window.navigator = { clipboard: options.clipboard };
  vm.runInNewContext(source, { window, document: { getElementById: id => elements[id] || null, createElement: nouveauElement }, Date: DateSimulee, URL, URLSearchParams,
    fetch: async (url, req) => { demandes.push({ url, req }); return options.fetch ? options.fetch(url, req) : { ok: true, status: 200, json: async () => ({ achats, parrainage: options.parrainage }) }; },
  });
  return {
    elements, demandes, destinations,
    async flush() { await tick(); for (const fn of timers.splice(0)) fn(); await tick(); },
    evenement: (type, session) => callback(type, session),
    chercher(value) { elements.achatsRecherche.value = value; elements.achatsRecherche.listeners.input(); },
    filtrer(id, value) { elements[id].value = value; elements[id].listeners.change(); },
    effacer() { elements.achatsReinitialiser.listeners.click(); },
    avancerTemps(ms) { horloge += ms; },
    cliquerPdf(index) {
      const evenement = {
        target: { closest: () => ({ dataset: { pdfCompte: String(index) } }) },
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      };
      const fin = elements.achatsListe.listeners.click(evenement);
      return { renouvellement: evenement.defaultPrevented, fin };
    },
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

test('la copie du lien de parrainage confirme après écriture et conserve les bons', async () => {
  const attente = differe();
  const liensCopies = [];
  const bon = 'BONABCDEF0123456789ABCD';
  const b = navigateur({
    parrainage: { code: 'PARRAINTEST', bons: [bon] },
    clipboard: { writeText: lien => { liensCopies.push(lien); return attente.promise; } },
  });
  await b.flush();
  const { parrainageBox, parrainageCopier, parrainageStatut, parrainageCopieManuelle, parrainageBons } = b.elements;
  assert.equal(parrainageBox.hidden, false);
  const copie = parrainageCopier.listeners.click();
  assert.equal(parrainageCopier.textContent, 'Copier mon lien');
  assert.equal(parrainageStatut.textContent, '');
  attente.resolve();
  await copie;
  assert.deepEqual(liensCopies, ['https://trajectoiredroit.com/?code=PARRAINTEST']);
  assert.equal(parrainageCopier.textContent, 'Lien copié');
  assert.equal(parrainageStatut.textContent, 'Lien copié');
  assert.equal(parrainageCopieManuelle.hidden, true);
  assert.equal(parrainageBons.children[0].children[0].href, '/formations.html?code=' + bon);
});

test('le lien complet est sélectionnable si la copie automatique est indisponible', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('Copie bloquée'); } }]) {
    const b = navigateur({ parrainage: { code: 'PARRAINTEST' }, clipboard });
    await b.flush();
    const { parrainageCopier, parrainageLien, parrainageCopieManuelle, parrainageStatut } = b.elements;
    await parrainageCopier.listeners.click();
    assert.equal(parrainageCopieManuelle.hidden, false);
    assert.equal(parrainageLien.value, 'https://trajectoiredroit.com/?code=PARRAINTEST');
    assert.equal(parrainageLien.focused, true);
    assert.equal(parrainageLien.selected, true);
    assert.equal(parrainageStatut.textContent, '');
  }
});

test('la déconnexion efface le lien et écarte la confirmation d’une copie en cours', async () => {
  const attente = differe();
  const b = navigateur({
    parrainage: { code: 'PARRAINTEST' },
    clipboard: { writeText: () => attente.promise },
  });
  await b.flush();
  const copie = b.elements.parrainageCopier.listeners.click();
  b.evenement('SIGNED_OUT', null);
  await b.flush();
  attente.resolve();
  await copie;
  assert.equal(b.elements.parrainageBox.hidden, true);
  assert.equal(b.elements.parrainageLien.value, '');
  assert.equal(b.elements.parrainageCopieManuelle.hidden, true);
  assert.equal(b.elements.parrainageStatut.textContent, '');
});

test('un document unique reste directement accessible sans outils de recherche', async () => {
  const achats = [historique()[1]];
  const b = navigateur({ achats }); await b.flush();
  assert.equal(b.elements.achatsOutils.hidden, true);
  assert.equal(b.elements.achatsResultat.textContent, '');
  b.chercher('un autre document');
  assert.match(b.elements.achatsListe.innerHTML, /href="https:\/\/example\.invalid\/personnes\.pdf"/);
});

test('plusieurs documents d’une même commande gardent les outils de recherche', async () => {
  const b = navigateur({ achats: historique().slice(0, 1) }); await b.flush();
  assert.equal(b.elements.achatsOutils.hidden, false);
  assert.equal(b.elements.achatsResultat.textContent, '1 achat affiché sur 1');
  b.chercher('vidéo');
  assert.match(b.elements.achatsListe.innerHTML, /<details open><summary>Droit des contrats<\/summary>/);
  assert.equal(b.elements.achatsOutils.hidden, false);
});

test('la recherche ignore les accents et cherche tous les mots dans un groupe du Pack Ultra', async () => {
  const b = navigateur(); await b.flush(); b.chercher('CONTRATS video');
  const rendu = b.elements.achatsListe.innerHTML;
  assert.match(rendu, /<details open><summary>Droit des contrats<\/summary>/);
  assert.match(rendu, /contrats.mp4/);
  assert.doesNotMatch(rendu, /contrats.pdf|admin.m4a|personnes.pdf/);
  assert.equal(b.elements.achatsResultat.textContent, '1 achat affiché sur 3');
});

test('le volet reste replié si plusieurs fichiers correspondent dans des achats distincts', async () => {
  const achats = historique();
  achats[1].produits[0].fichiers[0].nom = 'La personnalité juridique en vidéo';
  const b = navigateur({ achats }); await b.flush();
  b.chercher('vidéo');
  assert.match(b.elements.achatsListe.innerHTML, /contrats\.mp4/);
  assert.match(b.elements.achatsListe.innerHTML, /personnes\.pdf/);
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /<details open>/);

  b.filtrer('achatsProduit', 'Droit des contrats');
  assert.match(b.elements.achatsListe.innerHTML, /<details open><summary>Droit des contrats<\/summary>/);

  b.chercher('contrat');
  assert.match(b.elements.achatsListe.innerHTML, /contrats\.pdf/);
  assert.match(b.elements.achatsListe.innerHTML, /contrats\.mp4/);
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /<details open>/);

  b.chercher('vidéo');
  b.effacer();
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /<details open>/);
  assert.equal(b.elements.achatsResultat.textContent, '3 achats affichés sur 3');
});

const panneServeur = { ok: false, status: 500 };
const reponseAchats = (achats = historique()) => ({ ok: true, status: 200, json: async () => ({ achats }) });

test('l’aide apparaît après un historique vide confirmé et disparaît dès le changement de session', async () => {
  const premier = differe();
  const second = differe();
  let nombre = 0;
  const b = navigateur({ fetch: () => ++nombre === 1 ? premier.promise : second.promise });
  await b.flush();
  assert.equal(b.elements.achatsAide.hidden, true);
  premier.resolve(reponseAchats([]));
  await b.flush();
  assert.equal(b.elements.achatsAide.hidden, false);

  b.evenement('SIGNED_IN', { access_token: 'autre-session' });
  assert.equal(b.elements.achatsAide.hidden, true);
  await b.flush();
  assert.equal(b.elements.achatsAide.hidden, true);
  second.resolve({ ok: false, status: 503 });
  await b.flush();
  assert.equal(b.elements.achatsAide.hidden, true);
  assert.equal(b.elements.achatsReessayer.hidden, false);
  await b.elements.deconnexionBtn.listeners.click();
  assert.equal(b.elements.achatsAide.hidden, true);
});

function historiquePdf(expiration, sessions = ['cs_test_commande_a', 'cs_test_commande_b']) {
  return sessions.map((sessionId, commande) => ({
    sessionId, date: commande ? '2026-11-19' : '2026-11-20',
    produits: ['fiche-da-l2-s1', 'fiche-da-l2-s2'].map(id => ({
      id, nom: produits[id].nom,
      fichiers: [0, 1].map(index => ({
        nom: 'la fiche complète', type: 'pdf', groupe: 'Droit administratif',
        url: 'https://trajectoiredroit.com/api/telecharger?' + new URLSearchParams({
          id, b: String(index), exp: String(expiration),
          sig: genererToken(id, index, expiration, 'secret-de-test', sessionId),
          ...(sessionId ? { sid: sessionId } : {}),
        }),
      })),
    })),
  }));
}

function commandesAvecPodcast(expiration) {
  const commandes = historiquePdf(expiration);
  const commande = commandes[0];
  const produit = commande.produits[0];
  const url = 'https://trajectoiredroit.com/api/telecharger?' + new URLSearchParams({
    id: produit.id, b: '2', exp: String(expiration), sid: commande.sessionId,
    sig: genererToken(produit.id, 2, expiration, 'secret-de-test', commande.sessionId),
  });
  produit.fichiers.push({ nom: 'Le podcast', type: 'audio', groupe: 'Droit administratif', url });
  return commandes;
}

function selectionnerDocuments(b) {
  b.chercher('droit administratif');
  b.filtrer('achatsProduit', 'Droit administratif');
  b.filtrer('achatsSemestre', '1');
}

function lecteurEnCours(b) {
  const lecteur = {
    paused: false, ended: false, isConnected: true, currentTime: 18,
    lectures: 0, arrets: 0,
    pause() { this.paused = true; },
    replaceChildren() { this.arrets++; },
    load() { this.currentTime = 0; },
    play() { this.lectures++; return Promise.reject(new Error('Le navigateur demande un geste')); }
  };
  b.elements.achatsListe.lecteurs = [lecteur];
  return lecteur;
}

test('la même identité et les mêmes droits gardent les filtres et le lecteur après contrôle', async () => {
  const maintenant = 1_800_000_000;
  const avant = commandesAvecPodcast(maintenant - 1);
  const apres = commandesAvecPodcast(maintenant + 900);
  const apresDeuxiemeClic = commandesAvecPodcast(maintenant + 1801);
  const attente = differe();
  let nombre = 0;
  const b = navigateur({ maintenant: maintenant * 1000, fetch: () => {
    if (++nombre === 1) return reponseAchats(avant);
    if (nombre === 2) return attente.promise;
    return reponseAchats(apresDeuxiemeClic);
  } });
  await b.flush();
  selectionnerDocuments(b);
  const lecteur = lecteurEnCours(b);
  const liste = b.elements.achatsListe.innerHTML;
  b.evenement('TOKEN_REFRESHED', { access_token: 'jeton-renouvele' });
  await b.flush();
  assert.ok(b.elements.etatChargement.classList.contains('is-active'));
  assert.equal(lecteur.paused, true);
  assert.equal(lecteur.lectures, 0);
  attente.resolve(reponseAchats(apres));
  await b.flush();
  assert.ok(b.elements.etatConnecte.classList.contains('is-active'));
  assert.equal(b.elements.achatsListe.innerHTML, liste);
  assert.equal(b.elements.achatsRecherche.value, 'droit administratif');
  assert.equal(b.elements.achatsProduit.value, 'Droit administratif');
  assert.equal(b.elements.achatsSemestre.value, '1');
  assert.equal(lecteur.lectures, 1);
  assert.equal(lecteur.currentTime, 18);
  assert.equal(lecteur.arrets, 0);
  assert.equal(b.cliquerPdf(0).renouvellement, false);
  b.avancerTemps(901_000);
  await b.cliquerPdf(0).fin;
  assert.deepEqual(b.destinations, [apresDeuxiemeClic[0].produits[0].fichiers[0].url]);
  assert.deepEqual(JSON.parse(b.demandes[2].req.body), { accessToken: 'jeton-renouvele' });
});

test('une identité différente ou un podcast retiré efface la lecture et les filtres précédents', async () => {
  const maintenant = 1_800_000_000;
  for (const autreTitulaire of [false, true]) {
    const avant = commandesAvecPodcast(maintenant + 900);
    const apres = commandesAvecPodcast(maintenant + 1800);
    if (!autreTitulaire) apres[0].produits[0].fichiers.pop();
    let nombre = 0;
    const b = navigateur({ maintenant: maintenant * 1000,
      identite: jeton => autreTitulaire ? jeton : 'meme-titulaire',
      fetch: () => reponseAchats(++nombre === 1 ? avant : apres)
    });
    await b.flush();
    selectionnerDocuments(b);
    const lecteur = lecteurEnCours(b);
    b.evenement('TOKEN_REFRESHED', { access_token: 'jeton-renouvele' });
    await b.flush();
    assert.equal(b.elements.achatsRecherche.value, '');
    assert.equal(b.elements.achatsProduit.value, '');
    assert.equal(b.elements.achatsSemestre.value, '');
    assert.equal(lecteur.arrets, 1);
    assert.equal(lecteur.lectures, 0);
    assert.equal(b.elements.achatsListe.innerHTML.includes('Le podcast'), autreTitulaire);
  }
});

test('les réponses de deux renouvellements rapprochés ne rouvrent pas le compte après déconnexion', async () => {
  const maintenant = 1_800_000_000;
  const commandes = commandesAvecPodcast(maintenant + 900);
  const attentes = [differe(), differe()];
  let nombre = 0;
  const b = navigateur({ maintenant: maintenant * 1000,
    fetch: () => nombre++ === 0 ? reponseAchats(commandes) : attentes[nombre - 2].promise
  });
  await b.flush();
  selectionnerDocuments(b);
  const lecteur = lecteurEnCours(b);
  for (const jeton of ['renouvellement-1', 'renouvellement-2']) {
    b.evenement('TOKEN_REFRESHED', { access_token: jeton });
    await b.flush();
  }
  assert.equal(b.demandes.length, 3);
  await b.elements.deconnexionBtn.listeners.click();
  attentes[1].resolve(reponseAchats(commandes));
  attentes[0].resolve(reponseAchats(commandes));
  await b.flush();
  assert.ok(b.elements.etatConnexion.classList.contains('is-active'));
  assert.equal(b.elements.achatsListe.innerHTML, '');
  assert.equal(b.elements.achatsRecherche.value, '');
  assert.equal(lecteur.lectures, 0);
  assert.ok(lecteur.arrets > 0);
});

test('une panne pendant le renouvellement efface les anciens accès et le réessai utilise la nouvelle session', async () => {
  const maintenant = 1_800_000_000;
  const commandes = commandesAvecPodcast(maintenant + 900);
  let nombre = 0;
  const b = navigateur({ maintenant: maintenant * 1000, fetch: () => {
    return ++nombre === 2 ? { ok: false, status: 503 } : reponseAchats(commandes);
  } });
  await b.flush();
  selectionnerDocuments(b);
  const lecteur = lecteurEnCours(b);
  b.evenement('TOKEN_REFRESHED', { access_token: 'jeton-renouvele' });
  await b.flush();
  assert.equal(b.elements.achatsListe.innerHTML, '');
  assert.equal(b.elements.achatsReessayer.hidden, false);
  assert.equal(lecteur.lectures, 0);
  assert.equal(lecteur.arrets, 1);
  await b.elements.achatsReessayer.listeners.click();
  assert.deepEqual(JSON.parse(b.demandes[2].req.body), { accessToken: 'jeton-renouvele' });
  assert.match(b.elements.achatsListe.innerHTML, /Le podcast/);
  assert.equal(b.elements.achatsReessayer.hidden, true);
});

test('un téléchargement engagé avant le renouvellement est ignoré même si la même session garde ses achats', async () => {
  const maintenant = 1_800_000_000;
  const attente = differe();
  let nombre = 0;
  const b = navigateur({ maintenant: maintenant * 1000, fetch: () => {
    if (++nombre === 1) return reponseAchats(commandesAvecPodcast(maintenant - 1));
    if (nombre === 2) return attente.promise;
    return reponseAchats(commandesAvecPodcast(maintenant + 900));
  } });
  await b.flush();
  selectionnerDocuments(b);
  const ancienClic = b.cliquerPdf(0);
  b.evenement('TOKEN_REFRESHED', { access_token: 'jeton-renouvele' });
  await b.flush();
  attente.resolve(reponseAchats(commandesAvecPodcast(maintenant + 900)));
  await ancienClic.fin;
  assert.deepEqual(b.destinations, []);
  assert.equal(b.elements.achatsRecherche.value, 'droit administratif');
  assert.equal(b.cliquerPdf(0).renouvellement, false);
});

test('le clic garde les liens valides immédiats et renouvelle uniquement le PDF choisi après expiration', async () => {
  const maintenant = 1_800_000_000;
  const avant = historiquePdf(maintenant + 900);
  const initial = avant[1].produits[1].fichiers[1].url;
  const apres = historiquePdf(maintenant + 1801);
  const attendu = apres[1].produits[1].fichiers[1].url;
  apres[1].produits[1].fichiers.push(apres[1].produits[1].fichiers[1]);
  apres.reverse();
  const attente = differe();
  let nombre = 0;
  const b = navigateur({ maintenant: maintenant * 1000, fetch: () => ++nombre === 1 ? reponseAchats(avant) : attente.promise });
  await b.flush();
  b.chercher('fiche');
  b.filtrer('achatsProduit', 'Droit administratif');
  b.filtrer('achatsSemestre', '2');
  const listeFiltree = b.elements.achatsListe.innerHTML;
  assert.equal(b.cliquerPdf(3).renouvellement, false);
  assert.equal(b.demandes.length, 1);

  b.avancerTemps(901_000);
  const clic = b.cliquerPdf(3);
  assert.equal(clic.renouvellement, true);
  assert.equal(b.cliquerPdf(3).renouvellement, true);
  assert.equal(b.elements.achatsVide.textContent, 'Chargement des documents…');
  assert.equal(b.demandes.length, 2);
  assert.equal(b.demandes[1].url, '/api/mes-telechargements');
  assert.equal(b.demandes[1].req.cache, 'no-store');
  assert.deepEqual(JSON.parse(b.demandes[1].req.body), { accessToken: 'jeton-factice' });
  attente.resolve(reponseAchats(apres));
  await clic.fin;
  assert.deepEqual(b.destinations, [attendu]);
  assert.equal(b.elements.achatsListe.innerHTML,
    listeFiltree.replace(initial.replaceAll('&', '&amp;'), attendu.replaceAll('&', '&amp;')));
  assert.equal(b.elements.achatsRecherche.value, 'fiche');
  assert.equal(b.elements.achatsProduit.value, 'Droit administratif');
  assert.equal(b.elements.achatsSemestre.value, '2');
  assert.equal(b.elements.achatsVide.style.display, 'none');
  assert.equal(b.cliquerPdf(3).renouvellement, false);
  assert.equal(b.demandes.length, 2);
});

test('un renouvellement interrompu se réessaie sans partir sur un ancien lien ni un autre PDF', async () => {
  const maintenant = 1_800_000_000;
  const avant = historiquePdf(maintenant - 1);
  const sansFichier = historiquePdf(maintenant + 900);
  const apres = historiquePdf(maintenant + 900);
  const attendu = apres[0].produits[0].fichiers[0].url;
  sansFichier[0].produits[0].fichiers.shift();
  let nombre = 0;
  const b = navigateur({ maintenant: maintenant * 1000, fetch: async () => {
    ++nombre;
    if (nombre === 1) return reponseAchats(avant);
    if (nombre === 2) throw new Error('Réseau indisponible');
    return reponseAchats(nombre === 3 ? sansFichier : apres);
  } });
  await b.flush();
  await b.cliquerPdf(0).fin;
  assert.equal(b.elements.achatsReessayer.hidden, false);
  assert.deepEqual(b.destinations, []);
  await b.elements.achatsReessayer.listeners.click();
  assert.equal(b.elements.achatsReessayer.hidden, false);
  assert.deepEqual(b.destinations, []);
  await b.elements.achatsReessayer.listeners.click();
  assert.deepEqual(b.destinations, [attendu]);
  assert.equal(b.elements.achatsReessayer.hidden, true);
});

test('un PDF renouvelé pour une session précédente ne se télécharge pas après une déconnexion ou un changement de compte', async () => {
  const maintenant = 1_800_000_000;
  for (const [evenement, session] of [
    ['SIGNED_OUT', null],
    ['SIGNED_IN', { access_token: 'autre-jeton-factice' }],
    ['TOKEN_REFRESHED', { access_token: 'jeton-rafraichi-factice' }],
  ]) {
    const attente = differe();
    let nombre = 0;
    const b = navigateur({ maintenant: maintenant * 1000, fetch: () => {
      ++nombre;
      if (nombre === 1) return reponseAchats(historiquePdf(maintenant - 1));
      if (nombre === 2) return attente.promise;
      return reponseAchats([]);
    } });
    await b.flush();
    const clic = b.cliquerPdf(0);
    b.evenement(evenement, session);
    await b.flush();
    attente.resolve(reponseAchats(historiquePdf(maintenant + 900)));
    await clic.fin;
    assert.deepEqual(b.destinations, []);
    assert.equal(b.elements.achatsReessayer.hidden, true);
    assert.doesNotMatch(b.elements.achatsListe.innerHTML, /data-pdf-compte/);
  }
});

test('une ancienne commande sans identifiant Stripe renouvelle son propre PDF', async () => {
  const maintenant = 1_800_000_000;
  const avant = historiquePdf(maintenant - 1, [null, null]);
  const apres = historiquePdf(maintenant + 900, [null, null]);
  let nombre = 0;
  const b = navigateur({
    maintenant: maintenant * 1000,
    fetch: () => reponseAchats(++nombre === 1 ? avant : apres),
  });
  await b.flush();
  await b.cliquerPdf(4).fin;
  assert.deepEqual(b.destinations, [apres[1].produits[0].fichiers[0].url]);
});

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
  assert.equal(b.elements.achatsVide.textContent, 'Aucun achat associé à cette adresse. Pour retrouver un achat, il faut utiliser l’adresse indiquée sur le reçu. Si c’est un cadeau, connecte-toi avec l’adresse à laquelle il a été envoyé.');
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
  assert.doesNotMatch(b.elements.achatsListe.innerHTML, /<details open>/);
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

test('rechercher s1 ou semestre 1, s2 ou semestre 2, retrouve le semestre demandé', async () => {
  const b = navigateur({
    achats: [{ date: '2026-11-23', produits: fichesAdministratif() }]
  });
  await b.flush();
  for (const semestre of [1, 2]) {
    const opposé = semestre === 1 ? 2 : 1;
    for (const variante of ['S' + semestre, 'semestre ' + semestre]) {
      b.chercher('droit administratif ' + variante);
      assert.match(b.elements.achatsListe.innerHTML, new RegExp('Droit administratif L2 S' + semestre));
      assert.doesNotMatch(b.elements.achatsListe.innerHTML, new RegExp('Droit administratif L2 S' + opposé));
    }
  }
  b.chercher('semestre 1 droit des biens');
  assert.equal(b.elements.achatsListe.innerHTML, '');
  b.chercher('semestre 12');
  assert.equal(b.elements.achatsListe.innerHTML, '');
  assert.equal(b.demandes.length, 1);
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
  assert.equal(b.elements.achatsAide.hidden, true);
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

function fichesAdministratif() {
  return ['fiche-da-l2-s1', 'fiche-da-l2-s2'].map(id => {
    const produit = produits[id];
    const fichiers = construireLiensTelechargement(id, produit, 'secret-de-test', 'https://example.invalid', 900,
      { sessionId: 'cs_test_panier_deux_semestres' });
    return { id, nom: produit.nom, fichiers };
  });
}

function sectionsProduits(rendu) {
  return rendu.split(/<div class="achat-produit"(?=[\s>])/).slice(1);
}

function telechargements(rendu) {
  return Array.from(rendu.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>(Télécharger [^<>]+)<\/a>/g),
    ([, href, libelle]) => ({ href: href.replaceAll('&amp;', '&'), libelle }));
}

test('une commande de deux semestres sépare les six liens par produit et affiche sa date une fois', async () => {
  const fiches = fichesAdministratif();
  const b = navigateur({ achats: [{ date: '2026-11-19T12:00:00Z', produits: fiches }] });
  await b.flush();
  const rendu = b.elements.achatsListe.innerHTML;
  const sections = sectionsProduits(rendu);

  assert.equal((rendu.match(/<li\b/g) || []).length, 1);
  assert.equal((rendu.match(/<span class="achat-date"[^>]*>19\/11\/2026<\/span>/g) || []).length, 1);
  assert.equal(sections.length, 2);
  assert.equal(b.elements.achatsResultat.textContent, '1 achat affiché sur 1');
  for (const [index, fiche] of fiches.entries()) {
    const section = sections[index];
    assert.ok(section.includes('<h3 class="achat-produit__titre">' + fiche.nom + '</h3>'));
    assert.deepEqual(telechargements(section), [
      { href: fiche.fichiers[0].url, libelle: 'Télécharger la fiche complète' },
      { href: fiche.fichiers[1].url, libelle: 'Télécharger le plan' },
      { href: fiche.fichiers[2].url, libelle: 'Télécharger la carte mentale' }
    ]);
    assert.equal(telechargements(section).every(lien => new URL(lien.href).searchParams.get('id') === fiche.id), true);
  }
});

test('filtrer un panier sur le semestre 2 conserve les bons liens et effacer restaure le regroupement', async () => {
  const fiches = fichesAdministratif();
  const commandes = [{ date: '2026-11-19T12:00:00Z', produits: fiches }];
  const copie = JSON.stringify(commandes);
  const b = navigateur({ achats: commandes });
  await b.flush();
  const initial = b.elements.achatsListe.innerHTML;

  b.filtrer('achatsSemestre', '2');
  const filtre = b.elements.achatsListe.innerHTML;
  assert.match(filtre, /Fiche complète Droit administratif L2 S2/);
  assert.doesNotMatch(filtre, /L2 S1|fiche-da-l2-s1/);
  assert.deepEqual(telechargements(filtre).map(lien => lien.href), fiches[1].fichiers.map(fichier => fichier.url));
  assert.equal((filtre.match(/class="achat-date"/g) || []).length, 1);
  assert.equal(b.elements.achatsResultat.textContent, '1 achat affiché sur 1');

  b.effacer();
  assert.equal(b.elements.achatsListe.innerHTML, initial);
  assert.equal(JSON.stringify(commandes), copie);
  assert.equal(b.demandes.length, 1);
});

test('un achat mono-produit conserve ses groupes et deux packs gardent leurs groupes homonymes séparés', async () => {
  const ancienPack = historique()[0].produits[0];
  const autrePack = { id: 'pack-l2-s2-factice', nom: 'Pack L2 S2 de test', fichiers: [
    { nom: 'Le dossier d’exercices', groupe: 'Droit des contrats', url: 'https://example.invalid/exercices-s2.pdf' }
  ] };
  const b = navigateur({ achats: [
    { date: '2026-10-20T12:00:00Z', produits: [ancienPack, autrePack] },
    { date: '2026-10-10T12:00:00Z', produits: [ancienPack] }
  ] });
  await b.flush();
  const commandesRendues = b.elements.achatsListe.innerHTML.split(/(?=<li\b)/);
  assert.equal(commandesRendues.length, 2);
  const [multi, mono] = commandesRendues;
  assert.equal(sectionsProduits(mono).length, 0);
  assert.match(mono, /<summary>Droit des contrats<\/summary>/);
  assert.match(mono, /contrats\.mp4/);
  assert.match(mono, /admin\.m4a/);

  const [premierPack, secondPack] = sectionsProduits(multi);
  assert.equal(sectionsProduits(multi).length, 2);
  assert.match(premierPack, /<summary>Droit des contrats<\/summary>/);
  assert.match(premierPack, /contrats\.pdf/);
  assert.match(premierPack, /<video[\s\S]*contrats\.mp4/);
  assert.match(premierPack, /<audio[\s\S]*admin\.m4a/);
  assert.doesNotMatch(premierPack, /exercices-s2\.pdf/);
  assert.match(secondPack, /<summary>Droit des contrats<\/summary>/);
  assert.match(secondPack, /exercices-s2\.pdf/);
  assert.doesNotMatch(secondPack, /contrats\.pdf|contrats\.mp4|admin\.m4a/);
});

test('les titres des produits, des groupes et des fichiers apparaissent comme texte dans le panier', async () => {
  const fiches = fichesAdministratif();
  fiches[0].nom = 'Fiche <em> S1 & "cours"';
  fiches[0].fichiers[0].groupe = 'Groupe <em> & notes';
  fiches[0].fichiers[0].nom = 'la fiche <em> & le cours';
  fiches[0].fichiers[1].groupe = 'constructor';
  const b = navigateur({ achats: [{ date: '2026-11-19T12:00:00Z', produits: fiches }] });
  await b.flush();
  const [premiereSection] = sectionsProduits(b.elements.achatsListe.innerHTML);
  assert.match(premiereSection, /<h3 class="achat-produit__titre">Fiche &lt;em&gt; S1 &amp; &quot;cours&quot;<\/h3>/);
  assert.match(premiereSection, /<summary>Groupe &lt;em&gt; &amp; notes<\/summary>/);
  assert.match(premiereSection, /Télécharger la fiche &lt;em&gt; &amp; le cours/);
  assert.match(premiereSection, /<summary>constructor<\/summary>/);
  assert.doesNotMatch(premiereSection, /<em>/);
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
  assert.equal(paquets.length, 16);
  const liensAnki = Array.from(rendu.matchAll(/href="([^"]+)"[^>]*>Télécharger [^<>]+<\/a><a [^>]*href="flashcards-qcm\.html#importer-anki"[^>]*>Importer les cartes dans Anki<\/a>/g), m => m[1].replaceAll('&amp;', '&'));
  assert.deepEqual(liensAnki, paquets.map(fichier => fichier.url));
  assert.match(rendu, /<audio controls/);
  assert.match(rendu, /<video controls/);

  const guide = fs.readFileSync(path.join(__dirname, '../flashcards-qcm.html'), 'utf8');
  assert.match(guide, /<div class="accordion__body" id="importer-anki"[^>]*>\s*<p><strong>Sur ordinateur<\/strong>[^<]+\.apkg/);
  assert.equal((guide.match(/id="importer-anki"/g) || []).length, 1);
});
