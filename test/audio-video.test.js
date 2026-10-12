const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const DONNEES = require("../api/_audio-video-data.json");
const { IMAGES_PRODUITS } = require("../api/_images-produits");
const { construireLiensTelechargement } = require("../api/_liens-telechargement");

const IDS = Object.keys(DONNEES).map((slug) => `audio-video-${slug}`);

test("chaque option podcasts et vidéos contient un podcast et une vidéo par leçon", () => {
  assert.equal(IDS.length, 9);
  for (const id of IDS) {
    const produit = PRODUITS[id];
    const lecons = DONNEES[id.replace("audio-video-", "")].unites.length;
    assert.ok(produit, id);
    assert.equal(produit.prix, 2499, id);
    assert.equal(produit.mediaEnLigne, true, id);
    assert.equal(produit.blobs.length, lecons * 2, id);
    assert.equal(produit.blobsMeta.length, produit.blobs.length, id);
    produit.blobs.forEach((url, i) => assert.match(url, i % 2 ? /\/U\d+-video\.mp4$/ : /\/U\d+-podcast\.m4a$/, id));
    assert.match(produit.nom, /^Podcasts et vidéos .+ L1/, id);
    assert.ok(IMAGES_PRODUITS[id], id);
    assert.ok(fs.existsSync(path.join(__dirname, "..", IMAGES_PRODUITS[id].replace("https://trajectoiredroit.com/", ""))), id);
  }
});

test("Mon compte reçoit un lecteur audio et un lecteur vidéo nommés par leçon", () => {
  const id = "audio-video-constit-l1-s1";
  const liens = construireLiensTelechargement(id, PRODUITS[id], "secret", "https://trajectoiredroit.com", 900, { sessionId: "cs_test" });
  assert.equal(liens[0].type, "audio");
  assert.equal(liens[1].type, "video");
  assert.match(liens[0].nom, /^Leçon 1, .+ · podcast$/);
  assert.match(liens[1].nom, /^Leçon 1, .+ · vidéo$/);
  assert.equal(liens[0].groupe, PRODUITS[id].nom);
  const exp = Number(new URL(liens[0].url).searchParams.get("exp"));
  assert.ok(exp - Date.now() / 1000 > 5 * 3600, "un podcast doit rester lisible plusieurs heures");
});

test("les Packs Ultra L1 incluent les podcasts et gardent le nom de chaque leçon", () => {
  for (const [pack, attendus] of [["pack-ultra-l1-s1", 5], ["pack-ultra-l1-s2", 4]]) {
    const inclus = PRODUITS[pack].inclus.filter((id) => id.startsWith("audio-video-"));
    assert.equal(inclus.length, attendus, pack);
    const liens = construireLiensTelechargement(pack, PRODUITS[pack], "secret", "https://trajectoiredroit.com", 900, {});
    const audio = liens.filter((l) => l.type === "audio");
    assert.ok(audio.length > 0, pack);
    assert.ok(audio.every((l) => /^Leçon \d+, .+ · podcast$/.test(l.nom)), pack);
    assert.ok(audio.every((l) => l.groupe.startsWith("Podcasts et vidéos")), pack);
  }
  for (const id of ["pack-ultra-l2-s1", "pack-ultra-l2-s2", "pack-ultra-l3-s1"]) {
    assert.ok(!PRODUITS[id].inclus.some((ref) => ref.startsWith("audio-video-")), id);
  }
});

test("chaque page matière L1 propose l'option avec un extrait et le bon bouton", () => {
  const pages = {
    "introduction-au-droit-l1.html": ["intro-droit-l1"],
    "histoire-du-droit-l1.html": ["hist-droit-l1"],
    "droit-des-personnes-l1.html": ["personnes-l1"],
    "relations-internationales-l1.html": ["relations-internationales-l1"],
    "droit-constitutionnel-l1.html": ["constit-l1-s1", "constit-l1-s2"],
    "droit-de-la-famille-l1.html": ["famille-l1-s2"],
    "histoire-des-institutions-l1.html": ["hist-institutions-l1"],
    "droit-penal-general-l1.html": ["penal-general-l1"],
  };
  for (const [page, slugs] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert.equal((html.match(/id="podcasts-videos"/g) || []).length, 1, page);
    assert.match(html, /<audio controls preload="none"[^>]*><source src="https:\/\/[^"]+-podcast-extrait\.m4a"/, page);
    assert.match(html, /<video controls preload="none"[^>]*><source src="https:\/\/[^"]+-video-extrait\.mp4"/, page);
    for (const slug of slugs) assert.ok(html.includes(`data-tjd-produit="audio-video-${slug}"`), `${page} ${slug}`);
  }
});

test("l'email d'achat de l'option renvoie vers Mon compte, sans aucun lien de fichier", async () => {
  const { envoyerEmail } = require("../api/stripe-webhook")._test;
  const envois = [];
  const fetchOrigine = global.fetch;
  global.fetch = async (url, options) => { envois.push(JSON.parse(options.body)); return { ok: true, status: 201, json: async () => ({}), text: async () => "" }; };
  try {
    await envoyerEmail("eleve@example.com", [PRODUITS["audio-video-famille-l1-s2"]], [], "cle-test", null);
  } finally {
    global.fetch = fetchOrigine;
  }
  const email = envois[0];
  assert.ok(email);
  assert.match(email.htmlContent, /Tes podcasts et tes vidéos sont disponibles dès maintenant dans ton espace Mon compte/);
  assert.match(email.htmlContent, /Écouter mes podcasts et voir mes vidéos/);
  assert.ok(!/tes PDF sont prêts|48 heures/.test(email.htmlContent + email.textContent));
  assert.ok(!/api\/telecharger/.test(email.htmlContent + email.textContent));
  assert.match(email.textContent, /mon-compte\.html/);
});
