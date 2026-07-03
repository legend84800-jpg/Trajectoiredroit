#!/usr/bin/env python3
"""
Upload ciblé des 7 recueils de fiches d'arrêt ajoutés/enrichis le 2026-07-02 :
6 nouvelles matières + le recueil pénal enrichi (10 -> 19 arrêts, qui écrase l'ancien blob).

Lance avec : python3 upload_blobs_fiches_arret_nouvelles.py
Le token BLOB_READ_WRITE_TOKEN est lu depuis le .env local (jamais affiché).
"""
import urllib.request, urllib.error, json, os, sys

BLOB_TOKEN = os.environ.get("BLOB_TOKEN", "")
if not BLOB_TOKEN:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        for line in open(env_path):
            line = line.strip()
            if line.startswith("BLOB_READ_WRITE_TOKEN="):
                BLOB_TOKEN = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
if not BLOB_TOKEN:
    print("BLOB_TOKEN introuvable (ni env ni .env)", file=sys.stderr)
    sys.exit(1)

ARRETS = "/Users/julienfnl/Desktop/Claude/livrables/contenus-tjd/fiches-arrets"

# prod_id (= nom du blob tjd/{prod_id}.pdf) -> chemin local du PDF
FICHIERS = {
    "fiche-arret-constit-l1-s1":               f"{ARRETS}/fiche-arret-constit-l1-s1.pdf",
    "fiche-arret-constit-l1-s2":               f"{ARRETS}/fiche-arret-constit-l1-s2.pdf",
    "fiche-arret-intro-droit-l1":              f"{ARRETS}/fiche-arret-intro-droit-l1.pdf",
    "fiche-arret-relations-internationales-l1": f"{ARRETS}/fiche-arret-relations-internationales-l1.pdf",
    "fiche-arret-commercial-l3-s1":            f"{ARRETS}/fiche-arret-commercial-l3-s1.pdf",
    "fiche-arret-travail-l3-s1":               f"{ARRETS}/fiche-arret-travail-l3-s1.pdf",
    # Pénal enrichi : nom local avec un "s", mais blob sans "s" pour écraser l'existant vendu.
    "fiche-arret-penal":                       f"{ARRETS}/fiches-arret-droit-penal.pdf",
}

resultats, erreurs = {}, []
for prod_id, chemin in FICHIERS.items():
    if not os.path.exists(chemin):
        print(f"ABSENT : {prod_id} -> {chemin}")
        erreurs.append(prod_id)
        continue
    with open(chemin, "rb") as f:
        data = f.read()
    url = f"https://blob.vercel-storage.com/tjd/{prod_id}.pdf"
    req = urllib.request.Request(
        url, data=data, method="PUT",
        headers={
            "Authorization": f"Bearer {BLOB_TOKEN}",
            "Content-Type": "application/pdf",
            "x-api-version": "7",
            "x-add-random-suffix": "0",
        })
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read())
            resultats[prod_id] = res.get("url", "")
            print(f"OK  {prod_id} -> {resultats[prod_id]}")
    except urllib.error.HTTPError as e:
        print(f"ERR {prod_id}: HTTP {e.code} -> {e.read().decode()}")
        erreurs.append(prod_id)
    except Exception as e:
        print(f"ERR {prod_id}: {e}")
        erreurs.append(prod_id)

print(f"\n{len(resultats)} uploadés, {len(erreurs)} erreurs.")
if erreurs:
    print("Erreurs :", erreurs)
