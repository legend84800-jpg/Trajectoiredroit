"""Point d'entrée Vercel du téléchargement PDF nominatif."""

from __future__ import annotations

import os
import urllib.error
import urllib.parse
from http.server import BaseHTTPRequestHandler

from lib.personnalisation_pdf import produire_depuis_commande, verifier_signature


class handler(BaseHTTPRequestHandler):
    def _texte(self, statut: int, message: str) -> None:
        contenu = message.encode("utf-8")
        self.send_response(statut)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(contenu)

    def do_GET(self) -> None:
        parametres = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

        def valeur(nom: str) -> str:
            return (parametres.get(nom) or [""])[0]

        produit_id = valeur("id")
        session_id = valeur("sid")
        signature = valeur("sig")
        try:
            blob_index = int(valeur("b"))
            expiration = int(valeur("exp"))
        except ValueError:
            self._texte(400, "Lien invalide ou incomplet.")
            return

        secret = os.environ.get("DOWNLOAD_SECRET", "")
        cle_stripe = os.environ.get("STRIPE_SECRET_KEY", "")
        if not secret or not cle_stripe:
            self._texte(500, "Le téléchargement est temporairement indisponible.")
            return

        try:
            verifier_signature(
                produit_id,
                blob_index,
                expiration,
                signature,
                secret,
                session_id,
            )
            contenu, identite = produire_depuis_commande(
                session_id,
                secret,
                cle_stripe,
            )
        except PermissionError as erreur:
            statut = 410 if str(erreur) == "Lien expiré" else 403
            self._texte(statut, str(erreur) + ".")
            return
        except (ValueError, urllib.error.HTTPError, urllib.error.URLError) as erreur:
            print(f"personnaliser-pdf erreur contrôlée: {type(erreur).__name__}")
            self._texte(400, "La commande ou le fichier source est invalide.")
            return
        except Exception as erreur:
            print(f"personnaliser-pdf erreur interne: {type(erreur).__name__}")
            self._texte(500, "Le téléchargement est temporairement indisponible.")
            return

        nom_fichier = f"majeures-penal-l2-s1-{identite.licence.lower()}.pdf"
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Disposition", f'attachment; filename="{nom_fichier}"')
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.end_headers()
        self.wfile.write(contenu)
