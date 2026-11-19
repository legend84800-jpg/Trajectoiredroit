const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
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
    if (url.startsWith("https://api.brevo.com/v3/contacts/")) {
      assert.equal(options.method, undefined);
      echanges.push({ url });
      if (url.includes("essai-deux%40")) return new Response(null, { status: 404 });
      return Response.json({ attributes: { PRENOM: " Camille " } });
    }
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
    assert.equal(inscription.attributes.ESSAI_URL_DA, undefined);
  }
  const emails = echanges.filter(e => e.url.endsWith("/smtp/email")).map(e => e.body);
  assert.deepEqual(emails.map(x => x.to[0].email), demandes.map(x => x.email));
  assert.deepEqual(emails.map(x => x.params.PRENOM), ["Camille", "", "Camille"]);
  for (const email of emails) {
    assert.equal(email.templateId, 71);
    assert.equal(email.htmlContent, undefined);
    assert.equal(email.params.ESSAI_KIT, essai.KIT_URL);
    assert.equal(email.params.ESSAI_MAJ_A, "Le dol");
    assert.equal(email.params.ESSAI_MAJ_B, "La distinction entre service public administratif et service public industriel et commercial");
    assert.equal(email.params.ESSAI_CODE, "");
    const rendu = essai.construireEmailEssai(email.params);
    assert.equal(rendu.sujet, "Tes deux majeures offertes");
    assert.match(rendu.texte, /minimum 15 sur 20 en cas pratique/);
    assert.doesNotMatch(rendu.texte, /15 % de réduction|cas pratique corrigé|maj-famille|maj-penal/);
    assert.equal((rendu.html.match(/<a href=/g) || []).length, 1);
  }

  const invalide = reponse();
  await lead({ method: "POST", body: { email: "invalide", essai: true } }, invalide);
  assert.equal(invalide.code, 400);
  assert.equal(echanges.length, demandes.length * 3);
});

test("le code du kit accompagne les deux liens et l’échéance affiche le jour", () => {
  const code = "ESSAI-SIMULATION";
  const expire = Date.parse("2026-11-20T23:20:00+01:00") / 1000;
  const attributs = essai.attributsEssai({ code, expire });
  assert.equal(attributs.ESSAI_FIN, "20 novembre");
  const offres = [
    [attributs.ESSAI_URL, "maj-contrats-l2-s1"],
    [attributs.ESSAI_URL_DA, "maj-da-l2-s1"],
  ];
  const rendu = essai.construireEmailEssai({ ...attributs, PRENOM: "Camille" });
  assert.match(rendu.texte, /^Salut Camille,/);
  assert.match(rendu.texte, /15 % de réduction jusqu’au 20 novembre\./);
  assert.match(rendu.texte, /droit administratif \(L2, S1\)/);
  assert.doesNotMatch(rendu.texte, /heure de Paris|Le bouton applique/);
  for (const [adresse, produit] of offres) {
    const url = new URL(adresse);
    assert.equal(url.searchParams.get("produit"), produit);
    assert.equal(url.searchParams.get("utm_content"), produit);
    assert.equal(url.searchParams.get("code"), code);
    assert.ok(rendu.texte.includes(adresse));
  }
  assert.equal((rendu.html.match(/<a href=/g) || []).length, 3);
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

test("les pages du site utilisent le formulaire fixe et la version courante de son script", () => {
  const racine = path.join(__dirname, "..");
  const script = fs.readFileSync(path.join(racine, "assets/js/essai-majeures.js"));
  const version = createHash("sha256").update(script).digest("hex").slice(0, 8);
  const pagesAvecEssai = new Set();

  assert.ok(!fs.existsSync(path.join(racine, "assets/data/essai-majeures.json")));
  for (const page of fs.readdirSync(racine).filter(nom => nom.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(racine, page), "utf8");
    assert.doesNotMatch(html, /tjd\/essai\/(?:kit|genere)\//, page);
    if (!/\bdata-tjd-essai(?=[\s=>])/.test(html)) continue;
    pagesAvecEssai.add(page);
    assert.doesNotMatch(html, /\bdata-tjd-essai\s*=|\bdata-preselection\s*=/, page);
    assert.ok(html.includes(`/assets/js/essai-majeures.js?v=${version}"`), page);
  }
  for (const page of [
    "majeures-preparees.html",
    "droit-des-contrats-l2.html",
    "notion-service-public-droit-administratif.html",
    "cas-pratique-corrige-droit-civil-l1.html",
  ]) {
    assert.ok(pagesAvecEssai.has(page), page);
  }
});

test("le jeu Cassation met en cache le script qui ouvre le formulaire fixe", () => {
  const jeu = path.join(__dirname, "../jeu");
  const index = fs.readFileSync(path.join(jeu, "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(jeu, "sw.js"), "utf8");
  const script = index.match(/src="(jeu\.js\?v=[0-9a-f]+)"/);
  assert.ok(script);
  assert.ok(worker.includes(`"${script[1]}"`));
  assert.match(index, /majeures-preparees\.html\?[^"]+#essai-majeures/);
});
