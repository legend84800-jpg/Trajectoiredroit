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
    assert.ok(email.html.includes('<strong style="color:#0E2A47">le problème de droit et la solution</strong>'), slug);
    assert.ok(email.html.includes('<strong style="color:#0E2A47">redis-les à voix haute sans regarder le PDF</strong>'), slug);
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
      assert.doesNotMatch(article, /data-tjd-produit="coma-/);
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
      assert.equal(offrePlan.pathname, plan.compilation ? '/commentaires-arret-corriges.html' : destination.pathname, slug);
      assert.equal(offrePlan.hash, plan.compilation ? '#' + plan.compilation : destination.hash, slug);
      const pageOffrePlan = fs.readFileSync(path.join(racine, offrePlan.pathname.slice(1)), 'utf8');
      assert.ok(pageOffrePlan.includes('id="' + offrePlan.hash.slice(1) + '"'), offrePlan.href);
      assert.equal(offrePlan.searchParams.get('utm_campaign'), 'plan-commentaire');
      assert.equal(offrePlan.searchParams.get('utm_content'), slug);
      assert.match(aPlan.PLAN_PDF, /\/plan-commentaire\/extraits\/coma-.+-[0-9a-f]{12}\.pdf$/);
      assert.match(emailPlan.sujet, /^Ton plan offert pour commenter /);
      assert.match(emailPlan.texte, /^Salut Camille,/);
      assert.ok(emailPlan.html.includes('<strong style="color:#0E2A47">la problématique</strong>'), slug);
      assert.ok(emailPlan.html.includes('<strong style="color:#0E2A47">la solution du juge</strong>'), slug);
      assert.match(emailPlan.texte, /le I\.A\. rédigé|la première sous-partie \(I\.A\.\) rédigée/);
      assert.match(emailPlan.texte, /Si tu as une question sur le commentaire, tu peux m’envoyer un message en répondant à cet email\.\n\nRespectueusement,\nJulien\nTrajectoire Droit$/);
      assert.ok(emailPlan.html.includes('Respectueusement,<br>Julien<br>Trajectoire Droit'), slug);
      assert.ok(emailPlan.texte.includes(aPlan.PLAN_PDF) && emailPlan.texte.includes(aPlan.PLAN_URL));
      assert.equal((emailPlan.html.match(/<a href="/g) || []).length, plan.compilation ? 3 : 2, slug);
      if (plan.compilation) {
        assert.match(emailPlan.texte, /Ensuite, une fois que tu as fini, compare ce que tu as fait avec mon commentaire corrigé\./);
        assert.match(emailPlan.texte, /thème de l’arrêt\.\n\nCependant,[^\n]+corrections complètes\./);
        assert.match(emailPlan.texte, /Je travaille tous les jours depuis deux ans sur mes fiches afin de créer les meilleures fiches de droit en France\./);
        assert.match(emailPlan.texte, /Donc si tu veux réviser avec mes fiches, n’hésite pas à prendre aussi celles de ta matière\./);
        const offreFiche = new URL(aPlan.PLAN_FICHE_URL);
        assert.equal(offreFiche.pathname, '/formations.html');
        assert.equal(offreFiche.hash, '#' + plan.fiche);
        assert.ok(fs.readFileSync(path.join(racine, 'formations.html'), 'utf8').includes('id="' + plan.fiche + '"'));
        assert.ok(emailPlan.texte.includes(aPlan.PLAN_FICHE_URL));
        assert.ok(emailPlan.texte.includes((COMPTES[plan.compilation] - 1) + ' autres commentaires'), slug);
      } else {
        const ancienLien = article.match(/<p id="commentaire-integral">([\s\S]*?)<\/p>/);
        assert.ok(ancienLien, slug);
        assert.ok(ancienLien[1].includes(`href="${destination.pathname.slice(1)}${destination.hash}"`), slug);
        assert.match(ancienLien[1], /Le formulaire juste au-dessus permet de recevoir le plan offert par email/);
        assert.doesNotMatch(emailPlan.texte, /commentaire complet|commentaire rédigé en entier|4,99/i, slug);
      }
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
  assert.deepEqual(formats, new Set(['compilation', 'majeures', 'fiche']));
  assert.deepEqual(formulaires, new Set(['fiche', 'plan']));
});

test('les trois plans hors compilation livrent leur PDF avant le suivi, par un email adapté', async t => {
  const anciennesVariables = {
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    BREVO_LIST_ID: process.env.BREVO_LIST_ID,
  };
  t.after(() => {
    for (const [cle, valeur] of Object.entries(anciennesVariables)) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  });
  process.env.BREVO_API_KEY = 'test-local';
  process.env.BREVO_LIST_ID = '3';
  const appels = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    const route = new URL(url).pathname;
    appels.push({ route, corps: options.body && JSON.parse(options.body) });
    if (!options.method) return Response.json({ listIds: [], attributes: { PRENOM: 'Camille' } });
    return new Response(null, { status: 201 });
  });

  const cas = [
    ['bac-eloka', '/majeures-preparees.html', '#maj-da-l2-s1'],
    ['bardou-1931', '/droit-du-travail-l3.html', '#offre'],
    ['solidarite-commerciale-1920', '/droit-commercial-l3.html', '#offre'],
  ];
  for (const [index, [slug, chemin, ancre]] of cas.entries()) {
    appels.length = 0;
    const email = `plan${index}@example.org`;
    const res = {
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };

    await lead({
      method: 'POST',
      headers: { 'x-forwarded-for': '192.0.2.' + (index + 1) },
      body: { email, plan: slug },
    }, res);

    assert.equal(res.code, 200, slug);
    assert.deepEqual(res.data, { ok: true, envoye: true });
    assert.deepEqual(appels.map(a => a.route), ['/v3/contacts', '/v3/contacts/' + encodeURIComponent(email), '/v3/smtp/email', '/v3/contacts']);
    const [contact, , envoi, suivi] = appels.map(a => a.corps);
    assert.equal(contact.attributes.LIVRAISON_PDF_SITE, true);
    assert.equal(contact.attributes.PLAN_PDF, plans[slug].pdf);
    assert.equal(contact.listIds, undefined);
    const offre = new URL(contact.attributes.PLAN_URL);
    assert.equal(offre.pathname, chemin);
    assert.equal(offre.hash, ancre);
    assert.deepEqual(envoi.to, [{ email }]);
    assert.deepEqual(envoi.tags, ['plan-commentaire', slug]);
    assert.equal(envoi.templateId, undefined);
    assert.match(envoi.textContent, /^Salut Camille,/);
    assert.ok(envoi.textContent.indexOf(plans[slug].pdf) >= 0);
    assert.ok(envoi.textContent.indexOf(contact.attributes.PLAN_URL) > envoi.textContent.indexOf(plans[slug].pdf));
    assert.doesNotMatch(envoi.htmlContent, /commentaire complet|commentaire rédigé en entier|4,99/i);
    assert.deepEqual(suivi, { email, updateEnabled: true, listIds: [17] });
  }
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
