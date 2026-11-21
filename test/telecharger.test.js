const assert = require("node:assert/strict");
const test = require("node:test");
const telecharger = require("../api/telecharger");
const produits = require("../api/_produits");
const { genererToken, genererJetonPersonnalisation } = require("../api/_liens-telechargement");

async function ouvrir(query) {
  const reponse = {
    headers: {},
    setHeader(nom, valeur) { this.headers[nom] = valeur; },
    status(code) { this.code = code; return this; },
    send(corps) { this.corps = corps; },
    redirect(code, destination) { this.code = code; this.destination = destination; },
  };
  await telecharger({ query }, reponse);
  return reponse;
}

function utiliserSecretDeTest(t) {
  const ancien = process.env.DOWNLOAD_SECRET;
  const secret = "secret-telecharger-test";
  process.env.DOWNLOAD_SECRET = secret;
  t.after(() => {
    if (ancien === undefined) delete process.env.DOWNLOAD_SECRET;
    else process.env.DOWNLOAD_SECRET = ancien;
  });
  return secret;
}

test("un lien expiré affiche une aide générique sans transmettre ses données", async (t) => {
  const secret = utiliserSecretDeTest(t);
  const id = "fiche-da-l2-s1";
  const sid = "cs_test_session_invisible";
  const exp = String(Math.floor(Date.now() / 1000) - 60);
  const sig = genererToken(id, 0, Number(exp), secret, sid);
  const email = "etudiant-fictif@example.test";
  const reponse = await ouvrir({ id, b: "0", exp, sig, sid, email });

  assert.equal(reponse.code, 410);
  assert.equal(reponse.headers["Content-Type"], "text/html; charset=utf-8");
  assert.equal(reponse.headers["Cache-Control"], "private, no-store");
  assert.equal(reponse.headers["Referrer-Policy"], "no-referrer");
  assert.equal(reponse.destination, undefined);
  assert.match(reponse.corps, /<html lang="fr">/);
  assert.match(reponse.corps, /<h1>Ce lien de téléchargement a expiré<\/h1>/);
  assert.match(reponse.corps, /adresse email utilisée lors de l’achat/);
  assert.deepEqual([...reponse.corps.matchAll(/href="([^"]+)" rel="noreferrer"/g)].map((lien) => lien[1]), [
    "/mon-compte.html",
    "/faq.html#pdf-manquant",
  ]);
  for (const valeur of [id, produits[id].nom, sid, exp, sig, email]) {
    assert.ok(!reponse.corps.includes(valeur));
  }
  const autre = await ouvrir({ id: "<script>produit-fictif</script>", b: "0", exp: "date-invalide", sig: "signature-fictive" });
  assert.equal(autre.code, 410);
  assert.equal(autre.corps, reponse.corps);
});

test("un lien incomplet ou falsifié reste refusé", async (t) => {
  utiliserSecretDeTest(t);
  const exp = String(Math.floor(Date.now() / 1000) + 900);
  const fragment = { id: "fiche-da-l2-s1", b: "0", exp };
  const incomplet = await ouvrir(fragment);
  const falsifie = await ouvrir({ ...fragment, sig: "0".repeat(64) });

  assert.equal(incomplet.code, 400);
  assert.equal(falsifie.code, 403);
  assert.equal(incomplet.destination, undefined);
  assert.equal(falsifie.destination, undefined);
});

test("un lien d’achat valide transmet toujours la session et sa signature de personnalisation", async (t) => {
  const secret = utiliserSecretDeTest(t);
  const id = "fiche-da-l2-s1";
  const produit = produits[id];
  const expiry = Math.floor(Date.now() / 1000) + 900;
  const sessionId = "cs_test_achat_fictif";
  const sourceUrl = produit.blobs[0];
  const sig = genererToken(id, 0, expiry, secret, sessionId);
  const reponse = await ouvrir({ id, b: "0", exp: String(expiry), sig, sid: sessionId });

  assert.equal(reponse.code, 302);
  assert.equal(reponse.headers["Cache-Control"], "private, no-store");
  assert.equal(reponse.headers["Referrer-Policy"], "no-referrer");
  const url = new URL(reponse.destination, "https://site-fictif.test");
  assert.equal(url.pathname, "/api/personnaliser-pdf");
  assert.equal(url.searchParams.get("sid"), sessionId);
  assert.equal(url.searchParams.get("src"), sourceUrl);
  assert.equal(url.searchParams.get("psig"), genererJetonPersonnalisation({
    produitId: id,
    blobIndex: 0,
    expiry,
    sessionId,
    sourceUrl,
    nomProduit: produit.nom,
    nomFichier: decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop()),
  }, secret));
});
