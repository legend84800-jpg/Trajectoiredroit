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
    SOURCE_PRIVEE_PREFIX,
    cle_source_pdf,
    codes_licence_depuis_session,
    generer_signature_personnalisation,
    identite_depuis_session,
    lien_media_prive,
    personnaliser_pdf,
    produire_depuis_commande,
    verifier_session_payee,
    verifier_signature,
)


def source_pdf_protegee(*, interactif: bool = False) -> bytes:
    claire = io.BytesIO()
    dessin = canvas.Canvas(claire, pagesize=(595.28, 841.89))
    if interactif:
        dessin.drawString(72, 760, "SOMMAIRE CLIQUABLE")
        dessin.linkRect("Ouvrir le chapitre", "chapitre", (72, 700, 300, 725))
        dessin.showPage()
        dessin.bookmarkPage("chapitre")
        dessin.addOutlineEntry("Chapitre 1. Exemple", "chapitre")
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
    def test_commande_gratuite_terminee_accepte_le_pdf(self):
        for montant in (0, 0.0):
            with self.subTest(montant=montant):
                session = dict(
                    session_payee(),
                    status="complete",
                    payment_status="no_payment_required",
                    amount_total=montant,
                )
                verifier_session_payee(session)

    def test_commande_gratuite_incomplete_ou_invalide_est_refusee(self):
        complete = dict(
            session_payee(),
            status="complete",
            payment_status="no_payment_required",
            amount_total=0,
        )
        valeurs_refusees = (
            {"payment_status": "unpaid"},
            {"payment_status": None},
            {"status": "open"},
            {"status": "expired"},
            {"status": None},
            {"amount_total": 499},
            {"amount_total": -1},
            {"amount_total": "0"},
            {"amount_total": None},
            {"amount_total": False},
            {"mode": "subscription"},
            {
                "mode": "subscription",
                "metadata": {"produitIds": PRODUIT_PILOTE, "echeances": "3"},
            },
            {"mode": "setup"},
            {"mode": None},
        )
        for surcharge in valeurs_refusees:
            with self.subTest(surcharge=surcharge):
                with self.assertRaises(PermissionError):
                    verifier_session_payee(dict(complete, **surcharge))
        for champ in ("mode", "status", "payment_status", "amount_total"):
            with self.subTest(champ_absent=champ):
                session = dict(complete)
                del session[champ]
                with self.assertRaises(PermissionError):
                    verifier_session_payee(session)

    def test_produit_absent_refuse_pour_commande_payee_ou_gratuite(self):
        payee = session_payee()
        gratuite = dict(
            payee,
            status="complete",
            payment_status="no_payment_required",
            amount_total=0,
        )
        for session in (payee, gratuite):
            with self.subTest(statut=session["payment_status"]):
                with self.assertRaises(PermissionError):
                    verifier_session_payee(session, "produit-absent")

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

    def test_reference_pdf_privee_et_compatibilite_des_liens_en_cours(self):
        reference = SOURCE_PRIVEE_PREFIX + "fiche-da-l2-s1.pdf"
        ancienne = SOURCE_PREFIX + "fiche-da-l2-s1.pdf"
        self.assertEqual(cle_source_pdf(reference), "sources/tjd/fiche-da-l2-s1.pdf")
        self.assertEqual(cle_source_pdf(ancienne), cle_source_pdf(reference))
        with self.assertRaises(ValueError):
            cle_source_pdf(SOURCE_PRIVEE_PREFIX + "../autre.pdf")

        arguments = ("fiche-da-l2-s1", 0, 2_000_000_000, "", reference, "Fiche", "fiche-da-l2-s1.pdf")
        signature = generer_signature_personnalisation(*arguments, "secret-de-test")
        verifier_signature(
            *arguments[:3], signature, "secret-de-test", *arguments[3:], maintenant=1_900_000_000,
        )
        with self.assertRaises(PermissionError):
            verifier_signature(
                *arguments[:3], "signature-incorrecte", "secret-de-test",
                *arguments[3:], maintenant=1_900_000_000,
            )

    def test_media_prive_signe_pour_un_indice_de_pack(self):
        reference = SOURCE_PRIVEE_PREFIX + "av/matiere/U01-video.mp4"
        arguments = ("pack-ultra-test", 309, 2_000_000_000, "cs_test_pack", reference, "Pack", "U01-video.mp4")
        signature = generer_signature_personnalisation(*arguments, "secret-de-test")
        verifier_signature(
            *arguments[:3], signature, "secret-de-test", *arguments[3:], maintenant=1_900_000_000,
        )

    @patch("lib.personnalisation_pdf._bucket_prive", return_value="stockage-prive")
    @patch("lib.personnalisation_pdf._client_r2")
    @patch("lib.personnalisation_pdf.time.time", return_value=1_900_000_000)
    def test_liens_media_limites_par_la_duree_de_lecture_et_du_lien(self, _time, client, _bucket):
        for nom, maximum in (("video.mp4", 6 * 3600), ("podcast.m4a", 6 * 3600), ("anki.apkg", 900)):
            with self.subTest(format=nom):
                reference = SOURCE_PRIVEE_PREFIX + "matiere/" + nom
                for duree in (60, maximum + 100):
                    lien_media_prive(reference, 1_900_000_000 + duree)
                    disposition = f'attachment; filename="{nom}"' if nom.endswith(".apkg") else "inline"
                    client.return_value.generate_presigned_url.assert_called_with(
                        "get_object",
                        Params={
                            "Bucket": "stockage-prive",
                            "Key": "sources/tjd/matiere/" + nom,
                            "ResponseCacheControl": "private, no-store",
                            "ResponseContentDisposition": disposition,
                        },
                        ExpiresIn=min(duree, maximum),
                    )
        with self.assertRaises(PermissionError):
            lien_media_prive(reference, 1_900_000_000)

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
        self.assertIn("julien.test@gmail.com", texte)
        self.assertIn("Julien Dupont", texte)
        # Le tampon en marge des pages de contenu porte le nom, jamais l'email.
        tampon = lecteur.pages[1].extract_text() or ""
        self.assertIn(f"Licence {identite.licence}", tampon)
        self.assertIn("Julien Dupont", tampon)
        self.assertNotIn("julien.test@gmail.com", tampon)

    def test_tampon_marge_reste_dans_la_page_avec_un_nom_tres_long(self):
        session = session_payee()
        session["custom_fields"][0]["text"]["value"] = (
            "Marie-Charlotte de La Rochefoucauld-Montmorency Saint-Aignan"
        )
        identite = identite_depuis_session(session, "secret-de-test")
        contenu = personnaliser_pdf(
            source_pdf_protegee(),
            identite,
            "secret-de-test",
            session["id"],
        )
        clair = io.BytesIO()
        with pikepdf.open(io.BytesIO(contenu), password="") as pdf:
            pdf.save(clair)
        tampon = PdfReader(clair).pages[1].extract_text() or ""
        self.assertIn("Saint-Aignan", tampon)
        self.assertIn("copie individuelle", tampon)

    def test_sommaire_et_signets_survivent_a_la_personnalisation(self):
        session = session_payee()
        identite = identite_depuis_session(session, "secret-de-test")
        contenu = personnaliser_pdf(
            source_pdf_protegee(interactif=True),
            identite,
            "secret-de-test",
            session["id"],
        )
        clair = io.BytesIO()
        with pikepdf.open(io.BytesIO(contenu), password="") as pdf:
            pdf.save(clair)
        lecteur = PdfReader(clair)
        self.assertEqual(len(lecteur.pages), 3)
        self.assertEqual(len(lecteur.outline), 1)
        self.assertEqual(lecteur.get_destination_page_number(lecteur.outline[0]), 2)
        lien = lecteur.pages[1]["/Annots"][0].get_object()
        destination = lien.get("/Dest") or lien["/A"]["/D"]
        self.assertEqual(destination[0].idnum,
                         lecteur.pages[2].indirect_reference.idnum)

    def test_chaque_telechargement_signe_la_meme_copie_dans_le_stockage_prive(self):
        produit_id = "fiche-da-l2-s1"
        session = session_payee()
        session["metadata"]["produitIds"] = produit_id

        class FauxR2:
            def __init__(self):
                self.objets = {}
                self.puts = 0
                self.signatures = []

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

            def generate_presigned_url(self, operation, *, Params, ExpiresIn):
                self.signatures.append((operation, Params, ExpiresIn))
                return f"https://r2.example.com/{Params['Bucket']}/{Params['Key']}?sig={len(self.signatures)}"

        client = FauxR2()
        environnement = {
            "R2_ACCOUNT_ID": "compte-test",
            "R2_ACCESS_KEY_ID": "acces-test",
            "R2_SECRET_ACCESS_KEY": "secret-r2-test",
            "R2_BUCKET": "catalogue-test",
            "R2_PERSONNALISES_BUCKET": "copies-test",
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
        self.assertEqual(identite_1, identite_2)
        [(bucket, cle)] = client.objets
        self.assertEqual(bucket, "copies-test")
        self.assertTrue(cle.startswith(f"personnalises/v3/{produit_id}/"))
        self.assertTrue(url_1.startswith(f"https://r2.example.com/{bucket}/{cle}?"))
        self.assertTrue(url_2.startswith(f"https://r2.example.com/{bucket}/{cle}?"))
        self.assertNotEqual(url_1, url_2)
        self.assertEqual(client.signatures, [("get_object", {"Bucket": bucket, "Key": cle}, 900)] * 2)
        self.assertEqual(client.objets[(bucket, cle)]["ContentType"], "application/pdf")
        self.assertEqual(
            client.objets[(bucket, cle)]["ContentDisposition"],
            f'attachment; filename="fiche-da-l2-s1-{identite_1.licence.lower()}.pdf"',
        )

        environnement["R2_PERSONNALISES_BUCKET"] = environnement["R2_BUCKET"]
        with patch.dict("os.environ", environnement), self.assertRaises(RuntimeError):
            produire_depuis_commande(*arguments, **options)
        self.assertEqual(client.puts, 1)


if __name__ == "__main__":
    unittest.main()
