#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const PRODUITS = require("../api/_produits");
const { FORMULES } = require("../api/_portalis-config");
const { BESOINS, APERCUS, COMPARAISON_DOL } = require("./catalogue-presentations");
const ROOT = path.resolve(__dirname, "..");
const PAGES = ["index.html", "formations.html", "cours-fiches.html", "droit-des-contrats-l2.html", "majeures-preparees.html", "corriges.html", "revisions.html", "flashcards-qcm.html", "pack-ultra.html", "reussir-sa-l1.html", "reussir-sa-l3.html"];
const euro = (centimes) => `${(centimes / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function prixSupport(support) {
  const valeurs = support.portalis ? Object.values(FORMULES).map((p) => p.prix) :
    (support.ids || Object.keys(PRODUITS).filter((id) => support.format ? PRODUITS[id].nom.startsWith(support.format) : id.startsWith(support.famille)))
      .map((id) => {
        if (!PRODUITS[id]) throw new Error(`Produit inconnu, ${id}`);
        return PRODUITS[id];
      }).filter((p) => !p.venteSuspendue).map((p) => p.prix);
  if (!valeurs.length || valeurs.some((p) => !Number.isInteger(p) || p <= 0)) throw new Error(`Prix absent, ${support.nom}`);
  const minimum = Math.min(...valeurs);
  const maximum = Math.max(...valeurs);
  const montant = support.minimum || support.portalis ? `dès ${euro(minimum)}` : minimum === maximum ? euro(minimum) : `${euro(minimum)} à ${euro(maximum)}`;
  return montant + support.unite;
}

function renderComparateur() {
  const lignes = BESOINS.map((besoin) => {
    const supports = besoin.supports.map((s) => `<li><a href="${escape(s.href)}">${escape(s.nom)}</a><span class="compare-needs__price">${escape(prixSupport(s))}</span></li>`).join("");
    const lien = besoin.lien ? ` <a href="${escape(besoin.lien.href)}">${escape(besoin.lien.nom)}</a>` : "";
    return `            <tr><th scope="row">${escape(besoin.titre)}</th><td><ul class="compare-needs__supports">${supports}</ul></td><td>${escape(besoin.contenu)}${lien}</td></tr>`;
  }).join("\n");
  return `<!-- catalogue:comparateur:start -->
        <table class="compare-table compare-table--besoins">
          <caption class="sr-only">Les supports de droit, selon le travail que tu veux faire</caption>
          <thead><tr><th scope="col">Ton besoin</th><th scope="col">Les supports et leurs prix</th><th scope="col">Ce que tu vas travailler</th></tr></thead>
          <tbody>
${lignes}
          </tbody>
        </table>
        <p class="compare-needs__note">Les PDF s’achètent en une fois. Les podcasts et vidéos se lisent dans Mon compte. Portalis fonctionne par abonnement mensuel.</p>
        <!-- catalogue:comparateur:end -->`;
}

function fichesIncluses(id) {
  const pack = PRODUITS[id];
  if (!pack) throw new Error(`Pack inconnu, ${id}`);
  const fichiers = new Set(pack.blobs);
  return Object.entries(PRODUITS).filter(([cle, p]) => cle.startsWith("fiche-") && p.nom.startsWith("Fiche complète ") && fichiers.has(p.blobs[0]))
    .sort(([, a], [, b]) => pack.blobs.indexOf(a.blobs[0]) - pack.blobs.indexOf(b.blobs[0]));
}

function presentationPack(id) {
  const produit = PRODUITS[id];
  const fiches = fichesIncluses(id);
  const totalUnite = fiches.reduce((somme, [, p]) => somme + p.prix, 0);
  const totalPdf = new Set(produit.blobs.filter((f) => f.endsWith(".pdf"))).size;
  const cartes = fiches.filter(([, p]) => p.blobs.some((f) => /cartesmentales\.pdf$/.test(f))).length;
  const nombre = fiches.length;
  const niveau = id === "pack-complet" ? "L1 + L2 + L3" : id.slice(-2).toUpperCase();
  const annexe = cartes === nombre ? "Chaque fiche est accompagnée de son plan et de ses cartes mentales." : `Chaque fiche est accompagnée de son plan. Les cartes mentales de ${cartes} fiches sont aussi incluses.`;
  const descriptions = {
    "pack-l1": `Le pack réunit ${nombre} fiches de première année, dont le droit pénal général L1 S2 et les deux semestres de droit constitutionnel. ${annexe}`,
    "pack-l2": `Ce pack contient six fiches de L2 et la fiche « Droit pénal général L1 S2 ». ${annexe}`,
    "pack-l3": `Le pack réunit ${nombre} fiches de L3, dont le droit des sociétés S1 et S2. ${annexe}`,
    "pack-complet": `Le pack réunit ${nombre} fiches pour les trois années de licence, avec les deux semestres de droit des sociétés. ${annexe}`,
  };
  const titre = id === "pack-complet" ? "Pack Licence complète" : `Pack Licence ${niveau.slice(-1)}`;
  const inclusions = fiches.map(([cle, p]) => `<li data-produit-inclus="${escape(cle)}">${escape(p.nom.replace(/^Fiche complète /, ""))}</li>`).join("");
  const economie = Math.round((1 - produit.prix / totalUnite) * 100);
  const titreHtml = id === "pack-l2" ? `<a href="pack-fiches-droit-l2.html">${titre}</a>` : titre;
  return { nombre, totalPdf, cartes, totalUnite, economie, titre, description: descriptions[id], html: `<div class="product__body" data-catalogue-pack="${id}">
              <h3 class="product__title">${titreHtml}</h3>
              <div class="product__meta"><span>${niveau}</span><span>·</span><span>${nombre} fiches complètes</span><span>·</span><span>${totalPdf} PDF · Accès à vie</span></div>
              <p class="product__desc">${escape(descriptions[id])}</p>
              <details class="product__includes" data-pack-inclus="${id}" style="text-align:left; margin:10px 0; color:var(--body); font-size:.9rem"><summary style="cursor:pointer; color:var(--blue-600)">Voir les ${nombre} fiches incluses</summary><ul style="padding-left:20px; margin:10px 0; line-height:1.6">${inclusions}</ul><p style="margin:0">Les cours complets et les majeures préparées s’achètent à part.</p></details>
              <div><span class="product__price-old">${euro(totalUnite)}</span><span class="product__price">${euro(produit.prix)}</span><span class="badge badge--success" style="margin-left:6px">-${economie} %</span></div>
              <button type="button" class="btn btn--primary btn--full product__cta" data-tjd-produit="${id}">Acheter le pack · ${euro(produit.prix)}</button>
            </div>` };
}

function renderApercu(item) {
  const images = item.pages.map((page) => `assets/apercus/catalogue-20261029/${item.id}-p${String(page).padStart(3, "0")}.webp`);
  return `<button type="button" class="apercu-link" data-apercu='${JSON.stringify(images)}' data-apercu-title="${escape(item.titre)}" data-apercu-sub="Extraits du PDF vendu, pages ${item.pages.join(", ")}" data-apercu-price="${euro(PRODUITS[item.id].prix)}" data-apercu-cta="${item.id}">Voir un aperçu</button>`;
}

function renderSommaire(item) {
  return `<details class="product__sommaire" data-catalogue-sommaire="${item.id}"><summary>Voir le sommaire (${item.sommaire.length} chapitres)</summary><ul class="product__sommaire-list">${item.sommaire.map((titre) => `<li>${escape(titre)}</li>`).join("")}</ul></details>`;
}

function synchroniser(contenu, fichier) {
  let sortie = contenu.replace(/<!-- catalogue:comparateur:start -->[\s\S]*?<!-- catalogue:comparateur:end -->/g, renderComparateur());
  if (["formations.html", "droit-des-contrats-l2.html"].includes(fichier)) {
    for (const extrait of COMPARAISON_DOL) {
      sortie = sortie.replace(new RegExp(`assets/apercus/comparatif-dol-${extrait.format}-[0-9]{8}\\.png(?:\\?v=[0-9]+)?`, "g"), extrait.image);
      sortie = sortie.replace(new RegExp(`<img\\b[^>]*src="${extrait.image.replace(/\./g, "\\.")}"[^>]*>`, "g"), (image) => image.replace(/alt="[^"]*"/, `alt="${escape(extrait.alt)}"`));
    }
    let numero = 0;
    sortie = sortie.replace(/(<p class="format-comparison__caption"><span>)[^<]*(<\/span>)/g, (bloc, avant, apres) => {
      const extrait = COMPARAISON_DOL[numero++];
      if (!extrait) throw new Error(`Extrait supplémentaire, ${fichier}`);
      return `${avant}${extrait.total} pages au total, extrait p. ${extrait.pagePDF} du PDF${apres}`;
    });
  }
  for (const item of APERCUS) {
    const bouton = new RegExp(`<button\\b(?=[^>]*data-apercu-cta="${item.id}")[^>]*>[\\s\\S]*?</button>`, "g");
    const marqueur = `data-catalogue-sommaire="${item.id}"`;
    sortie = sortie.replace(bouton, renderApercu(item) + (sortie.includes(marqueur) ? "" : `\n              ${renderSommaire(item)}`));
    sortie = sortie.replace(new RegExp(`<details\\b[^>]*${marqueur}[^>]*>[\\s\\S]*?</details>`, "g"), renderSommaire(item));
  }
  if (fichier === "formations.html") {
    for (const id of ["pack-complet", "pack-l1", "pack-l2", "pack-l3"]) {
      const article = new RegExp(`(<article\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</article>)`);
      sortie = sortie.replace(article, (bloc, ouverture, interieur, fin) => {
        const debut = interieur.indexOf('<div class="product__body"');
        if (debut < 0) throw new Error(`Carte absente, ${id}`);
        return ouverture + interieur.slice(0, debut).replace(/alt="[^"]*"/, `alt="${presentationPack(id).titre}, couverture Trajectoire Droit"`) + presentationPack(id).html + "\n          " + fin;
      });
      if (id !== "pack-complet") {
        const p = presentationPack(id);
        const nom = `${p.titre}, ${p.nombre} fiches complètes de droit`;
        const metadata = new RegExp(`("name":\\s*)"Pack Licence ${id.slice(-1)},[^"\\n]*"(,\\s*"description":\\s*)"[^"\\n]*"`);
        sortie = sortie.replace(metadata, (bloc, avantNom, avantDescription) => avantNom + JSON.stringify(nom) + avantDescription + JSON.stringify(p.description));
      }
    }
  }
  return sortie;
}

function verifierPrix(contenu, fichier) {
  const erreurs = [];
  for (const match of contenu.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const id = match[1].match(/\bdata-tjd-produit="([^"]+)"/)?.[1];
    const montant = match[2].replace(/<[^>]+>/g, " ").match(/(\d+(?:[\u00a0\u202f ]\d{3})*(?:,\d{2})?)\s*€/);
    if (!id || !montant) continue;
    const prix = Math.round(Number(montant[1].replace(/[\u00a0\u202f ]/g, "").replace(",", ".")) * 100);
    if (!PRODUITS[id] || PRODUITS[id].prix !== prix) erreurs.push(`${fichier}, bouton ${id}, prix ${prix}`);
  }
  return erreurs;
}

function verifierGuidePack(contenu, fichier) {
  const id = { "reussir-sa-l1.html": "pack-l1", "reussir-sa-l3.html": "pack-l3" }[fichier];
  if (!id) return [];
  const attendu = presentationPack(id);
  const texte = contenu.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|#160);/g, " ");
  const nombres = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
  const erreurs = [];
  const fiches = [...texte.matchAll(/\b(\d+|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+fiches\b(?!\s+d[’']arrêt)/gi)];
  if (!fiches.length) erreurs.push(`${fichier}, nombre de fiches du pack absent`);
  for (const m of fiches) {
    const avant = texte.slice(Math.max(0, m.index - 35), m.index);
    const apres = texte.slice(m.index + m[0].length, m.index + m[0].length + 25);
    if (/(?:réparti|réparties?|divisé|divisées?)\s+en\s*$/i.test(avant) || /^\s+autres?\s+que\b/i.test(apres)) continue;
    const nombre = nombres[m[1].toLowerCase()] || Number(m[1]);
    if (nombre !== attendu.nombre) erreurs.push(`${fichier}, ${m[1]} fiches annoncé, ${attendu.nombre} livré`);
  }
  const fichiers = [...texte.matchAll(/\b(\d+)\s+(?:fichiers?\s+)?PDF\b/gi)];
  if (!fichiers.length) erreurs.push(`${fichier}, total des fichiers PDF du pack absent`);
  for (const m of fichiers) if (Number(m[1]) !== attendu.totalPdf) erreurs.push(`${fichier}, ${m[1]} fichiers PDF annoncé, ${attendu.totalPdf} livré`);
  if (id === "pack-l3") {
    const cartes = [...texte.matchAll(/\b(\d+)\s+fichiers?\s+de\s+cartes\s+mentales\b/gi),
      ...texte.matchAll(/cartes\s+mentales[^.]{0,100}(?:pour\s+les|de)\s+(\d+|cinq|six|sept|huit|neuf)\s+fiches\b/gi)];
    if (!cartes.length) erreurs.push(`${fichier}, nombre des fichiers de cartes mentales absent`);
    for (const m of cartes) if ((nombres[m[1].toLowerCase()] || Number(m[1])) !== attendu.cartes) erreurs.push(`${fichier}, ${m[1]} cartes mentales annoncé, ${attendu.cartes} livré`);
  }
  return erreurs;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--fragment")) { process.stdout.write(renderComparateur() + "\n"); return; }
  const ecrire = args.includes("--write");
  const fichiers = args.filter((a) => a.endsWith(".html"));
  const erreurs = [];
  for (const fichier of fichiers.length ? fichiers : PAGES) {
    const cible = path.join(ROOT, fichier);
    const contenu = fs.readFileSync(cible, "utf8");
    const resultat = synchroniser(contenu, fichier);
    erreurs.push(...verifierPrix(resultat, fichier));
    erreurs.push(...verifierGuidePack(resultat, fichier));
    if (resultat !== contenu) {
      if (ecrire) fs.writeFileSync(cible, resultat);
      else erreurs.push(`${fichier}, présentation à régénérer`);
    }
  }
  for (const item of APERCUS) for (const page of item.pages) {
    const cible = `assets/apercus/catalogue-20261029/${item.id}-p${String(page).padStart(3, "0")}.webp`;
    if (!fs.existsSync(path.join(ROOT, cible))) erreurs.push(`Aperçu absent, ${cible}`);
  }
  if (erreurs.length) { console.error(erreurs.join("\n")); process.exitCode = 1; }
  else console.log("Catalogue cohérent, comparateurs, prix des boutons et 12 pages d’aperçu vérifiés.");
}

if (require.main === module) main();
module.exports = { renderComparateur, renderApercu, presentationPack, synchroniser, verifierPrix, verifierGuidePack };
