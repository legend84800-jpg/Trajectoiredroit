const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lead = require('../api/lead');
const produits = require('../api/_produits');
const fiches = require('../api/_fiches-arrets.json');
const plans = require('../api/_plans-commentaires.json');
const recommandations = require('../api/_recommandations-arrets.json');
const exercices = require('../api/_corriges-exercices.json');
const { COMPTES } = require('../api/_corriges-exercices');
const { CORRIGES_OFFERTS } = lead;

const racine = path.join(__dirname, '..');

test('chaque fiche d’arrêt offerte renvoie vers sa page, son PDF et un produit vendu', () => {
  assert.ok(Object.keys(fiches).length >= 90);
  for (const [slug, fiche] of Object.entries(fiches)) {
    assert.ok(fs.existsSync(path.join(racine, fiche.page)), fiche.page);
    assert.ok(produits[fiche.produit], fiche.produit);
    assert.match(fiche.pdf, /^https:\/\/pub-[0-9a-f]+\.r2\.dev\/tjd\/fiche-arret\/.+\.pdf$/);
    const a = lead.attributsFiche(slug);
    assert.equal(a.SOURCE, 'fiche-arret');
    for (const [cle, valeur] of Object.entries(a)) {
      if (cle.startsWith('FICHE_')) assert.ok(valeur && !/undefined/.test(valeur), cle);
    }
    const url = new URL(a.FICHE_URL);
    if (!a.OFFRE_ARRET_FORMAT) {
      assert.equal(url.pathname, '/' + fiche.page);
      assert.equal(url.hash, '#offre-matiere');
    }
    const page = fs.readFileSync(path.join(racine, fiche.page), 'utf8');
    assert.ok(page.includes('id="offre-matiere"'), fiche.page + ' sans ancre #offre-matiere');
    const email = lead.construireEmailFiche(a);
    assert.ok(email.texte.includes(a.FICHE_PDF));
    assert.doesNotMatch(email.texte, /[—–]/);
  }
});

test('les plans offerts et les fiches d’arrêt renvoient vers les supports de l’arrêt demandé', () => {
  const controles = new Set();
  const formats = new Set();
  const formulaires = new Set();
  for (const [produit, recommandation] of Object.entries(recommandations)) {
    assert.ok(produits[produit], produit);
    const destination = new URL(recommandation.destination, 'https://trajectoiredroit.com');
    const cible = fs.readFileSync(path.join(racine, destination.pathname.slice(1)), 'utf8');
    const position = cible.indexOf('id="' + destination.hash.slice(1) + '"');
    assert.ok(position >= 0, recommandation.destination);
    const bloc = cible.slice(position).match(/^[\s\S]*?<\/(?:article|section)>/)[0];
    assert.ok(bloc.includes('data-tjd-produit="' + produit + '"'), produit);

    for (const slug of recommandation.plans) {
      assert.ok(plans[slug] && !controles.has(slug), slug);
      controles.add(slug);
      const plan = plans[slug];
      const page = plan.page;
      const article = fs.readFileSync(path.join(racine, page), 'utf8');
      if (plan.compilation) assert.doesNotMatch(article, /data-tjd-produit="coma-/);
      else assert.ok(article.includes('id="commentaire-integral"') && article.includes('data-tjd-produit="' + plan.produit + '"'), slug);
      assert.equal((article.match(/\bdata-tjd-plan\b|data-tjd-pdf-offert="fiche"/g) || []).length, 1, page);
      const id = page.replace(/\.html$/, '');
      const aPlan = lead.attributsPlan(slug);
      const verifierEmail = (attributs, url, email, pdf) => {
        const offre = new URL(url);
        assert.equal(offre.pathname, destination.pathname);
        assert.equal(offre.hash, destination.hash);
        assert.equal(offre.searchParams.get('utm_campaign'), attributs.SOURCE);
        assert.equal(offre.searchParams.get('utm_content'), attributs.PLAN_SLUG || attributs.FICHE_SLUG);
        assert.ok(email.texte.includes(pdf) && email.texte.includes(url), page);
        assert.ok(email.texte.indexOf(pdf) < email.texte.indexOf(url), page);
        assert.equal((email.html.match(/<a href="/g) || []).length, 2, page);
        assert.doesNotMatch(email.texte, /4,99|\brecueil\b|undefined/i);
        formats.add(attributs.OFFRE_ARRET_FORMAT);
      };
      const emailPlan = lead.construireEmailPlan({ ...aPlan, PRENOM: 'Camille' });
      const offrePlan = new URL(aPlan.PLAN_URL);
      assert.equal(offrePlan.pathname, plan.compilation ? '/commentaires-arret-corriges.html' : '/' + page);
      assert.equal(offrePlan.hash, plan.compilation ? '#' + plan.compilation : '#commentaire-integral');
      assert.equal(offrePlan.searchParams.get('utm_content'), slug);
      assert.match(aPlan.PLAN_PDF, /\/plan-commentaire\/extraits\/coma-.+-[0-9a-f]{12}\.pdf$/);
      assert.match(emailPlan.sujet, /^Ton plan offert pour commenter /);
      assert.match(emailPlan.texte, /^Salut Camille,/);
      assert.match(emailPlan.texte, /le I\.A\. rédigé/);
      assert.match(emailPlan.texte, /Ensuite, une fois que tu as fini, compare ce que tu as fait avec mon commentaire corrigé\./);
      assert.match(emailPlan.texte, /thème de l’arrêt\.\n\nCependant,[^\n]+corrections complètes\./);
      assert.match(emailPlan.texte, /Je travaille tous les jours depuis deux ans sur mes fiches afin de créer les meilleures fiches de droit en France\./);
      assert.match(emailPlan.texte, /Si tu as une question sur le commentaire,[^\n]+en répondant à cet email\.\n\nRespectueusement,\nJulien\nTrajectoire Droit$/);
      assert.ok(emailPlan.html.includes('Respectueusement,<br>Julien<br>Trajectoire Droit'), slug);
      assert.ok(emailPlan.texte.includes(aPlan.PLAN_PDF) && emailPlan.texte.includes(aPlan.PLAN_URL));
      assert.equal((emailPlan.html.match(/<a href="/g) || []).length, 3, slug);
      const offreFiche = new URL(aPlan.PLAN_FICHE_URL);
      assert.equal(offreFiche.pathname, '/formations.html');
      assert.equal(offreFiche.hash, '#' + plan.fiche);
      assert.ok(fs.readFileSync(path.join(racine, 'formations.html'), 'utf8').includes('id="' + plan.fiche + '"'));
      assert.ok(emailPlan.texte.includes(aPlan.PLAN_FICHE_URL));
      if (plan.compilation) assert.ok(emailPlan.texte.includes((COMPTES[plan.compilation] - 1) + ' autres commentaires'), slug);
      formats.add(aPlan.OFFRE_ARRET_FORMAT);
      if (fiches[id]) {
        assert.ok(article.includes('data-id="' + id + '"'));
        const aFiche = lead.attributsFiche(id);
        verifierEmail(aFiche, aFiche.FICHE_URL, lead.construireEmailFiche(aFiche), aFiche.FICHE_PDF);
        formulaires.add('fiche');
      } else {
        assert.ok(article.includes('data-plan="' + slug + '"'));
        formulaires.add('plan');
      }
    }
  }
  assert.deepEqual(controles, new Set(Object.keys(plans)));
  assert.deepEqual(formats, new Set(['compilation', 'commentaire', 'majeures', 'fiche']));
  assert.deepEqual(formulaires, new Set(['fiche', 'plan']));
});

test('chaque carte du premier écran vise un PDF que /api/lead sait livrer', () => {
  const pages = fs.readdirSync(racine).filter(f => f.endsWith('.html'));
  let cartes = 0;
  for (const page of pages) {
    const html = fs.readFileSync(path.join(racine, page), 'utf8');
    const blocs = [...html.matchAll(/<div data-tjd-pdf-offert="([a-z]+)"(?: data-id="([^"]*)")?[^>]*><\/div>/g)];
    if (!blocs.length) continue;
    assert.equal(blocs.length, 1, page + ' porte plusieurs cartes');
    assert.match(html, /<script src="\/assets\/js\/pdf-offert\.js\?v=[0-9a-f]{8}" defer><\/script>/, page);
    const [, type, id] = blocs[0];
    if (type === 'fiche') assert.ok(fiches[id], page + ' : fiche ' + id);
    else if (type === 'exercice') assert.ok(exercices[id], page + ' : exercice ' + id);
    else if (type === 'matiere') assert.ok(!id || CORRIGES_OFFERTS[id], page + ' : matière ' + id);
    else assert.fail(page + ' : type inconnu ' + type);
    assert.doesNotMatch(blocs[0][0], /[—–]/, page);
    cartes += 1;
  }
  assert.ok(cartes >= 120, cartes + ' cartes seulement');
});
