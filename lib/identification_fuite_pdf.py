"""Détection locale d'une copie PDF personnalisée Trajectoire Droit.

Le module inspecte les marqueurs structurels et les micro-marqueurs visuels.
L'attribution finale reste confiée au service sécurisé qui vérifie l'historique
d'achats et la session Stripe.
"""

from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path
from statistics import mean

import pikepdf
from pypdf import PdfReader

FINGERPRINT_RE = re.compile(r"^[0-9A-F]{10}$")
FINGERPRINT_TEXTE_RE = re.compile(r"TJD-FP:([0-9A-F]{10})", re.IGNORECASE)
LICENCE_RE = re.compile(r"\bTD-PEN-S1-[0-9A-F]{8}\b", re.IGNORECASE)


def sha256_fichier(chemin: Path) -> str:
    digest = hashlib.sha256()
    with chemin.open("rb") as flux:
        for bloc in iter(lambda: flux.read(1024 * 1024), b""):
            digest.update(bloc)
    return digest.hexdigest()


def _texte_objet(valeur: object) -> str:
    if valeur is None:
        return ""
    try:
        return str(valeur.get_object())
    except Exception:  # noqa: BLE001, certains objets PDF tiers lèvent des erreurs non typées
        return str(valeur)


def _ajouter_fingerprint(
    preuves: dict[str, set[str]],
    couche: str,
    valeur: object,
) -> None:
    candidat = _texte_objet(valeur).strip().upper()
    if FINGERPRINT_RE.fullmatch(candidat):
        preuves[couche].add(candidat)


def _ajouter_licences(licences: set[str], texte: str) -> None:
    licences.update(match.upper() for match in LICENCE_RE.findall(texte))


def preuves_structurelles(chemin: Path) -> tuple[dict[str, set[str]], set[str]]:
    clair = io.BytesIO()
    try:
        with pikepdf.open(chemin, password="") as pdf:
            pdf.save(clair)
    except pikepdf.PasswordError as erreur:
        raise ValueError("Le PDF exige un mot de passe d'ouverture") from erreur
    lecteur = PdfReader(io.BytesIO(clair.getvalue()))

    preuves = {
        "metadonnees": set(),
        "catalogue": set(),
        "pages": set(),
        "texte_invisible": set(),
        "xmp": set(),
    }
    licences: set[str] = set()

    metadonnees = lecteur.metadata or {}
    _ajouter_fingerprint(preuves, "metadonnees", metadonnees.get("/TJDFingerprint"))
    _ajouter_licences(licences, str(metadonnees.get("/TJDLicense", "")))

    racine = lecteur.trailer.get("/Root", {})
    _ajouter_fingerprint(preuves, "catalogue", racine.get("/TJDFingerprint"))
    _ajouter_licences(licences, _texte_objet(racine.get("/TJDLicense")))

    xmp = racine.get("/Metadata")
    if xmp is not None:
        try:
            texte_xmp = xmp.get_object().get_data().decode("utf-8", errors="ignore")
        except Exception:  # noqa: BLE001, le XMP pirate peut être arbitrairement altéré
            texte_xmp = ""
        for match in re.finditer(
            r"<tjd:fingerprint>\s*([0-9A-F]{10})\s*</tjd:fingerprint>",
            texte_xmp,
            re.IGNORECASE,
        ):
            preuves["xmp"].add(match.group(1).upper())
        _ajouter_licences(licences, texte_xmp)

    for page in lecteur.pages:
        _ajouter_fingerprint(preuves, "pages", page.get("/TJDFingerprint"))
        _ajouter_licences(licences, _texte_objet(page.get("/TJDLicense")))
        try:
            texte_page = page.extract_text() or ""
        except Exception:  # noqa: BLE001, une page pirate peut avoir un flux illisible
            texte_page = ""
        for match in FINGERPRINT_TEXTE_RE.finditer(texte_page):
            preuves["texte_invisible"].add(match.group(1).upper())
        _ajouter_licences(licences, texte_page)

    return preuves, licences


def _obscurite(image: object, x: float, y: float, rayon: int = 3) -> float:
    gauche = max(0, round(x) - rayon)
    haut = max(0, round(y) - rayon)
    droite = min(image.width, round(x) + rayon + 1)
    bas = min(image.height, round(y) + rayon + 1)
    if gauche >= droite or haut >= bas:
        return 0.0
    zone = image.crop((gauche, haut, droite, bas)).convert("L")
    if hasattr(zone, "get_flattened_data"):
        valeurs = list(zone.get_flattened_data())
    else:
        valeurs = list(zone.getdata())
    return 255.0 - mean(valeurs)


def _positions_bit(
    zone: str,
    index_bit: int,
    largeur: float,
    hauteur: float,
) -> tuple[tuple[float, float], tuple[float, float]]:
    decalage = 2.6
    if zone == "haut":
        x = 64 + index_bit * ((largeur - 128) / 39)
        return (x, 4.5), (x, 4.5 + decalage)

    y_pdf = 70 + index_bit * ((hauteur - 140) / 39)
    y_haut = hauteur - y_pdf
    if zone == "gauche_externe":
        return (4.5, y_haut), (4.5 + decalage, y_haut)
    if zone == "gauche_interne":
        return (52.0, y_haut), (52.0 + decalage, y_haut)
    if zone == "droite_externe":
        return (largeur - 4.5, y_haut), (largeur - 4.5 - decalage, y_haut)
    if zone == "droite_interne":
        return (largeur - 52.0, y_haut), (largeur - 52.0 - decalage, y_haut)
    raise ValueError(f"Zone visuelle inconnue, {zone}")


def decoder_page_visuelle(page: object, dpi: int = 288) -> tuple[str, float]:
    try:
        import pymupdf
        from PIL import Image
    except ImportError as erreur:
        raise RuntimeError(
            "La détection visuelle requiert PyMuPDF et Pillow. "
            "Utilise le lanceur scripts/identifier-fuite-pdf.command."
        ) from erreur

    echelle = dpi / 72.0
    pixmap = page.get_pixmap(
        matrix=pymupdf.Matrix(echelle, echelle),
        alpha=False,
        colorspace=pymupdf.csGRAY,
    )
    image = Image.frombytes("L", (pixmap.width, pixmap.height), pixmap.samples)
    largeur = float(page.rect.width)
    hauteur = float(page.rect.height)
    zones = (
        "haut",
        "gauche_externe",
        "gauche_interne",
        "droite_externe",
        "droite_interne",
    )
    bits: list[int] = []
    confiances: list[float] = []

    for index_bit in range(40):
        scores_signes: list[float] = []
        for zone in zones:
            point_zero, point_un = _positions_bit(zone, index_bit, largeur, hauteur)
            sombre_zero = _obscurite(
                image,
                point_zero[0] * echelle,
                point_zero[1] * echelle,
            )
            sombre_un = _obscurite(
                image,
                point_un[0] * echelle,
                point_un[1] * echelle,
            )
            scores_signes.append(sombre_un - sombre_zero)
        scores_signes.sort(key=abs, reverse=True)
        selection = scores_signes[:3]
        score = sum(selection)
        bits.append(1 if score > 0 else 0)
        confiances.append(abs(score) / max(1, len(selection)))

    valeur = 0
    for bit in bits:
        valeur = (valeur << 1) | bit
    return f"{valeur:010X}", mean(confiances)


def preuves_visuelles(
    chemin: Path,
    *,
    dpi: int = 288,
    pages_max: int = 8,
) -> tuple[dict[str, int], list[dict[str, object]]]:
    try:
        import pymupdf
    except ImportError as erreur:
        raise RuntimeError(
            "La détection visuelle requiert PyMuPDF. "
            "Utilise le lanceur scripts/identifier-fuite-pdf.command."
        ) from erreur

    document = pymupdf.open(chemin)
    comptes: dict[str, int] = {}
    pages: list[dict[str, object]] = []
    try:
        for index_page in range(min(pages_max, len(document))):
            fingerprint, confiance = decoder_page_visuelle(document[index_page], dpi=dpi)
            comptes[fingerprint] = comptes.get(fingerprint, 0) + 1
            pages.append(
                {
                    "page": index_page + 1,
                    "fingerprint": fingerprint,
                    "confiance": round(confiance, 3),
                }
            )
    finally:
        document.close()
    return comptes, pages


def analyser_pdf(
    chemin: Path,
    *,
    dpi: int = 288,
    pages_max: int = 8,
) -> dict[str, object]:
    chemin = chemin.expanduser().resolve()
    if not chemin.is_file() or chemin.suffix.lower() != ".pdf":
        raise ValueError("Le fichier à analyser doit être un PDF existant")

    structure, licences = preuves_structurelles(chemin)
    comptes_visuels, pages_visuelles = preuves_visuelles(
        chemin,
        dpi=dpi,
        pages_max=pages_max,
    )

    candidats: dict[str, dict[str, object]] = {}
    for couche, fingerprints in structure.items():
        for fingerprint in fingerprints:
            entree = candidats.setdefault(
                fingerprint,
                {"couches": [], "occurrences_visuelles": 0},
            )
            entree["couches"].append(couche)

    for fingerprint, occurrences in comptes_visuels.items():
        entree = candidats.setdefault(
            fingerprint,
            {"couches": [], "occurrences_visuelles": 0},
        )
        entree["occurrences_visuelles"] = occurrences
        if occurrences:
            entree["couches"].append("micro_marqueurs")

    for entree in candidats.values():
        entree["couches"] = sorted(set(entree["couches"]))

    return {
        "fichier": str(chemin),
        "sha256": sha256_fichier(chemin),
        "fingerprints": candidats,
        "licences": sorted(licences),
        "pages_visuelles": pages_visuelles,
    }
