import io
import unittest
from unittest.mock import patch

import pikepdf
from botocore.exceptions import ClientError
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from lib.personnalisation_pdf import (
    PRODUIT_PILOTE,
    SOURCE_PREFIX,
    codes_licence_depuis_session,
    generer_signature_personnalisation,
    identite_depuis_session,
    personnaliser_pdf,
    produire_depuis_commande,
    verifier_session_payee,
    verifier_signature,
)


def source_pdf_protegee() -> bytes:
    claire = io.BytesIO()
    dessin = canvas.Canvas(claire, pagesize=(595.28, 841.89))
    dessin.drawString(72, 760, "Page source de test")
    dessin.showPage()
    dessin.save()
    chiffree = io.BytesIO()
    with pikepdf.open(io.BytesIO(claire.getvalue())) as pdf:
        pdf.save(
            chiffree,
            encryption=pikepdf.Encryption(
                owner="mot-de-passe-proprietaire",
                user="",
                R=6,
                allow=pikepdf.Permissions(extract=False, modify_other=False),
            ),
        )
    return chiffree.getvalue()


def session_payee() -> dict:
    return {
        "id": "cs_test_pdf_personnalise_1",
        "mode": "payment",
        "payment_status": "paid",
        "metadata": {"produitIds": PRODUIT_PILOTE},
        "customer_details": {
            "email": "julien.test@gmail.com",
            "name": "Nom carte ignoré",
        },
        "custom_fields": [{
            "key": "nomlicence",
            "type": "text",
            "text": {"value": "Julien Dupont"},
        }],
    }


class PersonnalisationPdfTest(unittest.TestCase):
    def test_signature_liee_a_la_commande(self):
        secret = "secret-de-test"
        expiration = 2_000_000_000
        source_url = SOURCE_PREFIX + "maj-penal-l2-s1.pdf"
        nom_produit = "Majeures préparées Droit pénal L2 S1"
        nom_fichier = "maj-penal-l2-s1.pdf"
        signature = generer_signature_personnalisation(
            PRODUIT_PILOTE,
            0,
            expiration,
            "cs_test_pdf_personnalise_1",
            source_url,
            nom_produit,
            nom_fichier,
            secret,
        )
        verifier_signature(
            PRODUIT_PILOTE,
            0,
            expiration,
            signature,
            secret,
            "cs_test_pdf_personnalise_1",
            source_url,
            nom_produit,
            nom_fichier,
            maintenant=1_900_000_000,
        )
        with self.assertRaises(PermissionError):
            verifier_signature(
                PRODUIT_PILOTE,
                0,
                expiration,
                signature,
                secret,
                "cs_test_autre",
                source_url,
                nom_produit,
                nom_fichier,
                maintenant=1_900_000_000,
            )

    def test_codes_generalises_distinguent_produit_et_fichier(self):
        secret = "secret-de-test"
        session_id = "cs_test_pdf_generalise"
        codes_fiche = codes_licence_depuis_session(
            session_id,
            secret,
            "fiche-da-l2-s1",
            0,
        )
        codes_plan = codes_licence_depuis_session(
            session_id,
            secret,
            "fiche-da-l2-s1",
            1,
        )
        codes_autre = codes_licence_depuis_session(
            session_id,
            secret,
            "cours-fiche-da-l2-s1",
            0,
        )
        self.assertEqual(codes_fiche[0], codes_plan[0])
        self.assertNotEqual(codes_fiche[1], codes_plan[1])
        self.assertNotEqual(codes_fiche[0], codes_autre[0])
        self.assertRegex(codes_fiche[0], r"^TD-[0-9A-F]{10}$")
        self.assertRegex(codes_fiche[1], r"^[0-9A-F]{12}$")

    def test_pdf_nominatif_reste_protege(self):
        session = session_payee()
        verifier_session_payee(session)
        identite = identite_depuis_session(session, "secret-de-test")
        contenu = personnaliser_pdf(
            source_pdf_protegee(),
            identite,
            "secret-de-test",
            session["id"],
        )

        clair = io.BytesIO()
        with pikepdf.open(io.BytesIO(contenu), password="") as pdf:
            self.assertTrue(pdf.is_encrypted)
            self.assertFalse(pdf.owner_password_matched)
            self.assertTrue(pdf.user_password_matched)
            self.assertEqual(len(pdf.pages), 2)
            permissions = pdf.allow
            self.assertFalse(permissions.extract)
            self.assertFalse(permissions.modify_other)
            pdf.save(clair)

        lecteur = PdfReader(clair)
        self.assertEqual(lecteur.metadata["/TJDLicense"], identite.licence)
        self.assertEqual(lecteur.metadata["/TJDFingerprint"], identite.fingerprint)
        texte = "\n".join(page.extract_text() or "" for page in lecteur.pages)
        self.assertIn(identite.licence, texte)
        self.assertIn("jul***@gmail.com", texte)
        self.assertIn("Julien D.", texte)

    def test_generation_r2_est_mise_en_cache_sans_renvoyer_le_pdf_par_vercel(self):
        produit_id = "fiche-da-l2-s1"
        session = session_payee()
        session["metadata"]["produitIds"] = produit_id

        class FauxR2:
            def __init__(self):
                self.objets = {}
                self.puts = 0

            def head_object(self, *, Bucket, Key):
                if (Bucket, Key) not in self.objets:
                    raise ClientError(
                        {"Error": {"Code": "404", "Message": "absent"}},
                        "HeadObject",
                    )
                return {"ContentLength": len(self.objets[(Bucket, Key)]["Body"])}

            def put_object(self, *, Bucket, Key, **parametres):
                self.puts += 1
                self.objets[(Bucket, Key)] = parametres
                return {"ETag": '"test"'}

        client = FauxR2()
        environnement = {
            "R2_ACCOUNT_ID": "compte-test",
            "R2_ACCESS_KEY_ID": "acces-test",
            "R2_SECRET_ACCESS_KEY": "secret-r2-test",
            "R2_BUCKET": "bucket-test",
            "R2_PUBLIC_URL": "https://public.example.com",
        }
        arguments = (
            session["id"],
            "secret-de-test",
            "stripe-test",
            produit_id,
            0,
            SOURCE_PREFIX + "fiche-da-l2-s1.pdf",
            "Fiche complète Droit administratif L2 S1",
            "fiche-da-l2-s1.pdf",
        )
        options = {
            "chargeur_session": lambda *_: session,
            "chargeur_source": lambda *_: source_pdf_protegee(),
            "chargeur_version": lambda *_: "version-test",
            "client_r2": client,
        }
        with patch.dict("os.environ", environnement, clear=False):
            url_1, identite_1, genere_1 = produire_depuis_commande(*arguments, **options)
            url_2, identite_2, genere_2 = produire_depuis_commande(*arguments, **options)

        self.assertTrue(genere_1)
        self.assertFalse(genere_2)
        self.assertEqual(client.puts, 1)
        self.assertEqual(url_1, url_2)
        self.assertEqual(identite_1, identite_2)
        self.assertTrue(url_1.startswith("https://public.example.com/personnalises/v2/"))


if __name__ == "__main__":
    unittest.main()
