"""Kit d'essai des majeures préparées (07/11/2026).

GET /api/kit-essai?m=maj-da-l2-s1&a=9&b=22
Assemble la couverture du kit, les deux majeures choisies et la suite (cas
pratique corrigé, pages de la fiche complète, QCM, page finale), toutes déjà
publiées sur R2 sous tjd/essai/ par
livrables/automatisation/essai-gratuit-tjd-2026-11-07/preparer_kits.py.
Le PDF assemblé est mis en cache sur R2 (tjd/essai/genere/), puis la route
redirige vers lui : un même choix de majeures ne s'assemble qu'une fois, et la
taille du PDF échappe à la limite de réponse des fonctions Vercel.
Aucune donnée personnelle, aucun lien avec Stripe ni avec l'achat.
"""

from __future__ import annotations

import io
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

from lib.essai_majeures import NB_MAJEURES

R2_PUBLIC = "https://pub-45b53167be7548aca62650d34a771b47.r2.dev"
ENTETES = {"User-Agent": "Mozilla/5.0 (TrajectoireDroit kit-essai)"}
EDITION_MAJEURES = "affichage-20261110"
EDITIONS_MAJEURES = {
    "maj-contrats-l2-s1": "une-ligne-20261110",
    "maj-famille-l1-s2": "une-ligne-20261110",
    "maj-obligations-l2-s2": "une-ligne-20261110",
}


def _edition_majeures(produit: str) -> str:
    return EDITIONS_MAJEURES.get(produit, EDITION_MAJEURES)


def _lire(cle: str) -> bytes:
    requete = urllib.request.Request(f"{R2_PUBLIC}/{cle}", headers=ENTETES)
    with urllib.request.urlopen(requete, timeout=20) as reponse:
        return reponse.read()


def _existe(cle: str) -> bool:
    requete = urllib.request.Request(f"{R2_PUBLIC}/{cle}", headers=ENTETES, method="HEAD")
    try:
        with urllib.request.urlopen(requete, timeout=10) as reponse:
            return reponse.status == 200
    except urllib.error.HTTPError:
        return False


def _assembler(produit: str, majeures: list[int]) -> bytes:
    import pypdf

    morceaux = [f"tjd/essai/kit/{produit}/couverture.pdf"]
    morceaux += [f"tjd/essai/majeure/{_edition_majeures(produit)}/{produit}/{i}.pdf" for i in majeures]
    morceaux.append(f"tjd/essai/kit/{produit}/suite.pdf")
    sortie = pypdf.PdfWriter()
    for cle in morceaux:
        for page in pypdf.PdfReader(io.BytesIO(_lire(cle))).pages:
            sortie.add_page(page)
    sortie.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    tampon = io.BytesIO()
    sortie.write(tampon)
    return tampon.getvalue()


def _envoyer_r2(cle: str, contenu: bytes, nom: str) -> None:
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    client.put_object(
        Bucket=os.environ["R2_BUCKET"],
        Key=cle,
        Body=contenu,
        ContentType="application/pdf",
        ContentDisposition=f'inline; filename="{nom}"',
        CacheControl="public, max-age=86400",
    )


class handler(BaseHTTPRequestHandler):
    def _texte(self, statut: int, message: str) -> None:
        contenu = message.encode("utf-8")
        self.send_response(statut)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(contenu)

    def do_GET(self) -> None:
        parametres = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        produit = (parametres.get("m") or [""])[0]
        if not re.fullmatch(r"maj-[a-z0-9-]{3,40}", produit) or produit not in NB_MAJEURES:
            self._texte(400, "Matière inconnue.")
            return
        try:
            choix = [int(x) for x in [(parametres.get("a") or [""])[0], (parametres.get("b") or [""])[0]] if x != ""]
        except ValueError:
            self._texte(400, "Choix de majeures invalide.")
            return
        choix = sorted(set(choix))
        if not 1 <= len(choix) <= 2 or any(not 1 <= i <= NB_MAJEURES[produit] for i in choix):
            self._texte(400, "Choix de majeures invalide.")
            return

        nom = f"kit-essai-{produit}-majeures-{'-'.join(map(str, choix))}.pdf"
        cle = f"tjd/essai/genere/{_edition_majeures(produit)}/{produit}/{'-'.join(map(str, choix))}.pdf"
        try:
            if not _existe(cle):
                _envoyer_r2(cle, _assembler(produit, choix), nom)
        except Exception as erreur:  # noqa: BLE001, dernier garde-fou de la route Vercel
            print(f"kit-essai erreur: {type(erreur).__name__}: {erreur}")
            self._texte(502, "Le kit n'a pas pu être préparé. Réessaie dans une minute.")
            return
        self.send_response(302)
        self.send_header("Location", f"{R2_PUBLIC}/{cle}")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
