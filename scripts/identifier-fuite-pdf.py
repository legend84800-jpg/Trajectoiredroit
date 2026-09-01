#!/usr/bin/env python3
"""Identifie localement la commande à l'origine d'un PDF diffusé."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

RACINE = Path(__file__).resolve().parents[1]
if str(RACINE) not in sys.path:
    sys.path.insert(0, str(RACINE))

from lib.identification_fuite_pdf import analyser_pdf  # noqa: I001


VARIABLES_REQUISES = ("FORENSIC_ADMIN_SECRET",)
API_PAR_DEFAUT = "https://trajectoiredroit.com/api/identifier-fuite"


def charger_configuration() -> None:
    for nom in (".env.local", ".env"):
        chemin = RACINE / nom
        if chemin.is_file():
            load_dotenv(chemin, override=False)


def variable_obligatoire(nom: str) -> str:
    valeur = os.environ.get(nom, "").strip()
    if not valeur:
        raise RuntimeError(f"Variable d'environnement manquante, {nom}")
    return valeur


def _charge_signature(
    horodatage: str,
    nonce: str,
    fingerprints: list[str],
    licences: list[str],
) -> str:
    return "|".join(
        (
            horodatage,
            nonce,
            ",".join(sorted(fingerprints)),
            ",".join(sorted(licences)),
        )
    )


def interroger_service(
    analyse: dict[str, object],
    secret: str,
    url: str,
) -> dict[str, object]:
    fingerprints = sorted((analyse.get("fingerprints") or {}).keys())[:32]
    licences = sorted(analyse.get("licences") or [])[:32]
    if not fingerprints and not licences:
        raise LookupError("Aucun marqueur exploitable n'a été retrouvé dans le PDF")

    horodatage = str(int(time.time()))
    nonce = secrets.token_hex(16)
    charge = _charge_signature(horodatage, nonce, fingerprints, licences)
    signature = hmac.new(
        secret.encode("utf-8"),
        charge.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    corps = json.dumps(
        {"fingerprints": fingerprints, "licences": licences},
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode("utf-8")
    requete = urllib.request.Request(
        url,
        data=corps,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-TJD-Timestamp": horodatage,
            "X-TJD-Nonce": nonce,
            "X-TJD-Signature": signature,
            "User-Agent": "TrajectoireDroit-Forensic/1.0",
        },
    )
    try:
        with urllib.request.urlopen(requete, timeout=30) as reponse:
            contenu = reponse.read()
            signature_reponse = reponse.headers.get("X-TJD-Response-Signature", "")
    except urllib.error.HTTPError as erreur:
        contenu_erreur = erreur.read()
        signature_erreur = erreur.headers.get("X-TJD-Response-Signature", "")
        signature_attendue = hmac.new(
            secret.encode("utf-8"),
            contenu_erreur,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature_attendue, signature_erreur.lower()):
            raise PermissionError(
                "La réponse d'erreur du service d'identification n'est pas signée"
            ) from erreur
        if erreur.code == 404:
            raise LookupError(
                "Aucune commande ne correspond aux marqueurs retrouvés"
            ) from erreur
        raise RuntimeError(f"Service d'identification indisponible, HTTP {erreur.code}") from erreur

    signature_attendue = hmac.new(
        secret.encode("utf-8"),
        contenu,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature_attendue, signature_reponse.lower()):
        raise PermissionError("La réponse du service d'identification n'est pas signée")
    donnees = json.loads(contenu.decode("utf-8"))
    if donnees.get("schema") != "tjd-correspondance-fuite-v1":
        raise RuntimeError("Réponse du service d'identification inattendue")
    return donnees


def construire_rapport_service(
    analyse: dict[str, object],
    correspondance: dict[str, object],
) -> dict[str, object]:
    fingerprint = str(correspondance.get("fingerprint") or "")
    licence = str(correspondance.get("licence") or "")
    preuve = (analyse.get("fingerprints") or {}).get(fingerprint) or {}
    couches = sorted(set(preuve.get("couches") or []))
    occurrences = int(preuve.get("occurrences_visuelles") or 0)
    licence_trouvee = licence in set(analyse.get("licences") or [])
    if not couches and not occurrences and not licence_trouvee:
        raise PermissionError("La commande retournée ne correspond pas à l'analyse locale")

    preuve_directe = licence_trouvee or any(
        couche != "micro_marqueurs" for couche in couches
    )
    statut = (
        "identification_confirmee"
        if preuve_directe or occurrences >= 2
        else "correspondance_a_confirmer"
    )
    return {
        "schema": "tjd-identification-fuite-pdf-v1",
        "statut": statut,
        "confiance": "forte" if statut == "identification_confirmee" else "moyenne",
        "fichier": analyse["fichier"],
        "sha256": analyse["sha256"],
        "preuve": {
            "licence": licence,
            "fingerprint": fingerprint,
            "couches": couches,
            "occurrences_visuelles": occurrences,
        },
        "commande": correspondance["commande"],
        "titulaire": correspondance["titulaire"],
    }


def afficher_rapport(rapport: dict[str, object]) -> None:
    preuve = rapport["preuve"]
    commande = rapport["commande"]
    titulaire = rapport["titulaire"]
    statut = rapport["statut"]
    titre = (
        "IDENTIFICATION CONFIRMÉE"
        if statut == "identification_confirmee"
        else "CORRESPONDANCE À CONFIRMER"
    )
    print(f"\n{titre}\n")
    print(f"Licence               {preuve['licence']}")
    print(f"Fingerprint           {preuve['fingerprint']}")
    print(f"Commande Stripe       {commande['session_stripe']}")
    print(f"Paiement              {commande['paiement']}")
    print(f"Titulaire             {titulaire['nom'] or titulaire['nom_affiche_pdf']}")
    print(f"Email                 {titulaire['email']}")
    print(f"Produit               {', '.join(commande['produits'])}")
    print(f"Montant               {commande['montant_euros']} €")
    print(f"Date                   {commande['date']}")
    print(f"Niveau de confiance   {rapport['confiance']}")
    print(f"Preuves               {', '.join(preuve['couches']) or 'micro-marqueurs visuels'}")
    print(f"Répétitions visuelles {preuve['occurrences_visuelles']}")
    print(f"SHA-256 du PDF        {rapport['sha256']}")


def parser() -> argparse.ArgumentParser:
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("pdf", type=Path, help="PDF suspect à analyser")
    analyseur.add_argument(
        "--rapport",
        type=Path,
        help="Enregistrer aussi le rapport JSON à cet emplacement",
    )
    analyseur.add_argument("--json", action="store_true", help="Afficher le rapport JSON")
    analyseur.add_argument("--dpi", type=int, default=288)
    analyseur.add_argument("--pages-max", type=int, default=8)
    return analyseur


def main() -> int:
    args = parser().parse_args()
    try:
        charger_configuration()
        secret = variable_obligatoire("FORENSIC_ADMIN_SECRET")

        analyse = analyser_pdf(args.pdf, dpi=args.dpi, pages_max=args.pages_max)
        url = os.environ.get("FORENSIC_API_URL", API_PAR_DEFAUT).strip()
        correspondance = interroger_service(analyse, secret, url)
        rapport = construire_rapport_service(analyse, correspondance)

        if args.rapport:
            destination = args.rapport.expanduser().resolve()
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(
                json.dumps(rapport, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        if args.json:
            print(json.dumps(rapport, ensure_ascii=False, indent=2))
        else:
            afficher_rapport(rapport)
        return 0 if rapport["statut"] == "identification_confirmee" else 3
    except LookupError as erreur:
        print(str(erreur), file=sys.stderr)
        return 2
    except Exception as erreur:  # noqa: BLE001, frontière du programme en ligne de commande
        print(f"ERREUR, {erreur}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
