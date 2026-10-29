const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/main.js'), 'utf8');
const debut = source.indexOf("  document.addEventListener('submit', function (e) {");
const fin = source.indexOf('  }, true);', debut) + '  }, true);'.length;
assert.ok(debut >= 0 && fin > debut);

async function inscrire({ erreurStockage = false, erreurMesure = false, reponseOk = true } = {}) {
  let submit;
  const alertes = [], appels = [];
  const bouton = { dataset: {}, innerHTML: 'S’inscrire', disabled: false };
  const formulaire = {
    action: 'https://exemple.sibforms.com/serve/formulaire',
    querySelector(selecteur) { return selecteur.includes('input') ? { value: 'eleve@example.com' } : bouton; }
  };
  const window = {
    location: { pathname: '/index.html', href: '' },
    gtag() { if (erreurMesure) throw new Error('Mesure indisponible'); },
    _paq: { push() { if (erreurMesure) throw new Error('Mesure indisponible'); } }
  };
  const contexte = vm.createContext({
    window,
    document: { addEventListener(nom, fn) { submit = fn; } },
    fetch: async (...args) => { appels.push(args); return { ok: reponseOk }; },
    gtag: window.gtag,
    alert: (texte) => alertes.push(texte),
    DOMException
  });
  Object.defineProperty(contexte, 'localStorage', { get() {
    if (erreurStockage) throw new DOMException('Accès interdit', 'SecurityError');
    return { getItem: () => null };
  } });
  vm.runInContext(source.slice(debut, fin), contexte);
  submit({ target: formulaire, preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  return { window, alertes, appels, bouton };
}

test('une inscription réussie reste confirmée lorsque le stockage est refusé', async () => {
  const env = await inscrire({ erreurStockage: true });
  assert.equal(env.appels.length, 1);
  assert.equal(env.window.location.href, '/merci.html');
  assert.deepEqual(env.alertes, []);
});

test('une erreur de mesure conserve la confirmation d’inscription', async () => {
  const env = await inscrire({ erreurMesure: true });
  assert.equal(env.window.location.href, '/merci.html');
  assert.deepEqual(env.alertes, []);
});

test('un refus du serveur réactive le formulaire sans afficher de confirmation', async () => {
  const env = await inscrire({ reponseOk: false });
  assert.equal(env.window.location.href, '');
  assert.equal(env.bouton.disabled, false);
  assert.equal(env.alertes.length, 1);
});
