import importlib.util
import io
import os
import time
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError

from lib import personnalisation_pdf


spec = importlib.util.spec_from_file_location(
    "route_personnaliser_pdf", Path(__file__).resolve().parents[1] / "api/personnaliser-pdf.py"
)
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)

SECRET = "signature-factice"
SESSION = "cs_test_RoutePdf"
PRODUIT = "fiche-da-l2-s1"
SOURCE = "r2://tjd/fiche-da-l2-s1.pdf"
NOM = "Fiche complète Droit administratif L2 S1"
FICHIER = "fiche-da-l2-s1.pdf"
DESTINATION = "https://fichiers.example.test/copiefactice.pdf"
CONFIGURATION = {
    "DOWNLOAD_SECRET": SECRET,
    "STRIPE_SECRET_KEY": "sk_test_factice",
    "R2_PERSONNALISES_BUCKET": "copies-fictives",
}


class ReponseFictive:
    _texte = route.handler._texte

    def __init__(self, chemin):
        self.path = chemin
        self.headers = {}
        self.wfile = io.BytesIO()

    def send_response(self, statut):
        self.statut = statut

    def send_header(self, nom, valeur):
        self.headers[nom] = valeur

    def end_headers(self):
        pass

    def corps(self):
        return self.wfile.getvalue().decode("utf-8")


class PersonnaliserPdfRouteTest(unittest.TestCase):
    def setUp(self):
        self.session = {
            "id": SESSION,
            "mode": "payment",
            "payment_status": "paid",
            "status": "complete",
            "metadata": {"produitIds": PRODUIT},
            "customer_details": {"email": "etudiant@example.test"},
        }
        self.stripe = Mock(return_value=self.session)
        self.stockage = Mock()
        self.stockage.head_object.return_value = {
            "ContentLength": 1024,
            "Metadata": {"tjd-source-version": "0" * 20},
        }
        self.stockage.generate_presigned_url.return_value = DESTINATION
        self.expiration = int(time.time()) + 600

    def requete(self, *, expiration=None, signature=None):
        if expiration is None:
            expiration = self.expiration
        if signature is None:
            signature = personnalisation_pdf.generer_signature_personnalisation(
                PRODUIT, 0, expiration, SESSION, SOURCE, NOM, FICHIER, SECRET
            )
        parametres = {"id": PRODUIT, "b": 0, "exp": expiration, "sid": SESSION,
                     "src": SOURCE, "nom": NOM, "fichier": FICHIER, "psig": signature}
        reponse = ReponseFictive("/api/personnaliser-pdf?" + urllib.parse.urlencode(parametres))

        def produire(*args):
            return personnalisation_pdf.produire_depuis_commande(
                *args, chargeur_session=self.stripe, client_r2=self.stockage
            )

        with patch.dict(os.environ, CONFIGURATION, clear=True), patch.object(route, "produire_depuis_commande", produire):
            route.handler.do_GET(reponse)
        return reponse

    def assert_page_panne(self, reponse):
        self.assertEqual(reponse.statut, 503)
        self.assertEqual(reponse.headers["Content-Type"], "text/html; charset=utf-8")
        self.assertEqual(reponse.headers["Cache-Control"], "private, no-store")
        self.assertEqual(reponse.headers["Referrer-Policy"], "no-referrer")
        self.assertEqual(reponse.headers["X-Robots-Tag"], "noindex, nofollow, noarchive")
        self.assertNotIn("Location", reponse.headers)
        self.assertIn('href="" rel="noreferrer">Réessayer</a>', reponse.corps())
        self.assertIn('href="/mon-compte.html"', reponse.corps())
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(reponse.path).query)
        for valeur in (query["psig"][0], SESSION, PRODUIT, NOM, SOURCE, DESTINATION, SECRET):
            self.assertNotIn(valeur, reponse.corps())

    def test_indisponibilite_stripe_sur_un_lien_signe(self):
        for erreur in (urllib.error.URLError("connexion fictive"), *(
            urllib.error.HTTPError("https://stripe.example.test", code, "erreur fictive", {}, None)
            for code in (408, 429, 503)
        )):
            with self.subTest(erreur=erreur):
                self.stripe.side_effect = erreur
                self.assert_page_panne(self.requete())
        self.stockage.head_object.assert_not_called()
        self.stockage.generate_presigned_url.assert_not_called()

    def test_le_meme_lien_repart_apres_une_panne_r2(self):
        for erreur in (TimeoutError(), ClientError({"ResponseMetadata": {"HTTPStatusCode": 503}}, "HeadObject")):
            with self.subTest(erreur=erreur):
                self.stockage.head_object.side_effect = erreur
                panne = self.requete()
                self.assert_page_panne(panne)
                self.stockage.head_object.side_effect = None
                succes = self.requete()
                self.assertEqual(succes.path, panne.path)
                self.assertEqual(succes.statut, 302)
                self.assertEqual(succes.headers["Location"], DESTINATION)
                self.assertEqual(succes.headers["Referrer-Policy"], "no-referrer")
                self.assertEqual(succes.headers["Cache-Control"], "private, no-store")
                self.assertEqual(self.stockage.generate_presigned_url.call_args.kwargs["ExpiresIn"], 900)

    def test_lien_expire_ou_signature_invalide_ne_demande_aucun_fichier(self):
        self.assertEqual(self.requete(expiration=int(time.time()) - 1).statut, 410)
        self.assertEqual(self.requete(signature="0" * 64).statut, 403)
        self.stripe.assert_not_called()
        self.stockage.head_object.assert_not_called()

    def test_commande_non_payee_ou_produit_absent_ne_demande_aucun_fichier(self):
        for variante in ({"payment_status": "unpaid"}, {"metadata": {"produitIds": "fiche-da-l2-s2"}}):
            with self.subTest(variante=variante):
                self.stripe.return_value = dict(self.session, **variante)
                reponse = self.requete()
                self.assertEqual(reponse.statut, 403)
                self.assertNotIn("Réessayer", reponse.corps())
        self.stockage.head_object.assert_not_called()

    def test_cause_inconnue_et_session_inconnue_restent_distinctes_de_la_panne(self):
        self.stockage.head_object.side_effect = RuntimeError("détail interne fictif")
        reponse = self.requete()
        self.assertEqual(reponse.statut, 500)
        self.assertEqual(reponse.headers["Content-Type"], "text/plain; charset=utf-8")
        self.assertNotIn("détail interne", reponse.corps())
        self.assertNotIn("Réessayer", reponse.corps())

        self.stripe.side_effect = urllib.error.HTTPError("https://stripe.example.test", 404, "introuvable", {}, None)
        reponse = self.requete()
        self.assertEqual(reponse.statut, 400)
        self.assertNotIn("Réessayer", reponse.corps())
