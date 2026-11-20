"""Accès signé aux fichiers médias et aux PDF nominatifs."""

from __future__ import annotations

import os
import urllib.error
import urllib.parse
from http.server import BaseHTTPRequestHandler

from botocore.exceptions import ClientError, ConnectionError as R2ConnectionError, HTTPClientError

from lib.personnalisation_pdf import (
    lien_media_prive,
    lien_pdf_offert,
    produire_depuis_commande,
    verifier_signature,
)


PAGE_PANNE_TEMPORAIRE = """<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Téléchargement indisponible | Trajectoire Droit</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: clamp(1rem, 5vw, 3rem); background: #f2f5fb; color: #1a2851; font: 1rem/1.6 system-ui, sans-serif; }
    main { max-width: 36rem; margin: clamp(1rem, 7vh, 4rem) auto; padding: clamp(1.25rem, 5vw, 2.5rem); background: #fff; border: 1px solid #c9d3ea; border-radius: 18px; }
    .marque { margin: 0 0 1rem; font-weight: 700; }
    h1 { margin: 0; font: 700 clamp(1.7rem, 5vw, 2.25rem)/1.2 Georgia, serif; }
    a { display: inline-flex; align-items: center; min-height: 44px; color: #1a2851; text-underline-offset: .16em; }
    a:focus-visible { outline: 3px solid #315ca6; outline-offset: 3px; }
    .bouton { padding: .65rem 1rem; border-radius: .6rem; background: #1a2851; color: #fff; font-weight: 700; text-decoration: none; }
    .aide { margin: 1.5rem 0 0; }
  </style>
</head>
<body>
  <main>
    <p class="marque">Trajectoire Droit</p>
    <h1>Le téléchargement est temporairement indisponible</h1>
    <p>Il faut réessayer dans un instant pour ouvrir le même PDF.</p>
    <a class="bouton" href="" rel="noreferrer">Réessayer</a>
    <p class="aide">Le PDF acheté figure aussi dans Mon compte.</p>
    <a href="/mon-compte.html" rel="noreferrer">Retrouver mes documents</a>
  </main>
</body>
</html>"""


def panne_temporaire(erreur: Exception) -> bool:
    if isinstance(erreur, urllib.error.HTTPError):
        statut = erreur.code
    elif isinstance(erreur, ClientError):
        statut = erreur.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    else:
        return isinstance(erreur, (urllib.error.URLError, TimeoutError, ConnectionError, R2ConnectionError, HTTPClientError))
    return isinstance(statut, int) and (statut in (408, 429) or 500 <= statut < 600)


class handler(BaseHTTPRequestHandler):
    def log_request(self, code="-", size="-") -> None:
        self.log_message("%s /api/personnaliser-pdf %s %s", self.command, code, size)

    def _texte(self, statut: int, message: str, type_contenu: str = "text/plain") -> None:
        contenu = message.encode("utf-8")
        self.send_response(statut)
        self.send_header("Content-Type", f"{type_contenu}; charset=utf-8")
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.end_headers()
        self.wfile.write(contenu)

    def do_GET(self) -> None:
        parametres = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

        def valeur(nom: str) -> str:
            return (parametres.get(nom) or [""])[0]

        produit_id = valeur("id")
        session_id = valeur("sid")
        source_url = valeur("src")
        nom_produit = valeur("nom")
        nom_fichier = valeur("fichier")
        signature = valeur("psig")
        try:
            blob_index = int(valeur("b"))
            expiration = int(valeur("exp"))
        except ValueError:
            self._texte(400, "Lien invalide ou incomplet.")
            return

        secret = os.environ.get("DOWNLOAD_SECRET", "")
        cle_stripe = os.environ.get("STRIPE_SECRET_KEY", "")
        est_pdf = source_url.endswith(".pdf")
        if not secret or (est_pdf and session_id and not cle_stripe):
            self._texte(500, "Le téléchargement est indisponible.")
            return

        try:
            verifier_signature(
                produit_id,
                blob_index,
                expiration,
                signature,
                secret,
                session_id,
                source_url,
                nom_produit,
                nom_fichier,
            )
            if not est_pdf:
                destination = lien_media_prive(source_url, expiration)
            elif session_id:
                try:
                    destination, _, _ = produire_depuis_commande(
                        session_id,
                        secret,
                        cle_stripe,
                        produit_id,
                        blob_index,
                        source_url,
                        nom_produit,
                        nom_fichier,
                    )
                except Exception as erreur:
                    if not panne_temporaire(erreur):
                        raise
                    print(f"personnaliser-pdf panne temporaire: {type(erreur).__name__}")
                    # Le navigateur peut reprendre la requête courante sans réémettre de lien.
                    self._texte(503, PAGE_PANNE_TEMPORAIRE, "text/html")
                    return
            else:
                destination = lien_pdf_offert(source_url)
        except PermissionError as erreur:
            statut = 410 if str(erreur) == "Lien expiré" else 403
            self._texte(statut, str(erreur) + ".")
            return
        except (ValueError, urllib.error.HTTPError, urllib.error.URLError) as erreur:
            print(f"personnaliser-pdf erreur contrôlée: {type(erreur).__name__}")
            self._texte(400, "La commande ou le fichier source est invalide.")
            return
        except Exception as erreur:  # noqa: BLE001, dernier garde-fou de la route Vercel
            print(f"personnaliser-pdf erreur interne: {type(erreur).__name__}")
            self._texte(500, "Le téléchargement est indisponible.")
            return

        self.send_response(302)
        self.send_header("Location", destination)
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.end_headers()
