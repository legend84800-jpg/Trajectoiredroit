import io
import unittest

import pikepdf
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from lib.personnalisation_pdf import (
    PRODUIT_PILOTE,
    generer_signature,
    identite_depuis_session,
    personnaliser_pdf,
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
        signature = generer_signature(
            PRODUIT_PILOTE,
            0,
            expiration,
            secret,
            "cs_test_pdf_personnalise_1",
        )
        verifier_signature(
            PRODUIT_PILOTE,
            0,
            expiration,
            signature,
            secret,
            "cs_test_pdf_personnalise_1",
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
                maintenant=1_900_000_000,
            )

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


if __name__ == "__main__":
    unittest.main()
