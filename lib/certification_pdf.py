from base64 import b64decode
from functools import lru_cache
import io
import os


@lru_cache(maxsize=1)
def charger_certificat():
    archive = os.environ.get("TJD_CERTIFICAT_PDF_P12", "").strip()
    if not archive:
        return None

    from pyhanko.sign.signers import SimpleSigner

    code = os.environ.get("TJD_CERTIFICAT_PDF_CODE", "").encode()
    signataire = SimpleSigner.load_pkcs12_data(
        b64decode(archive, validate=True), other_certs=(), passphrase=code or None,
    )
    if signataire is None:
        raise RuntimeError("Le certificat de signature PDF ne peut pas être chargé.")
    return signataire


def certifier_pdf(contenu: bytes, mot_de_passe: str, signataire) -> bytes:
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import fields, signers

    writer = IncrementalPdfFileWriter(io.BytesIO(contenu))
    writer.encrypt(mot_de_passe)
    sortie = io.BytesIO()
    signers.sign_pdf(
        writer,
        signers.PdfSignatureMetadata(
            field_name="CertificationTrajectoireDroit",
            certify=True,
            subfilter=fields.SigSeedSubFilter.PADES,
            docmdp_permissions=fields.MDPPerm.NO_CHANGES,
        ),
        signer=signataire,
        new_field_spec=fields.SigFieldSpec("CertificationTrajectoireDroit"),
        output=sortie,
    )
    return sortie.getvalue()
