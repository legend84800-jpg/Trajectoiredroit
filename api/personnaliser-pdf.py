"""Point d'entrée Vercel du téléchargement PDF nominatif généralisé."""

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
                source_url,
                nom_produit,
                nom_fichier,
            )
            url_pdf, _, _ = produire_depuis_commande(
                session_id,
                secret,
                cle_stripe,
                produit_id,
                blob_index,
                source_url,
                nom_produit,
                nom_fichier,
            )
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
            self._texte(500, "Le téléchargement est temporairement indisponible.")
            return

        self.send_response(302)
        self.send_header("Location", url_pdf)
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.end_headers()
