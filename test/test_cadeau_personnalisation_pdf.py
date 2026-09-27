"""Pack Ultra offert (27/09/2026) : la licence des PDF suit l'étudiant, pas le parent."""

import hashlib
import unittest

from lib.personnalisation_pdf import identite_depuis_session, verifier_session_payee


def session(**surcharges):
    base = {
        "id": "cs_test_cadeau_pdf",
        "mode": "payment",
        "payment_status": "paid",
        "metadata": {
            "produitIds": "pack-ultra-l1-s1",
            "cadeauEmail": "lea.martin@example.com",
            "cadeauPrenom": "Léa",
        },
        "customer_details": {"email": "parent@example.com", "name": "Marie Dupont"},
    }
    base.update(surcharges)
    return base


class CadeauPersonnalisationTest(unittest.TestCase):
    def test_licence_au_nom_et_a_l_email_de_l_etudiant(self):
        identite = identite_depuis_session(session(), "secret", "pack-ultra-l1-s1", 0)
        self.assertEqual(identite.nom_affiche, "Léa")
        self.assertEqual(identite.email_masque, "lea***@example.com")
        self.assertEqual(
            identite.email_hash,
            hashlib.sha256(b"lea.martin@example.com").hexdigest(),
        )

    def test_sans_prenom_le_nom_vient_de_l_email_de_l_etudiant(self):
        s = session(metadata={"produitIds": "pack-ultra-l1-s1", "cadeauEmail": "lea.martin@example.com"})
        identite = identite_depuis_session(s, "secret", "pack-ultra-l1-s1", 0)
        self.assertEqual(identite.nom_affiche, "Lea M.")

    def test_sans_cadeau_la_licence_reste_celle_de_l_acheteur(self):
        s = session(metadata={"produitIds": "pack-ultra-l1-s1"})
        identite = identite_depuis_session(s, "secret", "pack-ultra-l1-s1", 0)
        self.assertEqual(identite.email_masque, "par***@example.com")
        self.assertEqual(identite.nom_affiche, "Marie D.")

    def test_paiement_en_plusieurs_fois_accepte_seulement_avec_echeances(self):
        en_trois = session(
            mode="subscription",
            metadata={"produitIds": "pack-ultra-l1-s1", "echeances": "3"},
        )
        verifier_session_payee(en_trois, "pack-ultra-l1-s1")
        portalis = session(mode="subscription", metadata={"produitIds": "pack-ultra-l1-s1"})
        with self.assertRaises(PermissionError):
            verifier_session_payee(portalis, "pack-ultra-l1-s1")
        with self.assertRaises(PermissionError):
            verifier_session_payee(dict(en_trois, payment_status="unpaid"), "pack-ultra-l1-s1")


if __name__ == "__main__":
    unittest.main()
