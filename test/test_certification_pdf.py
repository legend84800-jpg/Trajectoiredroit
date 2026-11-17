from base64 import b64encode
from datetime import datetime, timedelta, timezone
import io
import unittest
from unittest.mock import Mock, patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from botocore.exceptions import ClientError
import pikepdf
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext
from pypdf import PdfReader

from lib.certification_pdf import certifier_pdf, charger_certificat
from lib.personnalisation_pdf import (
    PRODUIT_PILOTE, _mot_de_passe_proprietaire, identite_depuis_session,
    personnaliser_pdf, produire_depuis_commande,
)
from test_personnalisation_pdf import session_payee, source_pdf_protegee


class CertificationPdfTest(unittest.TestCase):
    def test_certification_detecte_une_page_modifiee_et_conserve_la_lecture(self):
        cle = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        sujet = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Trajectoire Droit Test")])
        maintenant = datetime.now(timezone.utc)
        certificat = (
            x509.CertificateBuilder()
            .subject_name(sujet)
            .issuer_name(sujet)
            .public_key(cle.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(maintenant - timedelta(days=1))
            .not_valid_after(maintenant + timedelta(days=7))
            .add_extension(x509.KeyUsage(
                digital_signature=True, content_commitment=True, key_encipherment=False,
                data_encipherment=False, key_agreement=False, key_cert_sign=False,
                crl_sign=False, encipher_only=False, decipher_only=False,
            ), critical=True)
            .sign(cle, hashes.SHA256())
        )
        code = b"certificat-test-avec-mot-de-passe"
        archive = pkcs12.serialize_key_and_certificates(
            b"Certificat fictif", cle, certificat, None,
            serialization.BestAvailableEncryption(code),
        )
        charger_certificat.cache_clear()
        self.addCleanup(charger_certificat.cache_clear)
        with patch.dict("os.environ", {
            "TJD_CERTIFICAT_PDF_P12": b64encode(archive).decode(),
            "TJD_CERTIFICAT_PDF_CODE": code.decode(),
        }):
            signataire = charger_certificat()
        secret = "secret-d-essai"
        session = session_payee()
        sid = session["id"]
        identite = identite_depuis_session(session, secret)
        original = personnaliser_pdf(
            source_pdf_protegee(interactif=True), identite, secret, sid,
        )
        mot_de_passe = _mot_de_passe_proprietaire(secret, sid)
        signe = certifier_pdf(original, mot_de_passe, signataire)

        with pikepdf.open(io.BytesIO(signe)) as fichier:
            self.assertTrue(fichier.is_encrypted)
            self.assertTrue(fichier.allow.print_highres)
            self.assertFalse(fichier.allow.extract)
            self.assertEqual(len(fichier.pages), 3)
            self.assertEqual(len(fichier.pages[1].obj["/Annots"]), 1)
        pdf = PdfReader(io.BytesIO(signe))
        pdf.decrypt("")
        self.assertEqual(pdf.metadata["/TJDLicense"], identite.licence)
        self.assertEqual(len(pdf.outline), 1)

        def valider(contenu):
            lecteur = PdfFileReader(io.BytesIO(contenu))
            lecteur.decrypt("")
            return validate_pdf_signature(
                lecteur.embedded_signatures[0],
                signer_validation_context=ValidationContext(
                    trust_roots=[signataire.signing_cert], allow_fetching=False,
                ),
            )

        self.assertTrue(valider(signe).bottom_line)
        stockage = Mock()
        stockage.head_object.side_effect = ClientError(
            {"Error": {"Code": "404", "Message": "absent"}}, "HeadObject",
        )
        with patch.dict("os.environ", {"R2_PERSONNALISES_BUCKET": "copies-test"}):
            produire_depuis_commande(
                sid, secret, "stripe-test", PRODUIT_PILOTE, 0, "r2://tjd/essai.pdf",
                "Cours fictif", "essai.pdf", chargeur_session=lambda *_: session,
                chargeur_source=lambda _: source_pdf_protegee(),
                chargeur_version=lambda _: "version-test", client_r2=stockage,
            )
        self.assertTrue(valider(stockage.put_object.call_args.kwargs["Body"]).bottom_line)
        ecriture = IncrementalPdfFileWriter(io.BytesIO(signe))
        ecriture.encrypt(mot_de_passe)
        page = ecriture.find_page_for_modification(1)[0]
        page.get_object()[generic.pdf_name("/Rotate")] = generic.NumberObject(180)
        ecriture.mark_update(page)
        modifie = io.BytesIO()
        ecriture.write(modifie)
        self.assertFalse(valider(modifie.getvalue()).bottom_line)


if __name__ == "__main__":
    unittest.main()
