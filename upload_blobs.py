#!/usr/bin/env python3
"""
Upload tous les PDFs TJD sur Vercel Blob et affiche le mapping id -> URL.
Lancer avec : BLOB_TOKEN=vercel_blob_rw_... python3 upload_blobs.py
"""
import urllib.request
import json
import os
import sys

BLOB_TOKEN = os.environ.get("BLOB_TOKEN", "")
if not BLOB_TOKEN:
    # Essai depuis le .env local
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

BASE = "/root/Claude/livrables/contenus-tjd"

FICHIERS = {
    # Fiches compilées
    "fiche-da-l2-s1":             f"{BASE}/compilations/fiches-compilees/L2/compilation_Droit_Administratif_L2_S1.pdf",
    "fiche-da-l2-s2":             f"{BASE}/compilations/fiches-compilees/L2/compilation_Droit_Administratif_L2_S2.pdf",
    "fiche-constit-l1-s1":        f"{BASE}/compilations/fiches-compilees/L1/compilation_Droit_Constit_S1.pdf",
    "fiche-constit-l1-s2":        f"{BASE}/compilations/fiches-compilees/L1/compilation_Droit_Constitutionnel_L1_S2.pdf",
    "fiche-intro-droit-l1":       f"{BASE}/compilations/fiches-compilees/L1/compilation_Introduction_au_droit_L1_S1.pdf",
    "fiche-hist-droit-l1":        f"{BASE}/compilations/fiches-compilees/L1/compilation_Histoire_du_droit_L1_S1.pdf",
    "fiche-hist-institutions-l1": f"{BASE}/compilations/fiches-compilees/L1/compilation_Histoire_des_institutions_L1_S2.pdf",
    "fiche-personnes-l1":         f"{BASE}/compilations/fiches-compilees/L1/compilation_Droit_des_personnes_L1.pdf",
    "fiche-famille-l1-s2":        f"{BASE}/compilations/fiches-compilees/L1/compilation_Droit_de_la_famille_L1_S2.pdf",
    "fiche-contrats-l2-s1":       f"{BASE}/compilations/fiches-compilees/L2/compilation_Droit_des_contrats_L2_S1.pdf",
    "fiche-obligations-l2-s2":    f"{BASE}/compilations/fiches-compilees/L2/compilation_Droit_Obligations_L2_S2.pdf",
    "fiche-penal-general-l1":     f"{BASE}/compilations/fiches-compilees/L1/compilation_Droit_pénal_L1_S2.pdf",
    "fiche-penal-l2-s1":          f"{BASE}/compilations/fiches-compilees/L2/compilation_Droit_pénal_L2_S1.pdf",
    "fiche-biens-l2":             f"{BASE}/compilations/fiches-compilees/L2/compilation_Droit_des_biens_L2.pdf",
    "fiche-commercial-l3-s1":     f"{BASE}/compilations/fiches-compilees/L3/compilation_Droit_commercial_L3_S1.pdf",
    "fiche-societes-l3-s1":       f"{BASE}/compilations/fiches-compilees/L3/compilation_Droit_des_sociétés_L3_S1.pdf",
    "fiche-contrats-speciaux-l3": f"{BASE}/compilations/fiches-compilees/L3/compilation_Contrats_Speciaux_L3.pdf",
    "fiche-travail-l3-s1":        f"{BASE}/compilations/fiches-compilees/L3/compilation_Droit_du_travail_L3_S1.pdf",
    "fiche-procedure-penale-l3":  f"{BASE}/compilations/fiches-compilees/L3/compilation_Procédure_pénale_L3.pdf",
    # Majeures préparées
    "maj-intro-droit-l1":         f"{BASE}/majeures-preparees/L1/S1/intro-droit/Majeures_Intro_Droit_L1.pdf",
    "maj-personnes-l1":           f"{BASE}/majeures-preparees/L1/S1/droit-personnes-l1/Majeures_Personnes_L1.pdf",
    "maj-famille-l1-s2":          f"{BASE}/majeures-preparees/L1/S2/droit-famille-l1-s2/Majeures_Famille_L1_S2.pdf",
    "maj-da-l2-s1":               f"{BASE}/majeures-preparees/L2/S1/droit-admin-l2-s1/Majeures_DA_L2_S1.pdf",
    "maj-da-l2-s2":               f"{BASE}/majeures-preparees/L2/S2/droit-admin-l2-s2/Majeures_DA_L2_S2.pdf",
    "maj-contrats-l2-s1":         f"{BASE}/majeures-preparees/L2/S1/droit-contrats-l2-s1/Majeures_Contrats_L2_S1.pdf",
    "maj-obligations-l2-s2":      f"{BASE}/majeures-preparees/L2/S2/droit-obligations-l2-s2/Majeures_Obligations_L2_S2.pdf",
    "maj-penal-l2-s1":            f"{BASE}/majeures-preparees/L2/S1/droit-penal-l2-s1/Majeures_Penal_L2_S1.pdf",
    "maj-penal-l2-s2":            f"{BASE}/majeures-preparees/L2/S2/droit-penal-l2-s2/Majeures_Penal_L2_S2.pdf",
    "maj-biens-l2":               f"{BASE}/majeures-preparees/L2/droit-biens-l2/Majeures_Biens_L2.pdf",
    "maj-commercial-l3-s1":       f"{BASE}/majeures-preparees/L3/S1/droit-commercial-l3-s1/Majeures_Commercial_L3_S1.pdf",
}

resultats = {}
erreurs = []

for prod_id, chemin in FICHIERS.items():
    if not os.path.exists(chemin):
        print(f"ABSENT : {prod_id} -> {chemin}")
        erreurs.append(prod_id)
        continue

    with open(chemin, "rb") as f:
        data = f.read()

    pathname = f"tjd/{prod_id}.pdf"
    url = f"https://blob.vercel-storage.com/{pathname}"

    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {BLOB_TOKEN}",
            "Content-Type": "application/pdf",
            "x-api-version": "7",
            "x-add-random-suffix": "0",
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read())
            blob_url = res.get("url", "")
            resultats[prod_id] = blob_url
            print(f"OK  {prod_id} -> {blob_url}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERR {prod_id}: HTTP {e.code} -> {body}")
        erreurs.append(prod_id)
    except Exception as e:
        print(f"ERR {prod_id}: {e}")
        erreurs.append(prod_id)

out = os.path.join(os.path.dirname(__file__), "blob_urls.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(resultats, f, indent=2, ensure_ascii=False)

print(f"\n{len(resultats)} uploadés, {len(erreurs)} erreurs")
print(f"Résultat -> {out}")
