const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { DEFINITIONS, referenceVente } = require("../api/_packs-ultra");
const { montantEcheance } = require("../api/_echeances");
const { renderComparateur } = require("./synchroniser-presentations-catalogue");
const ROOT = path.resolve(__dirname, "..");
const IMAGE = "cours-images-contrats-l2-s1";
const euro = (centimes) => `${(centimes / 100).toFixed(2).replace(".", ",")} €`;
const prixUltra = (prix) => prix % 100 === 0 ? `${prix / 100} €` : euro(prix);
const estFormat = (id) => Boolean(PRODUITS[id] && (
  id === IMAGE || /^(?:audio-video|maj|cas-pratique|commentaire-arret|dissertation|pack-partiel)-/.test(id) ||
  /^Fiche complète\b/.test(PRODUITS[id].nom)
));

function bilanPacksUltra() {
  return Object.fromEntries(Object.keys(DEFINITIONS).filter((id) => PRODUITS[referenceVente(id)]).map((id) => {
    const { prix, inclus: references } = PRODUITS[referenceVente(id)];
    const total = references.reduce((somme, reference) => somme + PRODUITS[reference].prix, 0);
    const medias = references.filter((reference) => reference.startsWith("audio-video-"));
    const totalMedias = medias.reduce((somme, reference) => somme + PRODUITS[reference].prix, 0);
    return [id, { prix, total, totalMedias, nbMedias: medias.length, ressources: references.length, economie: Math.round((total - prix) / total * 100) }];
  }));
}

function synchroniserPrixQcm(html) {
  return html.replace(/<article\b([^>]*\sid="(flashcards-qcm-[a-z0-9-]+)"[^>]*)>([\s\S]*?)<\/article>/g, (_, attributs, id, contenu) => {
    const produit = PRODUITS[id];
    const balise = attributs.replace(/\sdata-qcm-prix-centimes="[^"]*"/g, "");
    if (!contenu.includes(`data-tjd-produit="${id}"`) || !produit || produit.venteSuspendue || !Number.isSafeInteger(produit.prix) || produit.prix <= 0) {
      return `<article${balise}>${contenu}</article>`;
    }
    return `<article${balise} data-qcm-prix-centimes="${produit.prix}">${contenu}</article>`;
  });
}

function synchroniserPrixFormats(contenu, fichier) {
  let sortie = fichier === "flashcards-qcm.html" ? synchroniserPrixQcm(contenu) : contenu;
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
    return bloc.replace(/(ressources, )[^€]+€( au lieu de )[^€]+€(, )\d+( % d’économie)/,
      (_, debut, comparaison, separateur, unite) => debut + prixUltra(p.prix) + comparaison + euro(p.total) + separateur + p.economie + unite)
      .replace(/(<span class="badge badge--success">)-\d+( %<\/span>)/, `$1-${p.economie}$2`)
      .replace(/(<span class="megamenu__pack-tile-price-old">)[^<]+(?=<\/span>)/, `$1${euro(p.total)}`)
      .replace(/(<span class="megamenu__pack-tile-price">)[^<]+(?=<\/span>)/, `$1${prixUltra(p.prix)}`);
  });
  sortie = sortie.replace(/<article class="ultra-card" id="([^"]+)">[\s\S]*?<\/article>/g, (bloc, id) => {
    const p = packs[id];
    if (!p) return bloc;
    return bloc.replace(/(<span class="ultra-card__saving">)\d+( % d’économie<\/span>)/, `$1${p.economie}$2`)
      .replace(/(<p class="ultra-card__description">)\d+( ressources)/, `$1${p.ressources}$2`)
      .replace(/(<p class="ultra-card__bonus">Les podcasts et les vidéos des )\d+( matières)/, `$1${p.nbMedias}$2`)
      .replace(/(<span class="ultra-card__unit-total">)[^<]+(?=<\/span>)/, `$1${euro(p.total)}`)
      .replace(/(<span class="ultra-card__price">)[^<]+(?=<\/span>)/, `$1${prixUltra(p.prix)}`)
      .replace(/(<button\b[^>]*class="ultra-card__split-btn"[^>]*data-tjd-echeances="([23])"[^>]*>)[^<]+(?=<\/button>)/g,
        (_, ouverture, nombre) => `${ouverture}${nombre} × ${euro(montantEcheance(p.prix, Number(nombre)))}`)
      .replace(/(<p class="ultra-card__bonus">[^<]*ils coûtent )[^€]+€/, `$1${euro(p.totalMedias)}`);
  });
  sortie = sortie.replace(/<p class="article-pack-ligne__texte">[\s\S]*?<\/p>/g, (bloc) => {
    const id = bloc.match(/href="pack-ultra\.html#([^"]+)"/)?.[1];
    const p = packs[id];
    if (!p) return bloc;
    return bloc.replace(/\d+ ressources/, `${p.ressources} ressources`)
      .replace(/\b(pour|à) (?:un achat unique de )?\d+(?:,\d{2})? €/, (prix) => prix.replace(/\d+(?:,\d{2})? €/, prixUltra(p.prix)));
  });
  if (fichier === "index.html") {
    const minimum = Math.min(...Object.values(packs).map((p) => p.prix));
    sortie = sortie.replace(/(<span class="pricing__price pricing__price--blue">dès )[^<]+/, (_, debut) => debut + prixUltra(minimum));
  }
  if (fichier === "parents.html") {
    sortie = sortie.replace(/(<tr><td>(L[123]) · semestre ([12])<\/td>)<td>\d+<\/td><td class="prix">[^<]+<\/td><td>3 × [^<]+<\/td><td class="barre">[^<]+<\/td>/g,
      (bloc, debut, niveau, semestre) => {
        const p = packs[`pack-ultra-${niveau.toLowerCase()}-s${semestre}`];
        return p ? `${debut}<td>${p.ressources}</td><td class="prix">${prixUltra(p.prix)}</td><td>3 × ${euro(montantEcheance(p.prix, 3))}</td><td class="barre">${euro(p.total)}</td>` : bloc;
      });
    sortie = sortie.replace(/(<option value="(pack-ultra-l[123]-s[12])-revision(?:-2)?" data-prix=")\d+(">[^(]+\()[^)<]+/g,
      (bloc, debut, id, texte) => packs[id] ? `${debut}${packs[id].prix}${texte}${prixUltra(packs[id].prix)}` : bloc);
    sortie = sortie.replace(/(Le Pack Ultra de L1 semestre 1 coûte )\d+(?:,\d{2})? €/, (_, debut) => debut + prixUltra(packs["pack-ultra-l1-s1"].prix));
  }
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
