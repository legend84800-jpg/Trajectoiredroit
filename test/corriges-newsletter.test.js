const test=require('node:test');
const assert=require('node:assert/strict');
const {EXERCICES,attributsExercice,suggestionEmail,emailExercice,recueils}=require('../api/_corriges-exercices');
test('chaque page livre son exercice et propose un recueil vérifié',()=>{
 assert.equal(Object.keys(EXERCICES).length,18);
 for(const [id,x] of Object.entries(EXERCICES)){
  const a=attributsExercice(id),mail=emailExercice(id);
  assert.equal(a.CORRIGE_PDF,x.pdf);assert.equal(a.MATIERE,x.produit);
  assert.doesNotMatch(mail.texte,/CORRIGE10|10 %/);assert.match(mail.texte,/corriges\.html\?produit=/);
  assert(!a.CORRIGE_PDF.includes('/compilations/'));
 }
 assert.equal(attributsExercice('inconnu'),null);
 for(const x of recueils())assert.equal(x.prixRemise,1349);
});
test('la suggestion de domaine conserve les domaines inconnus',()=>{
 assert.equal(suggestionEmail('eleve@gmai.com'),'eleve@gmail.com');
 assert.equal(suggestionEmail('eleve@gmail.com'),'');
 assert.equal(suggestionEmail('eleve@universite.example'),'');
});
test('chaque PDF est envoyé par le site avant le déclenchement du suivi', async t => {
  const lead = require('../api/lead');
  const anciennesVariables = {
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    BREVO_LIST_ID: process.env.BREVO_LIST_ID,
  };
  process.env.BREVO_API_KEY = 'test';
  process.env.BREVO_LIST_ID = '3';

  const appels = [];
  let statutSmtp = 201;
  let listesExistantes = [];
  const erreurs = [];
  t.mock.method(console, 'error', (...args) => erreurs.push(args));
  t.mock.method(global, 'fetch', async (url, options) => {
    const route = new URL(url).pathname;
    const corps = options.body ? JSON.parse(options.body) : undefined;
    appels.push({ route, corps });
    if (!options.method) return Response.json({ listIds: listesExistantes, attributes: { PRENOM: ' Camille ' } });
    if (url.endsWith('/smtp/email')) {
      return new Response(statutSmtp === 201 ? null : 'Indisponible', { status: statutSmtp });
    }
    return new Response(null, { status: 204 });
  });

  async function demander(body) {
    appels.length = 0;
    const res = {
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await lead({
      method: 'POST',
      headers: { 'x-forwarded-for': '192.0.2.' + (demander.numero += 1) },
      body,
    }, res);
    return res;
  }
  demander.numero = 0;

  try {
    const exercice = 'exercices-corriges-introduction-au-droit-l1-1';
    let res = await demander({ email: 'eleve@gmai.com', exercice });
    assert.equal(res.code, 409);
    assert.equal(appels.length, 0);

    const cas = [
      [{ email: 'eleve@gmai.com', exercice, confirmerDomaine: true }, 'CORRIGE_PDF', '/corrige-exercice/' + exercice + '.pdf'],
      [{ email: 'eleve@gmai.com', exercice: 'commentaire-arret-uber-2020-corrige', confirmerDomaine: true },
        'CORRIGE_PDF', '/corrige-exercice/commentaire-arret-uber-2020-corrige.pdf'],
      [{ email: 'matiere@example.org', matiere: 'cas-pratique-intro-droit-l1' },
        'CORRIGE_PDF', '/corrige-offert/cas-pratique-intro-droit-l1.pdf'],
      [{ email: 'plan@example.org', plan: 'manoukian' }, 'PLAN_PDF', require('../api/_plans-commentaires.json').manoukian.pdf],
      [{ email: 'fiche@example.org', fiche: 'arret-abus-majorite-1961-explique' },
        'FICHE_PDF', '/fiche-arret/arret-abus-majorite-1961-explique.pdf'],
    ];

    for (const [index, [demande, clePdf, finDuLien]] of cas.entries()) {
      listesExistantes = index === 1 ? [3, 17] : [];
      res = await demander(demande);
      assert.equal(res.code, 200);
      assert.deepEqual(res.data, { ok: true, envoye: true });
      const routes = ['/v3/contacts', '/v3/contacts/' + encodeURIComponent(demande.email), '/v3/smtp/email'];
      if (listesExistantes.length === 0) routes.push('/v3/contacts');
      assert.deepEqual(appels.map(appel => appel.route), routes);

      const [contact, , mail, suivi] = appels.map(appel => appel.corps);
      assert.equal(contact.attributes.LIVRAISON_PDF_SITE, true);
      assert.equal(contact.listIds, undefined);
      assert.ok(contact.attributes[clePdf].endsWith(finDuLien));
      assert.equal(mail.to[0].email, demande.email);
      if (clePdf !== 'PLAN_PDF') assert.equal(mail.sender.name, 'Julien');
      if (clePdf === 'CORRIGE_PDF') {
        assert.equal(mail.templateId, 33);
        assert.equal(mail.params.CORRIGE_PDF, contact.attributes.CORRIGE_PDF);
        assert.equal(mail.params.PRENOM, 'Camille');
      } else if (clePdf === 'PLAN_PDF') {
        assert.equal(mail.templateId, 70);
        assert.equal(mail.htmlContent, undefined);
        assert.equal(mail.params.PLAN_PDF, contact.attributes.PLAN_PDF);
        assert.equal(mail.params.PLAN_URL, contact.attributes.PLAN_URL);
        assert.equal(mail.params.PLAN_FICHE_URL, contact.attributes.PLAN_FICHE_URL);
        assert.equal(mail.params.PRENOM, 'Camille');
      } else {
        assert.ok(mail.textContent.includes(contact.attributes[clePdf]));
        assert.match(mail.textContent, /^Salut Camille,/);
      }
      if (listesExistantes.length === 0) {
        assert.deepEqual(suivi, { email: demande.email, updateEnabled: true, listIds: [17] });
      } else {
        assert.equal(suivi, undefined);
      }
    }

    statutSmtp = 503;
    res = await demander({ email: 'erreur@example.org', exercice });
    assert.equal(res.code, 500);
    assert.equal(res.data.envoye, undefined);
    assert.deepEqual(appels.map(appel => appel.route), ['/v3/contacts', '/v3/contacts/erreur%40example.org', '/v3/smtp/email']);
    assert.equal(erreurs.length, 1);

    res = await demander({ email: 'guide@example.org', source: 'newsletter' });
    assert.equal(res.code, 200);
    assert.equal(appels.length, 1);
    assert.deepEqual(appels[0].corps.attributes, { SOURCE: 'newsletter', LIVRAISON_PDF_SITE: false });
    assert.deepEqual(appels[0].corps.listIds, [3]);

    res = await demander({ email: 'eleve@example.org', exercice: 'inconnu' });
    assert.equal(res.code, 400);
    assert.equal(appels.length, 0);
  } finally {
    for (const [nom, valeur] of Object.entries(anciennesVariables)) {
      if (valeur === undefined) delete process.env[nom];
      else process.env[nom] = valeur;
    }
  }
});
// Les règles de prix de CORRIGE10 et le passage à un autre format sont exercés
// par checkout-corrige10.test.js avec la création Stripe entièrement simulée.
