#!/usr/bin/env python3
"""Aperçus des recueils d'exercices (dissertations, cas pratiques, commentaires d'arrêt).

Décision de Julien du 15/11/2026 (audit createur-pages-seo-quotidien, code A4).
Le script lit le PDF vendu (lien R2 de api/_produits.js, ou --pdf-root), choisit
quatre pages au maximum (le sommaire, puis le début du premier exercice corrigé),
les rend comme les aperçus des fiches (fitz, matrice 2.4, WEBP qualité 91) et les
inscrit dans scripts/apercus-produits.json, famille « recueils ».

Usage :
  python3 scripts/generer-apercus-recueils.py                      # tous les recueils
  python3 scripts/generer-apercus-recueils.py cas-pratique-biens-l2 # un seul recueil
  python3 scripts/generer-apercus-recueils.py --pdf-root DOSSIER   # PDF déjà téléchargés
"""
import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "scripts/apercus-produits.json"
DOSSIER = "assets/apercus/recueils-20261115"
MOTIF_RECUEIL = re.compile(r"^(dissertation-|cas-pratique-|commentaire-arret-)")


def charger_acces_r2():
    noms = {
        "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET", "R2_PERSONNALISES_BUCKET",
    }
    manquants = {nom for nom in noms if not os.environ.get(nom)}
    for fichier in (ROOT / ".env.local", ROOT / ".env"):
        if not manquants or not fichier.is_file():
            continue
        with fichier.open() as configuration:
            for ligne in configuration:
                nom, separateur, valeur = ligne.strip().removeprefix("export ").partition("=")
                nom = nom.strip()
                if separateur and nom in manquants:
                    valeurs = shlex.split(valeur, comments=True)
                    if valeurs:
                        os.environ[nom] = valeurs[0]
                        manquants.remove(nom)
    if not os.environ.get("R2_PERSONNALISES_BUCKET"):
        os.environ["R2_PERSONNALISES_BUCKET"] = "trajectoiredroit-pdf-personnalises"


def produits_recueils():
    sortie = subprocess.check_output([
        "node", "-e",
        "const P=require('./api/_produits');const r={};for(const id of Object.keys(P))"
        "if(/^(dissertation-|cas-pratique-|commentaire-arret-)/.test(id)&&(P[id].blobs||[]).length===1)r[id]=P[id].blobs[0];"
        "console.log(JSON.stringify(r))",
    ], cwd=ROOT)
    return json.loads(sortie)


def choisir_pages(produit, textes):
    """Numéros de page (base 1) : sommaire, puis le début du premier exercice."""
    sommaires = [i for i in range(min(4, len(textes))) if "SOMMAIRE" in textes[i].upper()]
    debut = sommaires[-1] + 1 if sommaires else 0
    premier = sommaires[0] if sommaires else 0
    if produit.startswith("dissertation-"):
        a = next(i for i in range(debut, len(textes)) if "DÉCORTICAGE" in textes[i].upper())
        b = next(i for i in range(a, len(textes)) if "COPIE MODÈLE" in textes[i].upper())
        pages = [premier, a, b, b + 1, b + 2]
    elif produit.startswith("cas-pratique-"):
        mineure = next((i for i in range(debut + 2, min(debut + 8, len(textes)))
                        if re.search(r"\(Mineure\)|En l.espèce", textes[i])), debut + 2)
        pages = [premier, debut, debut + 1, mineure, debut + 2]
    else:
        a = next(i for i in range(debut, len(textes)) if re.search(r"^\s*Introduction\s*$", textes[i], re.M))
        pages = [premier, a, a + 1, a + 2]
    vues = []
    for p in pages:
        if p not in vues and p < len(textes):
            vues.append(p)
    return [p + 1 for p in vues[:4]]


def rendre(produit, chemin, catalogue):
    contenu = chemin.read_bytes()
    empreinte = hashlib.sha256(contenu).hexdigest()
    doc = fitz.open(chemin)
    pages = choisir_pages(produit, [page.get_text() for page in doc])
    images, preuves = [], {}
    for numero in pages:
        image = f"{DOSSIER}/{produit}/{empreinte[:12]}-p{numero:03d}.webp"
        cible = ROOT / image
        cible.parent.mkdir(parents=True, exist_ok=True)
        fitz.TOOLS.store_shrink(100)
        pix = doc[numero - 1].get_pixmap(matrix=fitz.Matrix(2.4, 2.4), alpha=False)
        Image.frombytes("RGB", (pix.width, pix.height), pix.samples).save(cible, "WEBP", quality=91, method=6)
        with Image.open(cible) as im:
            taille = list(im.size)
            im.verify()
        images.append(image)
        preuves[image] = {"page_pdf": numero, "sha256_image": hashlib.sha256(cible.read_bytes()).hexdigest(), "dimensions": taille}
    catalogue["produits"][produit] = {
        "sha256": empreinte,
        "pages_pdf": len(doc),
        "famille": "recueils",
        "fichier_pdf": chemin.name,
        "images": images,
        "pages_images": pages,
        "variantes": [{"avant": images, "pages": pages, "images": images}],
        "preuves_images": preuves,
    }
    print(f"{produit} · {len(doc)} pages · aperçu {pages}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("produits", nargs="*")
    parser.add_argument("--pdf-root", type=Path)
    args = parser.parse_args()
    liens = produits_recueils()
    ids = args.produits or sorted(liens)
    catalogue = json.loads(CATALOGUE.read_text())
    if not args.pdf_root and any(liens.get(produit, "").startswith("r2://tjd/") for produit in ids):
        charger_acces_r2()
        sys.path.insert(0, str(ROOT))
        from lib.personnalisation_pdf import telecharger_source

    with tempfile.TemporaryDirectory(prefix="tjd-recueils-") as temporaire:
        for produit in ids:
            if not MOTIF_RECUEIL.match(produit) or produit not in liens:
                raise SystemExit(f"Recueil inconnu : {produit}")
            chemin = (args.pdf_root / f"{produit}.pdf") if args.pdf_root else Path(temporaire) / f"{produit}.pdf"
            if not args.pdf_root:
                reference = liens[produit]
                if reference.startswith("r2://tjd/"):
                    chemin.write_bytes(telecharger_source(reference))
                else:
                    urllib.request.urlretrieve(reference, chemin)
            rendre(produit, chemin, catalogue)
    CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
