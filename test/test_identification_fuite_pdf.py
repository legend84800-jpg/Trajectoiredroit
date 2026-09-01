import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

import pikepdf
from reportlab.pdfgen import canvas

from lib.identification_fuite_pdf import analyser_pdf
from lib.personnalisation_pdf import (
    PRODUIT_PILOTE,
    identite_depuis_session,
    personnaliser_pdf,
)

SECRET = "secret-forensic-de-test"


def charger_client_local():
    chemin = Path(__file__).resolve().parents[1] / "scripts" / "identifier-fuite-pdf.py"
    specification = importlib.util.spec_from_file_location("client_fuite_test", chemin)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def session_payee(session_id: str = "cs_test_forensic_1") -> dict:
    return {
        "id": session_id,
        "mode": "payment",
        "payment_status": "paid",
        "created": 1_800_000_000,
        "metadata": {"produitIds": PRODUIT_PILOTE},
        "customer_details": {
            "email": "julien.test@example.com",
            "name": "Nom de carte",
        },
        "custom_fields": [
            {
                "key": "nomlicence",
                "type": "text",
                "text": {"value": "Julien Dupont"},
            }
        ],
    }


def source_pdf_protegee(pages: int = 5) -> bytes:
    claire = io.BytesIO()
    dessin = canvas.Canvas(claire, pagesize=(595.28, 841.89))
    for index in range(pages):
        dessin.drawString(72, 760, f"Page source de test {index + 1}")
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


def ecrire_pdf_personnalise(
    chemin: Path,
    session: dict,
    produit_id: str = PRODUIT_PILOTE,
    blob_index: int = 0,
) -> None:
    identite = identite_depuis_session(session, SECRET, produit_id, blob_index)
    chemin.write_bytes(
        personnaliser_pdf(
            source_pdf_protegee(),
            identite,
            SECRET,
            session["id"],
            produit_id=produit_id,
            blob_index=blob_index,
            nom_produit="Produit généralisé de test",
            nom_fichier="produit-test.pdf",
        )
    )


def aplatir_pdf(source: Path, destination: Path, dpi: int = 200) -> None:
    import pymupdf

    original = pymupdf.open(source)
    aplati = pymupdf.open()
    echelle = dpi / 72.0
    try:
        for page in original:
            image = page.get_pixmap(
                matrix=pymupdf.Matrix(echelle, echelle),
                alpha=False,
            )
            nouvelle = aplati.new_page(width=page.rect.width, height=page.rect.height)
            nouvelle.insert_image(nouvelle.rect, stream=image.tobytes("png"))
        aplati.save(destination, garbage=4, deflate=True)
    finally:
        aplati.close()
        original.close()


def retirer_metadonnees(source: Path, destination: Path) -> None:
    with pikepdf.open(source, password="") as pdf:
        for cle in list(pdf.docinfo.keys()):
            del pdf.docinfo[cle]
        for cle in ("/Metadata", "/TJDLicense", "/TJDFingerprint", "/TJDProtectionVersion"):
            if cle in pdf.Root:
                del pdf.Root[cle]
        pdf.save(destination)


def masquer_zone(
    source: Path,
    destination: Path,
    *,
    pied_de_page: bool = False,
    licence_visible: bool = False,
) -> None:
    import pymupdf

    document = pymupdf.open(source)
    try:
        if licence_visible and len(document):
            document.delete_page(0)
        for page in document:
            if pied_de_page:
                page.add_redact_annot(
                    pymupdf.Rect(0, page.rect.height - 65, page.rect.width, page.rect.height),
                    fill=(1, 1, 1),
                )
            if licence_visible:
                page.add_redact_annot(
                    pymupdf.Rect(245, page.rect.height - 32, page.rect.width, page.rect.height),
                    fill=(1, 1, 1),
                )
            page.apply_redactions()
        document.save(destination, garbage=4, deflate=True)
    finally:
        document.close()


class IdentificationFuitePdfTest(unittest.TestCase):
    def test_rapport_local_refuse_une_correspondance_absente_du_pdf(self):
        client = charger_client_local()
        analyse = {
            "fichier": "/tmp/copie.pdf",
            "sha256": "a" * 64,
            "fingerprints": {
                "123456789A": {
                    "couches": ["micro_marqueurs"],
                    "occurrences_visuelles": 3,
                }
            },
            "licences": [],
        }
        retour = {
            "schema": "tjd-correspondance-fuite-v1",
            "licence": "TD-PEN-S1-12345678",
            "fingerprint": "123456789A",
            "commande": {
                "session_stripe": "cs_test_rapport_local",
                "paiement": "paid",
                "produits": [PRODUIT_PILOTE],
                "montant_euros": 14.99,
                "date": "2026-08-31T12:00:00Z",
            },
            "titulaire": {
                "nom": "Julien Dupont",
                "nom_affiche_pdf": "Julien D.",
                "email": "julien.test@example.com",
            },
        }
        rapport = client.construire_rapport_service(analyse, retour)
        self.assertEqual(rapport["statut"], "identification_confirmee")

        retour_incoherent = dict(retour, fingerprint="0000000000")
        with self.assertRaises(PermissionError):
            client.construire_rapport_service(analyse, retour_incoherent)

    def test_structure_et_achat_retrouvent_la_commande(self):
        session = session_payee()
        identite = identite_depuis_session(session, SECRET)
        with tempfile.TemporaryDirectory() as dossier:
            pdf = Path(dossier) / "copie.pdf"
            ecrire_pdf_personnalise(pdf, session)
            analyse = analyser_pdf(pdf, pages_max=4)

        self.assertIn(identite.fingerprint, analyse["fingerprints"])
        self.assertIn(identite.licence, analyse["licences"])
        preuve = analyse["fingerprints"][identite.fingerprint]
        self.assertTrue(set(preuve["couches"]) - {"micro_marqueurs"})

    def test_aplatissement_reste_identifiable_par_les_micro_marqueurs(self):
        session = session_payee("cs_test_forensic_aplati")
        identite = identite_depuis_session(session, SECRET)
        with tempfile.TemporaryDirectory() as dossier:
            original = Path(dossier) / "original.pdf"
            aplati = Path(dossier) / "aplati.pdf"
            ecrire_pdf_personnalise(original, session)
            aplatir_pdf(original, aplati)
            analyse = analyser_pdf(aplati, pages_max=6)

        preuve = analyse["fingerprints"][identite.fingerprint]
        self.assertGreaterEqual(preuve["occurrences_visuelles"], 2)
        self.assertEqual(preuve["couches"], ["micro_marqueurs"])

    def test_fingerprint_generalise_sur_douze_chiffres_resiste_a_aplatissement(self):
        produit_id = "fiche-da-l2-s1"
        session = session_payee("cs_test_forensic_generalise")
        session["metadata"]["produitIds"] = produit_id
        identite = identite_depuis_session(session, SECRET, produit_id, 0)
        with tempfile.TemporaryDirectory() as dossier:
            original = Path(dossier) / "original-generalise.pdf"
            aplati = Path(dossier) / "aplati-generalise.pdf"
            ecrire_pdf_personnalise(original, session, produit_id, 0)
            aplatir_pdf(original, aplati)
            analyse = analyser_pdf(aplati, pages_max=6)

        self.assertEqual(len(identite.fingerprint), 12)
        preuve = analyse["fingerprints"][identite.fingerprint]
        self.assertGreaterEqual(preuve["occurrences_visuelles"], 2)
        self.assertEqual(preuve["couches"], ["micro_marqueurs"])

    def test_six_variantes_attaque_retrouvent_la_meme_commande(self):
        session = session_payee("cs_test_forensic_six_attaques")
        identite = identite_depuis_session(session, SECRET)
        with tempfile.TemporaryDirectory() as dossier:
            racine = Path(dossier)
            original = racine / "original.pdf"
            sans_metadonnees = racine / "sans-metadonnees.pdf"
            sans_pied = racine / "sans-pied.pdf"
            sans_licence = racine / "sans-licence-visible.pdf"
            aplati = racine / "aplati.pdf"
            sans_licence_aplati = racine / "sans-licence-visible-aplati.pdf"

            ecrire_pdf_personnalise(original, session)
            retirer_metadonnees(original, sans_metadonnees)
            masquer_zone(original, sans_pied, pied_de_page=True)
            masquer_zone(original, sans_licence, licence_visible=True)
            aplatir_pdf(original, aplati)
            aplatir_pdf(sans_licence, sans_licence_aplati)

            variantes = (
                original,
                sans_metadonnees,
                sans_pied,
                sans_licence,
                aplati,
                sans_licence_aplati,
            )
            for variante in variantes:
                with self.subTest(variante=variante.name):
                    analyse = analyser_pdf(variante, pages_max=6)
                    self.assertIn(identite.fingerprint, analyse["fingerprints"])
                    preuve = analyse["fingerprints"][identite.fingerprint]
                    preuve_directe = bool(
                        set(preuve["couches"]) - {"micro_marqueurs"}
                    )
                    self.assertTrue(
                        preuve_directe or preuve["occurrences_visuelles"] >= 2
                    )

    def test_pdf_generique_ne_peut_pas_accuser_un_acheteur(self):
        with tempfile.TemporaryDirectory() as dossier:
            pdf = Path(dossier) / "generique.pdf"
            pdf.write_bytes(source_pdf_protegee())
            analyse = analyser_pdf(pdf, pages_max=3)

        identite = identite_depuis_session(session_payee(), SECRET)
        self.assertNotIn(identite.fingerprint, analyse["fingerprints"])


if __name__ == "__main__":
    unittest.main()
