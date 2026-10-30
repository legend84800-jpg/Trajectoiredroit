const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { DEFINITIONS, referencesPour } = require("../api/_packs-ultra");
const { renderComparateur } = require("./synchroniser-presentations-catalogue");
const ROOT = path.resolve(__dirname, "..");
const IMAGE = "cours-images-contrats-l2-s1";
const euro = (centimes) => `${(centimes / 100).toFixed(2).replace(".", ",")} €`;
const estFormat = (id) => id === IMAGE || id?.startsWith("audio-video-");

function bilanPacksUltra() {
  return Object.fromEntries(Object.entries(DEFINITIONS).filter(([, p]) => !p.venteSuspendue).map(([id, p]) => {
    const references = referencesPour(id, PRODUITS);
    const total = references.reduce((somme, reference) => somme + PRODUITS[reference].prix, 0);
    const medias = references.filter((reference) => reference.startsWith("audio-video-"));
    const totalMedias = medias.reduce((somme, reference) => somme + PRODUITS[reference].prix, 0);
    return [id, { prix: p.prix, total, totalMedias, economie: Math.round((total - p.prix) / total * 100) }];
  }));
}

function synchroniserPrixFormats(contenu, fichier) {
  let sortie = contenu;
  sortie = sortie.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (bloc, attributs, texte) => {
    const id = attributs.match(/\bdata-tjd-produit="([^"]+)"/)?.[1];
    if (!estFormat(id)) return bloc;
    return `<button${attributs}>${texte.replace(/\d+(?:,\d{2})?\s*€/g, euro(PRODUITS[id].prix))}</button>`;
  });
  sortie = sortie.replace(/<button\b[^>]*data-apercu-cta="([^"]+)"[^>]*>/g, (bloc, id) =>
    estFormat(id) ? bloc.replace(/data-apercu-price="[^"]*"/, `data-apercu-price="${euro(PRODUITS[id].prix)}"`) : bloc);
  sortie = sortie.replace(/<article\b[^>]*>[\s\S]*?<\/article>/g, (bloc) => {
    if (!bloc.includes(`data-tjd-produit="${IMAGE}"`)) return bloc;
    const ids = [...bloc.matchAll(/data-tjd-produit="([^"]+)"/g)].map((m) => m[1]);
    if (ids.some((id) => id !== IMAGE)) return bloc;
    return bloc.replace(/(<span class="product__price">)[^<]+(?=<\/span>)/g, `$1${euro(PRODUITS[IMAGE].prix)}`);
  });
  sortie = sortie.replace(/<!-- cours-images:encart-produit -->[\s\S]*?<div class="article-produit-inline__actions">/g, (bloc) =>
    bloc.replace(/(<p class="article-produit-inline__meta">[^<]*<strong>)[^<]+(?=<\/strong>)/g, `$1${euro(PRODUITS[IMAGE].prix)}`));
  sortie = sortie.replace(/(<strong>Le droit des contrats en images · )[^<]+(?=<\/strong>)/g, `$1${euro(PRODUITS[IMAGE].prix)}`);
  if (fichier === "droit-des-contrats-en-images.html") {
    sortie = sortie.replace(/(PDF à )\d+(?:,\d{2})?\s*€/g, `$1${euro(PRODUITS[IMAGE].prix)}`);
    sortie = sortie.replace(/(<div class="cim-prix"><strong>)[^<]+(?=<\/strong>)/g, `$1${euro(PRODUITS[IMAGE].prix)}`);
    sortie = sortie.replace(/("price":\s*")[^"]+("[\s\S]*?"priceCurrency":\s*"EUR")/g, `$1${(PRODUITS[IMAGE].prix / 100).toFixed(2)}$2`);
  }
  const packs = bilanPacksUltra();
  sortie = sortie.replace(/<a\b[^>]*class="megamenu__pack-tile"[^>]*>[\s\S]*?<\/a>/g, (bloc) => {
    const id = bloc.match(/href="pack-ultra\.html#([^"]+)"/)?.[1];
    const p = packs[id];
    if (!p) return bloc;
    return bloc.replace(/(au lieu de )[^€]+€(, )\d+( % d’économie)/, `$1${euro(p.total)}$2${p.economie}$3`)
      .replace(/(<span class="badge badge--success">)-\d+( %<\/span>)/, `$1-${p.economie}$2`)
      .replace(/(<span class="megamenu__pack-tile-price-old">)[^<]+(?=<\/span>)/, `$1${euro(p.total)}`);
  });
  sortie = sortie.replace(/<article class="ultra-card" id="([^"]+)">[\s\S]*?<\/article>/g, (bloc, id) => {
    const p = packs[id];
    if (!p) return bloc;
    return bloc.replace(/(<span class="ultra-card__saving">)\d+( % d’économie<\/span>)/, `$1${p.economie}$2`)
      .replace(/(<span class="ultra-card__unit-total">)[^<]+(?=<\/span>)/, `$1${euro(p.total)}`)
      .replace(/(<p class="ultra-card__bonus">[^<]*ils coûtent )[^€]+€/, `$1${euro(p.totalMedias)}`);
  });
  sortie = sortie.replace(/<!-- catalogue:comparateur:start -->[\s\S]*?<!-- catalogue:comparateur:end -->/g, renderComparateur());
  return sortie;
}

function main() {
  const ecrire = process.argv.includes("--write");
  const fichiers = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  const modifies = [];
  for (const fichier of fichiers) {
    const chemin = path.join(ROOT, fichier);
    const avant = fs.readFileSync(chemin, "utf8");
    const apres = synchroniserPrixFormats(avant, fichier);
    if (avant === apres) continue;
    modifies.push(fichier);
    if (ecrire) fs.writeFileSync(chemin, apres);
  }
  console.log(JSON.stringify({ mode: ecrire ? "write" : "check", pages: fichiers.length, modifications: modifies.length,
    ...(process.argv.includes("--list") ? { fichiers: modifies } : {}) }, null, 2));
  if (!ecrire && modifies.length) process.exitCode = 1;
}
if (require.main === module) main();
module.exports = { synchroniserPrixFormats, bilanPacksUltra };
