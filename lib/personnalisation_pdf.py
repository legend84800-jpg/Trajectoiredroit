"""Génération à la demande d'un PDF nominatif Trajectoire Droit.

Le PDF public protégé sert de source. La fonction le déchiffre en mémoire,
ajoute la page de licence et plusieurs marqueurs redondants, puis protège la
copie finale avec un mot de passe propriétaire propre à la commande.
"""

from __future__ import annotations

import hashlib
import hmac
import io
import json
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

import pikepdf
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject, TextStringObject
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


PRODUIT_PILOTE = "maj-penal-l2-s1"
SOURCE_PILOTE = (
    "https://pub-45b53167be7548aca62650d34a771b47.r2.dev/"
    "tjd/maj-penal-l2-s1.pdf"
)
VERSION_PROTECTION = "tjd-acheteur-1"
STRIPE_API_VERSION = "2026-07-29.dahlia"
TAILLE_SOURCE_MAX = 15 * 1024 * 1024

NAVY = HexColor("#0E2A47")
BORDEAUX = HexColor("#A52E3B")
GOLD = HexColor("#C49A4A")
INK = HexColor("#222222")
GREY = HexColor("#6E7781")
PALE = HexColor("#F4F1EA")
MICRO = HexColor("#D5D9DD")

SITE_URL = "https://trajectoiredroit.com"
YOUTUBE_URL = "https://www.youtube.com/@TrajectoireDroit"
TIKTOK_URL = "https://www.tiktok.com/@trajectoiredroit"


@dataclass(frozen=True)
class IdentiteLicence:
    licence: str
    fingerprint: str
    nom_affiche: str
    email_masque: str
    email_hash: str


def _hmac_hex(secret: str, message: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def generer_signature(
    produit_id: str,
    blob_index: int,
    expiration: int,
    secret: str,
    session_id: str = "",
) -> str:
    morceaux = [produit_id, str(blob_index), str(expiration)]
    if session_id:
        morceaux.append(session_id)
    return _hmac_hex(secret, "|".join(morceaux))


def verifier_signature(
    produit_id: str,
    blob_index: int,
    expiration: int,
    signature: str,
    secret: str,
    session_id: str,
    maintenant: int | None = None,
) -> None:
    if produit_id != PRODUIT_PILOTE or blob_index != 0:
        raise ValueError("Produit non pris en charge")
    if not session_id.startswith("cs_") or len(session_id) > 255:
        raise ValueError("Commande invalide")
    horodatage = int(time.time()) if maintenant is None else maintenant
    if expiration < horodatage:
        raise PermissionError("Lien expiré")
    attendu = generer_signature(
        produit_id,
        blob_index,
        expiration,
        secret,
        session_id,
    )
    if not hmac.compare_digest(attendu, signature.lower()):
        raise PermissionError("Signature invalide")


def _nettoyer_texte(valeur: object, maximum: int = 120) -> str:
    texte = re.sub(r"[\x00-\x1f\x7f]+", " ", str(valeur or ""))
    return re.sub(r"\s+", " ", texte).strip()[:maximum]


def _champ_nom(session: dict) -> str:
    for champ in session.get("custom_fields") or []:
        if champ.get("key") != "nomlicence":
            continue
        valeur = (champ.get("text") or {}).get("value")
        if valeur:
            return _nettoyer_texte(valeur)
    details = session.get("customer_details") or {}
    return _nettoyer_texte(details.get("name"))


def _nom_depuis_email(email: str) -> str:
    local = email.split("@", 1)[0]
    mots = [mot for mot in re.split(r"[._+\-]+", local) if mot]
    return " ".join(mot[:1].upper() + mot[1:].lower() for mot in mots[:2]) or "Titulaire"


def abreger_nom(nom: str, email: str) -> str:
    propre = _nettoyer_texte(nom) or _nom_depuis_email(email)
    morceaux = propre.split()
    if len(morceaux) < 2:
        return propre
    return f"{morceaux[0]} {morceaux[-1][0].upper()}."


def masquer_email(email: str) -> str:
    local, separateur, domaine = email.strip().partition("@")
    if not separateur or not local or not domaine:
        raise ValueError("Adresse email invalide")
    visible = local[: min(3, len(local))]
    return f"{visible}***@{domaine.lower()}"


def identite_depuis_session(session: dict, secret: str) -> IdentiteLicence:
    details = session.get("customer_details") or {}
    email = _nettoyer_texte(details.get("email"), 200).lower()
    if "@" not in email:
        raise ValueError("Adresse email Stripe manquante")
    session_id = _nettoyer_texte(session.get("id"), 255)
    empreinte = _hmac_hex(secret, f"licence|{PRODUIT_PILOTE}|{session_id}").upper()
    return IdentiteLicence(
        licence=f"TD-PEN-S1-{empreinte[:8]}",
        fingerprint=empreinte[8:18],
        nom_affiche=abreger_nom(_champ_nom(session), email),
        email_masque=masquer_email(email),
        email_hash=hashlib.sha256(email.encode("utf-8")).hexdigest(),
    )


def verifier_session_payee(session: dict) -> None:
    if session.get("mode") != "payment" or session.get("payment_status") != "paid":
        raise PermissionError("Paiement non confirmé")
    produit_ids = ((session.get("metadata") or {}).get("produitIds") or "").split(",")
    if PRODUIT_PILOTE not in [produit.strip() for produit in produit_ids]:
        raise PermissionError("Produit absent de la commande")


def recuperer_session_stripe(session_id: str, cle_stripe: str) -> dict:
    url = "https://api.stripe.com/v1/checkout/sessions/" + urllib.parse.quote(session_id, safe="")
    requete = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {cle_stripe}",
            "Stripe-Version": STRIPE_API_VERSION,
            "User-Agent": "TrajectoireDroit-PDF/1.0",
        },
    )
    with urllib.request.urlopen(requete, timeout=15) as reponse:
        return json.loads(reponse.read().decode("utf-8"))


def telecharger_source(url: str = SOURCE_PILOTE) -> bytes:
    requete = urllib.request.Request(url, headers={"User-Agent": "TrajectoireDroit-PDF/1.0"})
    with urllib.request.urlopen(requete, timeout=20) as reponse:
        contenu = reponse.read(TAILLE_SOURCE_MAX + 1)
    if len(contenu) > TAILLE_SOURCE_MAX or not contenu.startswith(b"%PDF-"):
        raise ValueError("Source PDF invalide")
    return contenu


def _dechiffrer_source(source: bytes) -> bytes:
    entree = io.BytesIO(source)
    sortie = io.BytesIO()
    with pikepdf.open(entree, password="") as pdf:
        pdf.save(sortie)
    return sortie.getvalue()


def _paragraphe(
    c: canvas.Canvas,
    texte: str,
    x: float,
    y_haut: float,
    largeur: float,
    style: ParagraphStyle,
) -> float:
    bloc = Paragraph(texte, style)
    _, hauteur = bloc.wrap(largeur, 500)
    bloc.drawOn(c, x, y_haut - hauteur)
    return y_haut - hauteur


def _dessiner_licence_visible(
    c: canvas.Canvas,
    identite: IdentiteLicence,
    *,
    x: float = 143.0,
    y: float = 31.0,
    couleur: object = GREY,
) -> None:
    c.saveState()
    c.setFillColor(GOLD)
    c.rect(x - 11, y + 1.0, 7, 0.8, stroke=0, fill=1)
    c.setFillColor(couleur)
    c.setFont("Helvetica", 6.4)
    c.drawString(x, y, f"Licence {identite.licence}  ·  {identite.email_masque}  ·  copie individuelle")
    c.restoreState()


def _dessiner_texte_structurel(
    c: canvas.Canvas,
    identite: IdentiteLicence,
    page_index: int,
) -> None:
    texte = c.beginText()
    texte.setTextOrigin(1.0, 1.0)
    texte.setFont("Helvetica", 0.5)
    texte.setTextRenderMode(3)
    texte.textOut(
        f"TJD-FP:{identite.fingerprint};LIC:{identite.licence};PAGE:{page_index}"
    )
    c.drawText(texte)


def _bits_fingerprint(fingerprint: str) -> list[int]:
    return [int(bit) for chiffre in fingerprint for bit in f"{int(chiffre, 16):04b}"]


def _dessiner_micro_marqueurs(
    c: canvas.Canvas,
    largeur: float,
    hauteur: float,
    fingerprint: str,
    *,
    haut: bool,
) -> None:
    bits = _bits_fingerprint(fingerprint)
    rayon = 0.25
    decalage = 2.6
    c.saveState()
    c.setFillColor(MICRO)
    c.setStrokeColor(MICRO)
    if haut:
        for index, bit in enumerate(bits):
            x = 64 + index * ((largeur - 128) / 39)
            y = hauteur - (4.5 + decalage * bit)
            c.circle(x, y, rayon, stroke=0, fill=1)
    pas_vertical = (hauteur - 140) / 39
    for index, bit in enumerate(bits):
        y = 70 + index * pas_vertical
        for base_x, direction in (
            (4.5, 1),
            (52.0, 1),
            (largeur - 4.5, -1),
            (largeur - 52.0, -1),
        ):
            c.circle(base_x + direction * decalage * bit, y, rayon, stroke=0, fill=1)
    c.restoreState()


def _dessiner_reseaux(c: canvas.Canvas, x: float, y: float, largeur: float = 180.0) -> None:
    lignes = (
        ("SITE", "trajectoiredroit.com", SITE_URL),
        ("YOUTUBE", "@TrajectoireDroit", YOUTUBE_URL),
        ("TIKTOK", "@trajectoiredroit", TIKTOK_URL),
    )
    hauteur_ligne = 24.0
    hauteur = hauteur_ligne * len(lignes) + 12.0
    c.saveState()
    c.setFillColor(white)
    c.setStrokeColor(HexColor("#D8DDE2"))
    c.roundRect(x, y, largeur, hauteur, 7, stroke=1, fill=1)
    for index, (reseau, compte, url) in enumerate(lignes):
        ligne_y = y + hauteur - 21 - index * hauteur_ligne
        if index:
            c.setStrokeColor(HexColor("#E6E9EC"))
            c.line(x + 8, ligne_y + 10, x + largeur - 8, ligne_y + 10)
        c.setFillColor(BORDEAUX)
        c.setFont("Helvetica-Bold", 6.4)
        c.drawString(x + 10, ligne_y, reseau)
        c.setFillColor(NAVY)
        c.setFont("Helvetica", 8.0)
        c.drawRightString(x + largeur - 10, ligne_y, compte)
        c.linkURL(url, (x + 6, ligne_y - 5, x + largeur - 6, ligne_y + 10), relative=0)
    c.restoreState()


def _page_licence(identite: IdentiteLicence) -> bytes:
    tampon = io.BytesIO()
    c = canvas.Canvas(tampon, pagesize=A4)
    largeur, hauteur = A4

    c.setFillColor(NAVY)
    c.rect(0, hauteur - 245, largeur, 245, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, hauteur - 248, largeur, 3, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(54, hauteur - 53, "TRAJECTOIRE DROIT ÉDITIONS")

    titre = ParagraphStyle(
        "titre",
        fontName="Times-Bold",
        fontSize=27,
        leading=31,
        textColor=white,
        alignment=TA_LEFT,
    )
    y = _paragraphe(c, "MAJEURES PRÉPARÉES", 54, hauteur - 90, largeur - 108, titre)
    c.setFillColor(white)
    c.setFont("Times-Roman", 15)
    c.drawString(54, y - 21, "Droit pénal général · L2 S1")
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(54, y - 45, "ÉDITION 2026")

    style_titre = ParagraphStyle(
        "intertitre",
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=14,
        textColor=BORDEAUX,
        alignment=TA_LEFT,
    )
    style_corps = ParagraphStyle(
        "corps",
        fontName="Times-Roman",
        fontSize=10.5,
        leading=15.5,
        textColor=INK,
        alignment=TA_LEFT,
    )
    style_centre = ParagraphStyle(
        "centre",
        parent=style_corps,
        fontSize=9.5,
        leading=14,
        textColor=GREY,
        alignment=TA_CENTER,
    )

    y = hauteur - 286
    y = _paragraphe(c, "PUBLICATION NUMÉRIQUE COMMERCIALE", 54, y, largeur - 108, style_titre)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.line(54, y - 7, largeur - 54, y - 7)

    haut_carte = y - 27
    hauteur_carte = 116
    c.setFillColor(PALE)
    c.roundRect(54, haut_carte - hauteur_carte, largeur - 108, hauteur_carte, 7, stroke=0, fill=1)
    etiquettes = ("LICENCE INDIVIDUELLE", "COPIE DÉLIVRÉE À", "ADRESSE ASSOCIÉE")
    valeurs = (identite.licence, identite.nom_affiche, identite.email_masque)
    ligne_y = haut_carte - 27
    for etiquette, valeur in zip(etiquettes, valeurs):
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(72, ligne_y, etiquette)
        c.setFillColor(INK)
        c.setFont("Times-Roman", 11)
        c.drawString(225, ligne_y, valeur)
        ligne_y -= 32

    y = haut_carte - hauteur_carte - 33
    y = _paragraphe(
        c,
        "<b>Cette copie est délivrée sous une licence individuelle.</b> Elle est réservée au travail "
        "personnel de son titulaire. La licence autorise sa consultation, son annotation et son "
        "impression pour cet usage personnel.",
        54,
        y,
        largeur - 108,
        style_corps,
    )
    y -= 15
    _paragraphe(
        c,
        "Sa reproduction, sa revente, sa diffusion ou sa mise à disposition sur une plateforme "
        "tierce sont interdites. <b>Chaque exemplaire comporte des marqueurs propres à sa licence</b> "
        "afin d’identifier l’origine d’une copie diffusée sans autorisation.",
        54,
        y,
        largeur - 108,
        style_corps,
    )

    _dessiner_reseaux(c, largeur - 234, 151)
    c.setStrokeColor(GOLD)
    c.line(92, 121, largeur - 92, 121)
    _paragraphe(
        c,
        "<b>Trajectoire Droit Éditions</b><br/>"
        "Nom éditorial utilisé par Trajectoire Droit LLC<br/>"
        "© Trajectoire Droit LLC, 2026 · Tous droits réservés<br/>"
        "trajectoiredroit.com",
        54,
        107,
        largeur - 108,
        style_centre,
    )
    _dessiner_licence_visible(c, identite, y=20.0)
    _dessiner_texte_structurel(c, identite, 1)
    c.showPage()
    c.save()
    return tampon.getvalue()


def _page_overlay(
    largeur: float,
    hauteur: float,
    identite: IdentiteLicence,
    page_index: int,
) -> bytes:
    tampon = io.BytesIO()
    c = canvas.Canvas(tampon, pagesize=(largeur, hauteur))
    premiere_page_source = page_index == 2
    _dessiner_licence_visible(
        c,
        identite,
        x=305.0,
        y=hauteur - 58.0,
        couleur=white if premiere_page_source else GREY,
    )
    _dessiner_micro_marqueurs(
        c,
        largeur,
        hauteur,
        identite.fingerprint,
        haut=not premiere_page_source,
    )
    _dessiner_texte_structurel(c, identite, page_index)
    c.showPage()
    c.save()
    return tampon.getvalue()


def _xmp(fields: dict[str, str]) -> bytes:
    def echapper(valeur: str) -> str:
        return (
            valeur.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )

    contenu = "\n".join(
        f"      <tjd:{cle}>{echapper(valeur)}</tjd:{cle}>" for cle, valeur in fields.items()
    )
    return (
        "<?xpacket begin='﻿' id='W5M0MpCehiHzreSzNTczkc9d'?>\n"
        "<x:xmpmeta xmlns:x='adobe:ns:meta/'>\n"
        "  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>\n"
        "    <rdf:Description rdf:about='' xmlns:tjd='https://trajectoiredroit.com/ns/license/1.0/'>\n"
        f"{contenu}\n"
        "    </rdf:Description>\n"
        "  </rdf:RDF>\n"
        "</x:xmpmeta>\n"
        "<?xpacket end='w'?>"
    ).encode("utf-8")


def _ajouter_xmp(writer: PdfWriter, fields: dict[str, str]) -> None:
    flux = DecodedStreamObject()
    flux.set_data(_xmp(fields))
    flux[NameObject("/Type")] = NameObject("/Metadata")
    flux[NameObject("/Subtype")] = NameObject("/XML")
    writer._root_object[NameObject("/Metadata")] = writer._add_object(flux)


def personnaliser_pdf(source: bytes, identite: IdentiteLicence, secret: str, session_id: str) -> bytes:
    source_claire = _dechiffrer_source(source)
    reader = PdfReader(io.BytesIO(source_claire))
    writer = PdfWriter()

    page_licence = PdfReader(io.BytesIO(_page_licence(identite))).pages[0]
    page_licence[NameObject("/TJDLicense")] = TextStringObject(identite.licence)
    page_licence[NameObject("/TJDFingerprint")] = TextStringObject(identite.fingerprint)
    writer.add_page(page_licence)

    for index, page_source in enumerate(reader.pages, start=2):
        largeur = float(page_source.mediabox.width)
        hauteur = float(page_source.mediabox.height)
        overlay = PdfReader(
            io.BytesIO(_page_overlay(largeur, hauteur, identite, index))
        ).pages[0]
        writer.add_page(page_source)
        page_finale = writer.pages[-1]
        page_finale.merge_page(overlay, over=True)
        page_finale[NameObject("/TJDLicense")] = TextStringObject(identite.licence)
        page_finale[NameObject("/TJDFingerprint")] = TextStringObject(identite.fingerprint)
        page_finale[NameObject("/TJDPageFingerprint")] = TextStringObject(
            f"{identite.fingerprint}:{index:04d}"
        )

    metadonnees = {
        "/Title": "Majeures préparées Droit pénal L2 S1",
        "/Author": "Trajectoire Droit LLC",
        "/Subject": "Publication numérique commerciale · Copie individuelle sous licence",
        "/Keywords": "Trajectoire Droit, majeures préparées, droit pénal, publication numérique",
        "/TJDProtectionVersion": VERSION_PROTECTION,
        "/TJDLicense": identite.licence,
        "/TJDFingerprint": identite.fingerprint,
        "/TJDBuyer": identite.nom_affiche,
        "/TJDEmailMasked": identite.email_masque,
        "/TJDEmailHash": identite.email_hash,
        "/TJDEdition": "2026",
        "/TJDPublicationType": "Publication numérique commerciale",
    }
    writer.add_metadata(metadonnees)
    writer._root_object[NameObject("/TJDLicense")] = TextStringObject(identite.licence)
    writer._root_object[NameObject("/TJDFingerprint")] = TextStringObject(identite.fingerprint)
    writer._root_object[NameObject("/TJDProtectionVersion")] = TextStringObject(VERSION_PROTECTION)
    _ajouter_xmp(
        writer,
        {
            "license": identite.licence,
            "fingerprint": identite.fingerprint,
            "buyer": identite.nom_affiche,
            "emailMasked": identite.email_masque,
            "emailHash": identite.email_hash,
            "edition": "2026",
            "publicationType": "Publication numérique commerciale",
        },
    )

    personnalise = io.BytesIO()
    writer.write(personnalise)
    owner_password = _hmac_hex(secret, f"owner|{session_id}")[:32]
    sortie = io.BytesIO()
    permissions = pikepdf.Permissions(
        accessibility=True,
        extract=False,
        modify_annotation=False,
        modify_assembly=False,
        modify_form=False,
        modify_other=False,
        print_lowres=True,
        print_highres=True,
    )
    with pikepdf.open(io.BytesIO(personnalise.getvalue())) as pdf:
        pdf.save(
            sortie,
            encryption=pikepdf.Encryption(
                owner=owner_password,
                user="",
                R=6,
                aes=True,
                metadata=True,
                allow=permissions,
            ),
        )
    return sortie.getvalue()


def produire_depuis_commande(
    session_id: str,
    secret: str,
    cle_stripe: str,
    *,
    chargeur_session: Callable[[str, str], dict] = recuperer_session_stripe,
    chargeur_source: Callable[[], bytes] = telecharger_source,
) -> tuple[bytes, IdentiteLicence]:
    session = chargeur_session(session_id, cle_stripe)
    if session.get("id") != session_id:
        raise PermissionError("Commande Stripe incohérente")
    verifier_session_payee(session)
    identite = identite_depuis_session(session, secret)
    source = chargeur_source()
    return personnaliser_pdf(source, identite, secret, session_id), identite
