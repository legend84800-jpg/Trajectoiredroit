#!/usr/bin/env python3
"""Met le cours en images de droit des contrats L2 S1 en avant sur les pages liées.

Test du 24/10 au 13/11/2026. Sur chaque page de la liste, l'encart produit
de la fiche complète Contrats devient celui du cours en images, avec la page
du cours qui traite la notion. L'offre de fin d'article et le bandeau d'achat
passent aussi au cours en images, la fiche complète reste proposée en second.
Les pages du test des commentaires d'arrêt à 4,99 € ne sont jamais touchées.

Usage : python3 scripts/basculer-cours-images-contrats.py [--verifier]
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
ID = "cours-images-contrats-l2-s1"
APERCUS = "assets/apercus/cours-images-contrats-l2-s1"
PAGES_DISPONIBLES = {1, 2, 10, 11, 14, 17, 19, 34, 37, 40, 41, 57, 64, 65, 67, 68,
                     72, 76, 82, 87, 90, 91, 93, 97, 101, 103, 105, 107}

ARRET = "Cet arrêt est expliqué page {n}, avec une scène dessinée"
NOTION = "Cette notion est expliquée page {n}, avec une scène dessinée"
GENERAL = "Tout le droit des contrats de L2 S1 en 109 pages illustrées"

# page du site -> (page du cours, phrase de l'encart)
CIBLES = {
    "arret-baldus-explique.html": (17, ARRET),
    "arret-canal-de-craponne-explique.html": (82, ARRET),
    "arret-chronopost-explique.html": (67, ARRET),
    "arret-poussin-1978-explique.html": (41, ARRET),
    "arret-tocqueville-1998-explique.html": (97, ARRET),
    "caducite-du-contrat-article-1186.html": (76, NOTION),
    "clause-penale-contrat-article-1231-5.html": (105, NOTION),
    "force-majeure-contrat-article-1218.html": (103, NOTION),
    "l-exception-d-inexecution.html": (91, NOTION),
    "execution-forcee-en-nature-droit-des-contrats.html": (93, NOTION),
    "la-lesion-en-droit-des-contrats.html": (65, NOTION),
    "la-nullite-du-contrat.html": (72, NOTION),
    "la-promesse-synallagmatique-de-vente.html": (34, "La promesse de contrat est expliquée page {n}, avec une scène dessinée"),
    "promesse-unilaterale-de-vente-article-1124.html": (34, NOTION),
    "la-stipulation-pour-autrui.html": (87, NOTION),
    "la-formation-du-contrat-offre-et-acceptation.html": (19, NOTION),
    "les-vices-du-consentement.html": (37, "Les vices du consentement commencent page {n}, avec une scène dessinée"),
    "les-clauses-abusives-dans-le-contrat.html": (68, NOTION),
    "la-representation-en-droit-des-contrats.html": (57, NOTION),
    "la-resolution-du-contrat.html": (97, NOTION),
    "la-cause-en-droit.html": (64, "La contrepartie, qui reprend une partie du rôle de la cause, est expliquée page {n}"),
    "reforme-droit-contrats-2016.html": (11, "L'application de la réforme dans le temps est expliquée page {n}"),
    "dissertation-force-obligatoire-du-contrat-corrigee.html": (10, "La force obligatoire est expliquée page {n}, avec une scène dessinée"),
    "condition-potestative-droit-des-contrats.html": (1, GENERAL),
    "sujets-droit-des-contrats-l2.html": (1, GENERAL),
    "clause-de-non-concurrence-bail-professionnel.html": (1, GENERAL),
    "decheance-garantie-assurance-auto-mauvaise-foi.html": (1, GENERAL),
    "fiche-revision-droit-des-obligations-l2.html": (1, GENERAL),
    "preparer-sa-rentree-en-l2-de-droit.html": (1, GENERAL),
}

TEST_ARRETS = "test-arrets-2026-10-20"


def apercu(n):
    pages = [n] + [p for p in (2, 90, 40) if p != n][:2]
    return "[" + ", ".join(f'"{APERCUS}/page-{p:03d}.webp"' for p in pages) + "]"


def encart(n, phrase):
    meta = phrase.format(n=n)
    voir = f"Voir la page {n}" if n != 1 else "Voir des pages"
    return f'''<!-- cours-images:encart-produit -->
<div class="article-produit-inline">
  <img class="article-produit-inline__thumb" src="{APERCUS}/page-{n:03d}.webp" width="60" height="85" alt="Page {n} du cours Le droit des contrats en images" loading="lazy">
  <div class="article-produit-inline__body">
    <p class="article-produit-inline__label">Cours en images</p>
    <p class="article-produit-inline__title"><a href="droit-des-contrats-en-images.html">Le droit des contrats en images</a></p>
    <p class="article-produit-inline__meta">{meta} · <strong>9,99 €</strong></p>
  </div>
  <div class="article-produit-inline__actions">
    <button type="button" class="apercu-link" data-apercu='{apercu(n)}' data-apercu-title="Le droit des contrats en images · L2 S1" data-apercu-sub="Pages réelles du cours en images" data-apercu-price="9,99 €" data-apercu-cta="{ID}">{voir}</button>
    <button type="button" class="btn btn--primary" data-tjd-produit="{ID}">Acheter · 9,99 €</button>
  </div>
</div>'''


def offre_fin(n, phrase, indent):
    complement = ""
    if n != 1:
        complement = " " + phrase.format(n=n).replace(", avec une scène dessinée", "") + "."
    bloc = f'''<aside class="conversion-offer" aria-label="Le cours en images, Droit des contrats L2, semestre 1" data-offre-fin-arret="{ID}">
  <div class="conversion-offer__card">
    <div class="conversion-offer__visual">
      <img src="assets/covers/cours-images-contrats-l2-s1.webp" alt="Trois pages du cours Le droit des contrats en images" loading="lazy" width="960" height="540" decoding="async">
    </div>
    <div>
      <p class="conversion-offer__eyebrow">Le cours en images de la matière</p>
      <p class="conversion-offer__title">Le droit des contrats en images, L2 semestre 1</p>
      <p class="conversion-offer__summary">Ce cours reprend le droit des contrats de L2 S1 en 109 pages illustrées, de la formation du contrat jusqu'à son inexécution. Chaque règle y est écrite avec son article du Code civil, puis une scène dessinée montre la situation à laquelle elle s'applique.{complement}</p>
      <div class="conversion-offer__choices">
        <button type="button" class="btn btn--primary" data-tjd-produit="{ID}">Acheter · 9,99 €</button>
        <button type="button" class="apercu-link" data-apercu='{apercu(n)}' data-apercu-title="Le droit des contrats en images · L2 S1" data-apercu-sub="Pages réelles du cours en images" data-apercu-price="9,99 €" data-apercu-cta="{ID}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Voir des pages</button>
        <button type="button" class="btn btn--outline btn--sm" data-tjd-produit="fiche-contrats-l2-s1">Fiche complète · 14,99 €</button>
      </div>
      <p class="conversion-offer__note">Paiement Stripe · PDF envoyé par email dès le paiement · garantie satisfait ou remboursé sous 7 jours</p>
    </div>
  </div>
</aside>'''
    return "\n".join(indent + ligne if ligne else ligne for ligne in bloc.split("\n")).lstrip()


STICKY = '''<div class="sticky-cta-bar__text">
      <strong>Le droit des contrats en images · 9,99 €</strong>
      <small>Cours en images · 109 pages</small>
    </div>
    <button type="button" class="btn btn--primary" data-tjd-produit="cours-images-contrats-l2-s1">Acheter · 9,99 €</button>'''

# Un encart produit de la fiche Contrats, sans jamais déborder sur un titre,
# une section ou un autre encart.
_SANS_DEBORDER = r'(?:(?!<div class="article-produit-inline|<h2|<section|</section>).)*?'
RE_ENCART = re.compile(
    r'(?:<!-- [^>]*(?:encart|offre-milieu)[^>]* -->\n)?<div class="article-produit-inline[^"]*">\n'
    + _SANS_DEBORDER + r'vignettes/contrats-l2-s1\.webp' + _SANS_DEBORDER + r'\n  </div>\n</div>',
    re.S)
RE_FIN = re.compile(
    r'<aside class="conversion-offer" (?:[^>]*data-offre-fin-arret="fiche-contrats-l2-s1"|aria-label="Fiche complète Droit des contrats L2 S1")[^>]*>.*?</aside>',
    re.S)
RE_STICKY = re.compile(
    r'<div class="sticky-cta-bar__text">\n\s*<strong>[^<]*</strong>\n\s*<small>[^<]*</small>\n\s*</div>\n\s*<button type="button" class="btn btn--primary" data-tjd-produit="fiche-contrats-l2-s1">[^<]*</button>')
RE_PREMIER_H2 = re.compile(r'\n(\s*)<h2 (?:id="essentiel"|class="h2")')


def basculer(nom, n, phrase):
    chemin = SITE / nom
    html = chemin.read_text(encoding="utf-8")
    if TEST_ARRETS in html:
        raise RuntimeError(f"{nom} appartient au test des commentaires d'arrêt")
    if n not in PAGES_DISPONIBLES:
        raise RuntimeError(f"Aperçu manquant pour la page {n}")
    actions = []
    html, k = RE_ENCART.subn(lambda m: encart(n, phrase), html, count=1)
    if k:
        actions.append("encart remplacé")
    elif "<!-- cours-images:encart-produit -->" in html:
        pass
    else:
        m = RE_PREMIER_H2.search(html, html.find('<main'))
        if not m:
            raise RuntimeError(f"{nom}, aucun emplacement pour l'encart")
        html = html[:m.start()] + "\n" + m.group(1) + encart(n, phrase).replace("\n", "\n" + m.group(1)) + "\n" + html[m.start():]
        actions.append("encart ajouté")

    def remplacer_fin(m):
        debut = html.rfind("\n", 0, m.start()) + 1
        return offre_fin(n, phrase, html[debut:m.start()])
    html, k = RE_FIN.subn(remplacer_fin, html, count=1)
    if k:
        actions.append("offre de fin")
    html, k = RE_STICKY.subn(STICKY, html, count=1)
    if k:
        actions.append("bandeau")
    chemin.write_text(html, encoding="utf-8")
    return ", ".join(actions)


def main():
    for nom, (n, phrase) in CIBLES.items():
        print(f"{nom}: {basculer(nom, n, phrase)}")


if __name__ == "__main__":
    main()
