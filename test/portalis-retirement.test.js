const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const racine = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(racine, f), "utf8");
const reponse = () => ({
  headers: {},
  setHeader(nom, valeur) { this.headers[nom] = valeur; },
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

test("Portalis disparaît des pages publiques sans retirer le juriste historique", () => {
  assert.equal(fs.existsSync(path.join(racine, "outil-fiche-arret.html")), false);
  const historiques = new Set(["methode-du-commentaire-de-texte-juridique.html", "dissertation-heritage-droit-romain-corrigee.html"]);
  for (const f of fs.readdirSync(racine).filter((f) => f.endsWith(".html"))) {
    const html = lire(f);
    assert.doesNotMatch(html, /outil-fiche-arret\.html/, f);
    if (!historiques.has(f)) assert.doesNotMatch(html, /Portalis/i, f);
  }
  assert.match(lire("methode-du-commentaire-de-texte-juridique.html"), /Portalis/);
  assert.match(lire("dissertation-heritage-droit-romain-corrigee.html"), /Portalis/);
});

test("les anciennes adresses sont redirigées vers une méthode existante", () => {
  const config = JSON.parse(lire("vercel.json"));
  for (const source of ["/outil-fiche-arret.html", "/outil-fiche-arret"]) {
    assert.deepEqual(config.redirects.find((r) => r.source === source), {
      source, destination: "/methode-fiche-arret.html", permanent: true,
    });
  }
  assert.ok(fs.existsSync(path.join(racine, "methode-fiche-arret.html")));
});

test("ni le moteur de recherche ni les recommandations ne réintroduisent l'offre", () => {
  for (const f of ["assets/js/main.js", "api/_catalogue-chat.js", "llms.txt", "sitemap.xml", "scripts/inverser-megamenu.js", "scripts/refondre-navigation.js"]) {
    assert.doesNotMatch(lire(f), /outil-fiche-arret\.html/, f);
  }
});

test("un ancien appel d'abonnement est refusé avant Stripe ou Supabase", async () => {
  const stripe = require("../api/_stripe");
  const supabase = require("../api/_supabase");
  const originalStripe = stripe.creerClientStripe;
  const originalSupabase = supabase.selectionner;
  const module = require.resolve("../api/create-checkout");
  stripe.creerClientStripe = () => { throw new Error("Stripe ne doit pas être appelé"); };
  supabase.selectionner = () => { throw new Error("Supabase ne doit pas être appelé"); };
  delete require.cache[module];
  try {
    const handler = require(module);
    for (const body of [{ mode: "subscription" }, JSON.stringify({ mode: "subscription" })]) {
      const res = reponse();
      await handler({ method: "POST", body }, res);
      assert.equal(res.statusCode, 410);
      assert.equal(res.payload.code, "offre_retiree");
    }
  } finally {
    stripe.creerClientStripe = originalStripe;
    supabase.selectionner = originalSupabase;
    delete require.cache[module];
  }
});

test("le générateur retiré ne consomme plus d'IA et ne touche plus aux données", async () => {
  const source = lire("api/generer.js");
  assert.doesNotMatch(source, /fetch\(|require\(|process\.env|https?:\/\//);
  const res = reponse();
  await require("../api/generer")({ method: "POST", body: { texte: "Test" } }, res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.payload.code, "offre_retiree");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("le compte conserve la connexion et les achats sans références JS orphelines", () => {
  const html = lire("mon-compte.html");
  const compte = lire("assets/js/compte.js");
  assert.match(html, /assets\/js\/compte\.js\?v=/);
  assert.match(html, /id="connexionForm"/);
  assert.match(html, /id="achatsListe"/);
  assert.match(compte, /\/api\/mes-telechargements/);
  assert.match(compte, /sb\.auth\.signInWithOtp/);
  assert.doesNotMatch(html + compte, /portalis|abonnerBtn|chargerAbonnement|QUOTA_MENSUEL|gererAbonnementBtn|abonnementError/i);
  new vm.Script(compte);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!match[0].includes('type="application/ld+json"')) new vm.Script(match[1]);
  }
  for (const [, id] of (html + compte).matchAll(/document\.getElementById\("([^"]+)"\)/g)) {
    assert.ok(html.includes(`id="${id}"`), `Élément absent ${id}`);
  }
});

test("toutes les pages utilisent la nouvelle version du moteur de recherche", () => {
  const version = crypto.createHash("sha256").update(lire("assets/js/main.js")).digest("hex").slice(0, 8);
  for (const f of fs.readdirSync(racine).filter((f) => f.endsWith(".html"))) {
    for (const [, hash] of lire(f).matchAll(/assets\/js\/main\.js\?v=([a-z0-9]+)/g)) assert.equal(hash, version, f);
  }
});
