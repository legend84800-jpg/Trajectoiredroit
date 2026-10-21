const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/cookie-consent.js'), 'utf8');

function browser({ stored, legacy, url = 'https://trajectoiredroit.com/formations.html', internal = false, blocked = false, tracker } = {}) {
  const storage = new Map();
  if (stored) storage.set('tjd_consent_v2', JSON.stringify(stored));
  if (legacy) storage.set('tjd_consent', legacy);
  const events = [], scripts = [], ga = [], meta = [], windowHandlers = new Map();
  const roots = [];
  const activeElement = { focus() {} };

  class Element {
    constructor(tagName) {
      this.tagName = tagName;
      this.attributes = new Map();
      this.handlers = new Map();
      this.controls = new Map();
      this.style = {};
      this.className = '';
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    set innerHTML(value) {
      this.html = value;
      for (const match of value.matchAll(/\b(data-cookie-[a-z-]+)(?:="([^"]*)")?/g)) {
        const selector = '[' + match[1] + (match[2] ? '="' + match[2] + '"' : '') + ']';
        const element = new Element('button');
        element.setAttribute(match[1], match[2] || '');
        if (match[1] === 'data-cookie-switch') element.setAttribute('aria-checked', 'false');
        this.controls.set(selector, element);
      }
    }
    querySelector(selector) { return this.controls.get(selector) || null; }
    querySelectorAll(selector) {
      return [...this.controls].filter(([key]) => key.startsWith(selector.slice(0, -1) + '=')).map(([, element]) => element);
    }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    addEventListener(name, handler) {
      if (!this.handlers.has(name)) this.handlers.set(name, []);
      this.handlers.get(name).push(handler);
    }
    fire(name, detail = {}) { for (const handler of this.handlers.get(name) || []) handler({ target: this, ...detail }); }
    click() { this.fire('click'); }
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    remove() { const index = roots.indexOf(this); if (index >= 0) roots.splice(index, 1); }
    insertAdjacentElement() {}
  }
  const documentHandlers = new Map();
  const document = {
    activeElement,
    createElement: (tagName) => new Element(tagName),
    head: { appendChild(element) { scripts.push(element); } },
    body: { appendChild(element) { roots.push(element); } },
    querySelector(selector) {
      if (selector.startsWith('footer a')) return new Element('a');
      if (selector.startsWith('.')) return roots.find((element) => '.' + element.className === selector) || null;
      return null;
    },
    addEventListener(name, handler) {
      if (!documentHandlers.has(name)) documentHandlers.set(name, []);
      documentHandlers.get(name).push(handler);
    },
  };
  const window = {
    location: new URL(url),
    tjdTestInterne: internal,
    AtelierComportement: tracker,
    gtag: (...arguments_) => ga.push(arguments_),
    fbq: (...arguments_) => meta.push(arguments_),
    addEventListener(name, handler) {
      if (!windowHandlers.has(name)) windowHandlers.set(name, []);
      windowHandlers.get(name).push(handler);
    },
    dispatchEvent(event) {
      events.push(event);
      for (const handler of windowHandlers.get(event.type) || []) handler(event);
    },
  };
  const localStorage = {
    getItem(key) { if (blocked) throw new Error('blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('blocked'); storage.set(key, String(value)); },
  };
  if (typeof tracker === 'function') window.AtelierComportement = tracker(window);
  const context = vm.createContext({
    window, document, localStorage, URL,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: () => 1,
    requestAnimationFrame: (handler) => handler(),
  });
  vm.runInContext(source, context, { filename: 'cookie-consent.js' });
  const load = () => { for (const handler of documentHandlers.get('DOMContentLoaded') || []) handler(); };
  const banner = () => roots.find((element) => element.className === 'cookie-banner');
  const choose = (name) => {
    const control = banner()?.querySelector('[data-cookie-' + name + ']');
    assert.ok(control, 'Contrôle de consentement présent, ' + name);
    control.click();
  };
  const preferences = () => JSON.parse(JSON.stringify(window.tjdCookieConsent.getPreferences()));
  const customize = (choice) => {
    window.tjdCookieConsent.openPreferences();
    const dialog = roots.find((element) => element.className === 'cookie-preferences');
    for (const [name, value] of Object.entries(choice)) dialog.querySelector('[data-cookie-switch="' + name + '"]').setAttribute('aria-checked', value ? 'true' : 'false');
    dialog.querySelector('[data-cookie-save]').click();
    return dialog;
  };
  return { window, storage, events, scripts, ga, meta, load, banner, choose, preferences, customize };
}

test('aucun choix ne charge le traceur et le bandeau explique la relecture avant acceptation', () => {
  const b = browser();
  b.load();
  assert.equal(b.preferences(), null);
  assert.equal(b.scripts.length, 0);
  assert.match(b.banner().html, /relecture masquée des clics et du défilement/i);
});

test('les anciens choix Analytics et Meta gardent leur effet et refusent la nouvelle catégorie', () => {
  for (const config of [
    { stored: { version: 2, analytics: true, advertising: false } },
    { legacy: 'granted' },
    { stored: { version: 2, analytics: true, advertising: true, behavior: 'true' } },
  ]) {
    const b = browser(config);
    assert.equal(b.preferences().analytics, true);
    assert.equal(b.preferences().behavior, false);
    assert.equal(b.scripts.length, 0);
    assert.equal(b.ga[0][2].analytics_storage, 'granted');
  }
});

test('le refus des cookies essentiels laisse toutes les catégories optionnelles désactivées', () => {
  const b = browser();
  b.load(); b.choose('essential');
  assert.deepEqual(b.preferences(), { analytics: false, advertising: false, behavior: false });
  assert.equal(b.storage.get('tjd_consent'), 'denied');
  assert.equal(b.scripts.length, 0);
});

test('une acceptation charge une seule IIFE et ne démarre qu’après son téléchargement', () => {
  const b = browser();
  b.load(); b.choose('accept'); b.choose('accept');
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, '/comportement/tracker.js');
  assert.equal(b.scripts[0].referrerPolicy, 'no-referrer');
  assert.deepEqual(b.preferences(), { analytics: true, advertising: true, behavior: true });
  assert.equal(b.storage.get('tjd_consent'), 'granted');
  let starts = 0;
  b.window.AtelierComportement = { start() { starts++; assert.equal(b.preferences().behavior, true); }, stop() {} };
  b.scripts[0].onload();
  assert.equal(starts, 1);
  assert.equal(b.events.at(-1).type, 'tjd:consent');
  assert.equal(b.events.at(-1).detail.preferences.behavior, true);
});

test('un retrait pendant le téléchargement empêche tout démarrage différé', () => {
  const b = browser();
  b.load(); b.choose('accept'); b.choose('essential');
  let starts = 0, stops = 0;
  b.window.AtelierComportement = { start() { starts++; }, stop() { stops++; } };
  b.scripts[0].onload();
  assert.equal(starts, 0);
  assert.equal(stops, 1);
});

test('la relecture seule reste indépendante de Google et Meta puis s’arrête au retrait', () => {
  const b = browser();
  b.load();
  b.customize({ behavior: true, analytics: false, advertising: false });
  assert.deepEqual(b.preferences(), { analytics: false, advertising: false, behavior: true });
  assert.equal(b.storage.get('tjd_consent'), 'denied');
  assert.equal(b.ga.at(-1)[2].analytics_storage, 'denied');
  assert.ok(!b.meta.some((call) => call[1] === 'grant'));
  let stops = 0;
  b.window.AtelierComportement = { start() {}, stop() { stops++; } };
  b.scripts[0].onload();
  b.customize({ behavior: false });
  assert.equal(stops, 1);
  assert.equal(b.preferences().behavior, false);
});

test('le rapprochement des achats attend le choix actualisé et conserve les anciens choix de navigation', () => {
  const b=browser({stored:{version:2,analytics:true,advertising:false,behavior:true}});
  assert.equal(b.preferences().behavior,true);
  assert.equal(b.preferences().analytics,true);
  assert.equal(b.window.tjdCookieConsent.allowsPurchaseLink(),false);
  b.customize({behavior:true});
  assert.equal(b.window.tjdCookieConsent.allowsPurchaseLink(),true);
  assert.equal(JSON.parse(b.storage.get('tjd_consent_v2')).behaviorPurchaseVersion,3);
  b.customize({behavior:false});
  assert.equal(b.window.tjdCookieConsent.allowsPurchaseLink(),false);
});

test('un retrait depuis un autre onglet et la suppression du stockage arrêtent le traceur', () => {
  let stops = 0;
  const b = browser({ stored: { version: 2, analytics: true, advertising: false, behavior: true }, tracker: { start() {}, stop() { stops++; } } });
  b.storage.set('tjd_consent_v2', JSON.stringify({ version: 2, analytics: true, advertising: false, behavior: false }));
  b.window.dispatchEvent({ type: 'storage', key: 'tjd_consent_v2' });
  assert.equal(stops, 1);
  assert.equal(b.preferences().analytics, true);
  assert.equal(b.preferences().behavior, false);
  b.storage.clear();
  b.window.dispatchEvent({ type: 'storage', key: null });
  assert.equal(stops, 2);
  assert.deepEqual(b.preferences(), { analytics: false, advertising: false, behavior: false });
});

test('la préférence publiée et le détail d’événement ne peuvent pas changer le choix actif', () => {
  const b = browser({ stored: { version: 2, analytics: false, advertising: false, behavior: false } });
  b.window.tjdCookieConsent.getPreferences().behavior = true;
  b.events[0].detail.preferences.behavior = true;
  assert.equal(b.preferences().behavior, false);
  assert.equal(b.scripts.length, 0);
});

for (const address of [
  'https://trajectoiredroit.com/mon-compte.html',
  'https://trajectoiredroit.com/portalis.html',
  'https://trajectoiredroit.com/connexion.html',
  'https://trajectoiredroit.com/merci.html',
  'https://trajectoiredroit.com/merci-achat.html?session_id=cs_factice',
  'https://trajectoiredroit.com/merci-stage.html',
  'https://trajectoiredroit.com/donner-mon-avis.html',
  'https://trajectoiredroit.com/complements.html',
  'https://trajectoiredroit.com/members/tjd/login',
  'https://trajectoiredroit.com/learn/tjd/course',
  'https://trajectoiredroit.com/formations.html?atelier_test',
  'https://trajectoiredroit.com/formations.html?atelier_test=0',
  'https://trajectoiredroit.com/formations.html?tjd_test=1',
  'http://localhost:4173/formations.html',
  'https://preview.vercel.app/formations.html',
  'https://trajectoirephilo.com/',
]) {
  test('aucune collecte sur le parcours exclu ' + address, () => {
    const b = browser({ url: address, stored: { version: 2, analytics: true, advertising: true, behavior: true } });
    assert.equal(b.scripts.length, 0);
  });
}

test('le drapeau interne global et la préférence interne persistante bloquent le chargement', () => {
  const b = browser({ internal: true, stored: { version: 2, analytics: true, advertising: true, behavior: true } });
  assert.equal(b.scripts.length, 0);
  const c = browser(); c.storage.set('tjd_internal_test', '1');
  c.load(); c.choose('accept');
  assert.equal(c.scripts.length, 0);
});

test('la sortie explicite du mode interne autorise le domaine www', () => {
  const b = browser({ url: 'https://www.trajectoiredroit.com/formations.html?tjd_test=0', internal: true, stored: { version: 2, analytics: false, advertising: false, behavior: true } });
  assert.equal(b.scripts.length, 1);
});

test('une indisponibilité du traceur garde le choix et permet de retenter depuis les préférences', () => {
  const b = browser(); b.load(); b.choose('accept');
  b.scripts[0].onerror();
  assert.equal(b.preferences().behavior, true);
  b.customize({ behavior: true });
  assert.equal(b.scripts.length, 2);
});

test('un script reçu sans API reste désactivé et peut être retenté', () => {
  const b = browser(); b.load(); b.choose('accept');
  b.scripts[0].onload();
  assert.equal(b.preferences().behavior, true);
  b.customize({ behavior: true });
  assert.equal(b.scripts.length, 2);
});

test('un stockage indisponible conserve le choix en mémoire pour cette visite', () => {
  const b = browser({ blocked: true }); b.load(); b.choose('accept');
  assert.equal(b.preferences().behavior, true);
  assert.equal(b.scripts.length, 1);
  b.choose('essential');
  assert.equal(b.preferences().behavior, false);
});

test('un traceur déjà chargé peut lire l’API de consentement dès son démarrage', () => {
  let choice;
  browser({
    stored: { version: 2, analytics: false, advertising: false, behavior: true },
    tracker: (window) => ({ start() { choice = window.tjdCookieConsent.getPreferences().behavior; } }),
  });
  assert.equal(choice, true);
});

test('un refus asynchrone du démarrage préserve les préférences sans rejet de Promise non traité', async () => {
  const b = browser({
    stored: { version: 2, analytics: true, advertising: false, behavior: true },
    tracker: { start: () => Promise.reject(new Error('Collecteur indisponible')) },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(b.preferences().behavior, true);
  assert.equal(b.ga.at(-1)[2].analytics_storage, 'granted');
});

test('Vercel transfère le préfixe isolé sans remplacer les routes Conversion', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites.find((rule) => rule.source === '/comportement/:path*'), {
    source: '/comportement/:path*', destination: 'https://stats.trajectoiredroit.com/comportement/:path*',
  });
  assert.equal(config.rewrites.find((rule) => rule.source === '/public/:path*').destination, 'https://stats.trajectoiredroit.com/public/:path*');
});

test('toutes les pages existantes chargent la même version du consentement et Portalis reste exclu', () => {
  const digest = createHash('sha256').update(source).digest('hex').slice(0, 8);
  let references = 0;
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of html.matchAll(/assets\/js\/cookie-consent\.js\?v=([a-f0-9]+)/g)) {
      references++;
      assert.equal(match[1], digest, file + ' emploie la version courante');
    }
  }
  assert.ok(references >= 340, 'Couverture des pages publiques existantes conservée');
  assert.ok(!fs.readFileSync(path.join(root, 'portalis.html'), 'utf8').includes('cookie-consent.js'));
});
