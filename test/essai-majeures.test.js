const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const lead = require("../api/lead");
const kit = require("../api/kit-essai");
const essai = require("../api/_essai-majeures");

function reponse() {
  return {
    code: 200,
    headers: {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(nom, valeur) { this.headers[nom] = valeur; },
    end() { return this; },
  };
}

test("les demandes d’essai envoient le même PDF à chaque adresse", async t => {
  const cle = process.env.BREVO_API_KEY;
  const stripe = process.env.STRIPE_SECRET_KEY;
  process.env.BREVO_API_KEY = "test-brevo";
  delete process.env.STRIPE_SECRET_KEY;
  t.after(() => {
    if (cle === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = cle;
    if (stripe !== undefined) process.env.STRIPE_SECRET_KEY = stripe;
  });

  const echanges = [];
  t.mock.method(global, "fetch", async (url, options) => {
    assert.ok(["https://api.brevo.com/v3/contacts", "https://api.brevo.com/v3/smtp/email"].includes(url), url);
    echanges.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 201 };
  });

  const demandes = [
    { email: "essai-un@example.com", essai: true },
    { email: "essai-deux@example.com", essai: "maj-famille-l1-s2", majeures: [1, 4] },
    { email: "essai-un@example.com", essai: "maj-penal-l2-s1", majeures: [17, 2], exercice: "champ-ancien" },
  ];
  for (const body of demandes) {
    const res = reponse();
    await lead({ method: "POST", headers: { "x-real-ip": "192.0.2.10" }, body }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, { ok: true, envoye: true, kit: essai.KIT_URL });
  }

  const inscriptions = echanges.filter(e => e.url.endsWith("/contacts")).map(e => e.body);
  assert.deepEqual(inscriptions.map(x => x.email), demandes.map(x => x.email));
  for (const inscription of inscriptions) {
    assert.deepEqual(inscription.listIds, [9]);
    assert.equal(inscription.attributes.ESSAI_KIT, essai.KIT_URL);
    assert.equal(inscription.attributes.ESSAI_CP, "");
  }
  const emails = echanges.filter(e => e.url.endsWith("/smtp/email")).map(e => e.body);
  assert.deepEqual(emails.map(x => x.to[0].email), demandes.map(x => x.email));
  for (const email of emails) {
    assert.equal(email.subject, "Tes deux majeures offertes");
    assert.match(email.textContent, /« Le dol »/);
    assert.match(email.textContent, /« La distinction entre service public administratif et service public industriel et commercial »/);
    assert.ok(email.textContent.includes(essai.KIT_URL));
    assert.equal(email.textContent, emails[0].textContent);
    assert.equal(email.htmlContent, emails[0].htmlContent);
    assert.doesNotMatch(email.textContent, /cas pratique corrigé|maj-famille|maj-penal/);
  }

  const invalide = reponse();
  await lead({ method: "POST", body: { email: "invalide", essai: true } }, invalide);
  assert.equal(invalide.code, 400);
  assert.equal(echanges.length, demandes.length * 2);
});

test("le lien fixe et les anciens liens aboutissent au même PDF", () => {
  for (const query of [{}, { m: "maj-biens-l2", a: "1", b: "7" }, { m: "maj-procedure-penale-l3", a: "2", b: "13" }]) {
    for (const method of ["GET", "HEAD"]) {
      const res = reponse();
      kit({ method, query }, res);
      assert.equal(res.code, 302);
      assert.equal(res.headers.Location, essai.KIT);
      assert.equal(res.headers["Cache-Control"], "no-store");
    }
  }
  const res = reponse();
  kit({ method: "POST", query: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(fs.readFileSync(path.join(__dirname, "..", essai.KIT), "utf8").slice(0, 5), "%PDF-");
});
