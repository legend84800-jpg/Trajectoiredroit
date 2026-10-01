#!/usr/bin/env python3
"""Fin des articles du blog : fiche de la matière au milieu, Pack Ultra du semestre à la fin.

Pour chaque article listé dans blog.html :
- ajoute l'encart « Fiche complète » au milieu s'il manque ;
- remplace la section sombre finale par une ligne discrète vers le Pack Ultra du semestre ;
- aligne la barre collante sur la fiche de la matière.
Idempotent (marqueurs <!-- fin-article:... -->). Lancer depuis la racine du site.
Sans argument : tous les articles de blog.html (table M). Pour une seule page, même hors blog :
  python3 scripts/fin-article-pack-ultra.py --page ma-page.html --produit contrats --pack l2-s1
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE_ULTRA = (ROOT / "pack-ultra.html").read_text()

# --- Packs Ultra, lus dans pack-ultra.html (prix, description, ressources) ---
TYPES_PLURIEL = {
    "Fiche complète": ("fiche complète", "fiches complètes"),
    "Cours complet": ("cours complet", "cours complets"),
    "Majeures préparées": ("série de majeures préparées", "séries de majeures préparées"),
    "Fiches d'arrêt": ("recueil de fiches d'arrêt", "recueils de fiches d'arrêt"),
    "Cas pratiques corrigés": ("recueil de cas pratiques corrigés", "recueils de cas pratiques corrigés"),
    "Commentaires d'arrêt": ("recueil de commentaires d'arrêt", "recueils de commentaires d'arrêt"),
    "Dissertations corrigées": ("recueil de dissertations corrigées", "recueils de dissertations corrigées"),
    "Flashcards + QCM": ("pack de flashcards et QCM", "packs de flashcards et QCM"),
    "Fiche de citations": ("fiche de citations", "fiches de citations"),
}
ORDRE_TYPES = ["Fiche complète", "Cours complet", "Majeures préparées", "Cas pratiques corrigés",
               "Fiches d'arrêt", "Commentaires d'arrêt", "Dissertations corrigées"]

PACKS = {}
for card in re.findall(r'<article class="ultra-card" id="pack-ultra-([^"]+)">(.*?)</article>', PAGE_ULTRA, re.S):
    sid, html = card
    g = lambda pat: re.search(pat, html).group(1)
    detail = re.search(r'id="pack-ultra-detail-%s">(.*?)</details>' % sid, PAGE_ULTRA, re.S).group(1)
    types = re.findall(r'ultra-resource__type">([^<]*)</span>', detail)
    PACKS[sid] = dict(
        niveau=g(r'ultra-card__eyebrow">([^<]*)<'),
        semestre=g(r'ultra-card__title">([^<]*)<'),
        desc=g(r'ultra-card__description">([^<]*)<'),
        old=g(r'ultra-card__unit-total">([^<]*)<'),
        prix=g(r'ultra-card__price">([^<]*)<'),
        paiement=g(r'ultra-card__payment">([^<]*)<'),
        economie=g(r'ultra-card__saving">([^<]*)<'),
        nb=len(types),
        types={t: types.count(t) for t in set(types)},
        alt=re.search(r'<img src="assets/covers/pack-ultra-%s\.webp" alt="([^"]*)"' % sid, html).group(1),
    )

# --- Fiches de la matière (encart du milieu et barre collante) ---
FICHES = {
    "famille": ("Droit de la famille L1", "droit-de-la-famille-l1.html#fiches", "assets/apercus/famille-l1-s2-1.jpg",
                "Mariage, PACS, concubinage, divorce, filiation et autorité parentale, en PDF"),
    "personnes": ("Droit des personnes L1", "droit-des-personnes-l1.html#fiches", "assets/apercus/personnes-l1-1.jpg",
                  "Tout le cours en PDF"),
    "constit": ("Droit constitutionnel L1", "droit-constitutionnel-l1.html#fiches", "assets/apercus/constit-l1-s2-1.jpg",
                "Tout le programme en PDF, les grandes décisions et la méthode de la dissertation"),
    "penalgen": ("Droit pénal général L1 S2", "droit-penal-general-l1.html#fiches", "assets/apercus/penal-general-l1-1.jpg",
                 "Tout le cours en PDF, avec cet arrêt et tous les autres"),
    "contrats": ("Droit des contrats L2", "droit-des-contrats-l2.html#fiches", "assets/apercus/contrats-l2-s1-1.jpg",
                 "Tout le cours en PDF, la réforme de 2016 intégrée"),
    "obligations": ("Droit des obligations L2", "droit-des-obligations-l2.html#fiches", "assets/apercus/obligations-l2-s2-1.webp",
                    "Tout le cours du semestre 2 en PDF, la responsabilité civile comprise"),
    "admin": ("Droit administratif L2", "droit-administratif-l2.html#fiches", "assets/apercus/da-l2-s1-1.webp",
              "Tout le cours en PDF, semestre 1 ou semestre 2"),
    "biens": ("Droit des biens L2", "droit-des-biens-l2.html#fiches", "assets/apercus/biens-l2-1.jpg",
              "Tout le cours du semestre en PDF"),
    "travail": ("Droit du travail L3", "droit-du-travail-l3.html#fiches", "assets/apercus/travail-l3-s1-1.jpg",
                "Le contrat de travail, le pouvoir de l'employeur, le licenciement, en PDF"),
    "cs": ("Contrats spéciaux L3", "contrats-speciaux-l3.html#fiches", "assets/apercus/contrats-speciaux-l3-1.jpg",
           "La vente, le contrat d'entreprise, leurs garanties, en PDF"),
    "societes": ("Droit des sociétés L3", "droit-des-societes-l3.html#fiches", "assets/apercus/societes-l3-s1-1.jpg",
                 "Tout le cours du semestre 1 en PDF"),
    "procpen": ("Procédure pénale L3", "procedure-penale-l3.html#fiches", "assets/apercus/procedure-penale-l3-1.jpg",
                "Tout le cours en PDF, du contrôle d'identité à la garde à vue et au jugement"),
    "penall2": ("Droit pénal L2", "droit-penal-l2.html#fiches", "assets/apercus/penal-l2-s1-1.jpg", "Tout le cours du semestre en PDF"),
    "commercial": ("Droit commercial L3", "droit-commercial-l3.html#fiches", "assets/apercus/commercial-l3-s1-1.jpg", "Tout le cours du semestre en PDF"),
    "introdroit": ("Introduction au droit L1", "introduction-au-droit-l1.html#fiches", "assets/apercus/intro-droit-l1-1.jpg", "Tout le cours du semestre en PDF"),
    "histdroit": ("Histoire du droit L1", "histoire-du-droit-l1.html#fiches", "assets/apercus/hist-droit-l1-1.jpg", "Tout le cours du semestre en PDF"),
    "histinst": ("Histoire des institutions L1", "histoire-des-institutions-l1.html#fiches", "assets/apercus/hist-institutions-l1-1.jpg", "Tout le cours du semestre en PDF"),
    "ri": ("Relations internationales L1", "relations-internationales-l1.html#fiches", "assets/apercus/relations-internationales-l1-1.jpg", "Tout le cours du semestre en PDF"),
}
# Produits hors fiche complète (label, titre, lien, image, meta, prix, libellé du bouton)
AUTRES = {
    "proccivile": ("Majeure préparée", "Procédure civile L3", "majeures-preparees.html",
                   "assets/majeures/procedure-civile-l3s1-couleur.webp",
                   "29 majeures dont le pourvoi en cassation et les cas d'ouverture", "14,99 €", "Voir la majeure →"),
    "packl1": ("Pack complet", "Toute la L1 de droit", "reussir-sa-l1.html",
               "assets/covers/pack-l1.webp?v=coffrets-universitaires-20260916",
               "8 fiches complètes pour combler la base d'un semestre, en PDF", "87 €", "Voir le pack L1 →"),
}

# --- Article -> (produit du milieu, Pack Ultra) ---
M = {}
def lot(cle, pack, *fichiers):
    for f in fichiers: M[f] = (cle, pack)

lot("packl1", "l1-s1", "l2-droit-distance-sans-l1.html")
lot("famille", "l1-s2", "rupture-du-concubinage-consequences.html", "peut-on-modifier-une-decision-de-garde-d-un-enfant.html",
    "obligation-information-vacances-enfant-autre-parent.html", "difference-pacs-mariage.html", "prestation-compensatoire-divorce.html")
lot("personnes", "l1-s1", "absence-disparition-droit-des-personnes.html")
lot("constit", "l1-s2", "bloc-de-constitutionnalite-explique.html", "qpc-question-prioritaire-de-constitutionnalite.html",
    "decision-ivg-1975-expliquee.html", "decision-liberte-association-1971-expliquee.html")
lot("penalgen", "l1-s2", "arret-laboube-1956-explique.html")
lot("contrats", "l2-s1", "condition-potestative-droit-des-contrats.html", "decheance-garantie-assurance-auto-mauvaise-foi.html",
    "promesse-unilaterale-de-vente-article-1124.html", "clause-de-non-concurrence-bail-professionnel.html",
    "execution-forcee-en-nature-droit-des-contrats.html", "reforme-droit-contrats-2016.html", "la-lesion-en-droit-des-contrats.html",
    "arret-baldus-explique.html", "la-nullite-du-contrat.html", "caducite-du-contrat-article-1186.html",
    "clause-penale-contrat-article-1231-5.html", "force-majeure-contrat-article-1218.html")
lot("obligations", "l2-s2", "loi-badinter-accident-circulation.html", "prescription-responsabilite-avocat-delai-manque.html",
    "responsabilite-commettants-du-fait-de-leurs-preposes.html", "la-responsabilite-du-fait-des-choses.html",
    "la-faute-civile-droit-des-obligations.html", "obligation-de-moyen-et-de-resultat.html")
lot("admin", "l2-s1", "arret-cadot-explique.html", "arret-bac-eloka-explique.html", "arret-benjamin-explique.html",
    "arret-nicolo-explique.html", "arret-blanco-explique.html", "arret-gisti-1978-explique.html", "arret-barel-1954-explique.html",
    "notion-service-public-droit-administratif.html")
lot("admin", "l2-s2", "arret-dame-lamotte-explique.html", "responsabilite-sans-faute-droit-administratif.html",
    "recours-exces-de-pouvoir-droit-administratif.html")
lot("biens", "l2-s2", "accession-construction-terrain-autrui.html", "servitude-continue-discontinue-apparente.html",
    "possession-detention-precaire-droit-des-biens.html")
lot("travail", "l3-s1", "mineur-sept-jours-affilee-repos-hebdomadaire.html", "licenciement-absence-prolongee-remplacement-definitif.html",
    "clause-exclusivite-micro-entreprise-preavis-demission.html", "qui-paie-la-tenue-de-travail-imposee-par-l-employeur.html",
    "rupture-conventionnelle-indemnite-minimale-inaptitude.html", "employeur-peut-il-imposer-travail-dimanche.html")
lot("cs", "l3-s1", "chambre-individuelle-clinique-privee-facturation.html", "colis-retour-vide-qui-doit-prouver.html",
    "panne-ascenseur-indemnisation-locataire.html", "retractation-vente-a-domicile-pompe-a-chaleur.html",
    "garantie-conformite-vices-caches-voiture-occasion.html", "bail-deces-locataire-heritiers.html")
lot("societes", "l3-s1", "la-personnalite-morale-de-la-societe.html", "affectio-societatis-explique.html", "arret-fruehauf-explique.html")
lot("procpen", "l3-s1", "la-garde-a-vue-duree-et-droits.html")
lot("proccivile", "l3-s1", "arret-estoppel-2009-explique.html")


# Produit vendu en achat direct (bouton Stripe), par clé et par semestre du Pack Ultra.
# Depuis le 01/10/2026 la fiche à 14,99 € s'achète en un clic dans l'article
# (encart du milieu et barre collante), et le Pack Ultra n'est plus qu'une ligne de lien.
ID_PRODUIT = {
    "famille": "fiche-famille-l1-s2", "personnes": "fiche-personnes-l1", "penalgen": "fiche-penal-general-l1",
    "contrats": "fiche-contrats-l2-s1", "obligations": "fiche-obligations-l2-s2", "biens": "fiche-biens-l2",
    "travail": "fiche-travail-l3-s1", "cs": "fiche-contrats-speciaux-l3", "societes": "fiche-societes-l3-s1",
    "procpen": "fiche-procedure-penale-l3", "penall2": "fiche-penal-l2-s1", "commercial": "fiche-commercial-l3-s1",
    "introdroit": "fiche-intro-droit-l1", "histdroit": "fiche-hist-droit-l1", "histinst": "fiche-hist-institutions-l1",
    "ri": "fiche-relations-internationales-l1", "proccivile": "maj-procedure-civile-l3-s1",
}


def id_produit(cle, sid):
    if cle == "admin": return "fiche-da-l2-s2" if sid.endswith("s2") else "fiche-da-l2-s1"
    if cle == "constit": return "fiche-constit-l1-s2" if sid.endswith("s2") else "fiche-constit-l1-s1"
    return ID_PRODUIT.get(cle)


def actions(cle, sid, classe_btn="btn btn--primary"):
    """Bouton d'achat direct de la fiche, ou lien quand le produit n'a pas d'achat direct (pack L1)."""
    label, titre, lien, img, meta, prix, bouton = produit(cle)
    pid = id_produit(cle, sid)
    if not pid:
        return f'<a class="{classe_btn}" href="{lien}">{bouton}</a>'
    return f'<button type="button" class="{classe_btn}" data-tjd-produit="{pid}">Acheter · {prix}</button>'


def produit(cle):
    """(label, titre, lien, image, meta, prix, bouton)"""
    if cle in AUTRES: return AUTRES[cle]
    t, lien, img, meta = FICHES[cle]
    return ("Fiche complète", t, lien, img, meta, "14,99 €", "Voir la fiche →")


def encart_milieu(cle, sid):
    label, titre, lien, img, meta, prix, bouton = produit(cle)
    lien_detail = f'\n    <a class="article-produit-inline__more" href="{lien}">{bouton}</a>' if id_produit(cle, sid) else ""
    return f'''<!-- fin-article:encart-milieu -->
<div class="article-produit-inline">
  <img class="article-produit-inline__thumb" src="{img}" alt="{titre}" loading="lazy">
  <div class="article-produit-inline__body">
    <p class="article-produit-inline__label">{label}</p>
    <p class="article-produit-inline__title">{titre}</p>
    <p class="article-produit-inline__meta">{meta} · <strong>{prix}</strong></p>
  </div>
  <div class="article-produit-inline__actions">
    {actions(cle, sid)}{lien_detail}
  </div>
</div>
'''


def minuscule(titre):
    return titre[0].lower() + titre[1:]


def carte_pack(cle, sid):
    p = PACKS[sid]
    label, titre, *_ = produit(cle)
    num = sid[1]
    sem = "premier" if sid.endswith("s1") else "second"
    if cle == "packl1":
        comprise = ""
    else:
        nature = "la majeure" if label == "Majeure préparée" else "la fiche"
        t = minuscule(titre)
        de = "d'" if t[0] in "aeiouyhéèêàâîôû" else "de "
        comprise = f", {nature} {de}{t} comprise"
    return f'''    <!-- fin-article:pack-ultra -->
    <section class="section article-pack-ligne" aria-label="Pack Ultra du semestre">
      <div class="container">
        <p class="article-pack-ligne__texte">Le Pack Ultra L{num} S{sid[-1]} réunit les {p['nb']} ressources de ton {sem} semestre de L{num} pour {p['prix']}{comprise}. <a href="pack-ultra.html#pack-ultra-{sid}">Voir le contenu du pack →</a></p>
        <p class="article-pack__back"><a href="blog.html">← Revenir au blog</a></p>
      </div>
    </section>
'''


def barre(cle, sid):
    label, titre, lien, img, meta, prix, bouton = produit(cle)
    return f'''  <!-- fin-article:sticky -->
  <div class="sticky-cta-bar sticky-cta-bar--always" id="stickyCta">
    <div class="sticky-cta-bar__text">
      <strong>{titre} · {prix}</strong>
      <small>{label} · accès à vie</small>
    </div>
    {actions(cle, sid)}
  </div>
'''


def traiter(f, cle, sid):
    path = ROOT / f
    a = path.read_text()
    avant = a
    # 1. Encart du milieu, seulement s'il n'y en a aucun
    if 'class="article-produit-inline"' not in a:
        h2 = [m.start() for m in re.finditer(r'<h2 id=', a)]
        if len(h2) < 2:
            h2 = [m.start() for m in re.finditer(r'<h2 class="h2" style="margin-bottom:8px">', a)]
        pos = h2[1]
        debut_ligne = a.rfind("\n", 0, pos) + 1
        a = a[:debut_ligne] + encart_milieu(cle, sid) + "\n" + a[debut_ligne:]
    elif "<!-- fin-article:encart-milieu -->" in a:
        # Encart déjà posé : on ne remplace que les boutons, pour garder la vignette et le texte réécrits depuis.
        label, titre, lien, img, meta, prix, bouton = produit(cle)
        detail = f'\n    <a class="article-produit-inline__more" href="{lien}">{bouton}</a>' if id_produit(cle, sid) else ""
        a = re.sub(r'(<!-- fin-article:encart-milieu -->\n<div class="article-produit-inline">.*?<div class="article-produit-inline__actions">\n).*?(\n  </div>\n</div>\n)',
                   lambda m: m.group(1) + "    " + actions(cle, sid) + detail + m.group(2), a, count=1, flags=re.S)
    elif f == "arret-estoppel-2009-explique.html":
        a = re.sub(r'(<!--[^>]*-->\s*)?<div class="article-produit-inline">.*?</div>\s*</div>\n',
                   lambda m: encart_milieu(cle, sid), a, count=1, flags=re.S)
    # 2. Section sombre finale -> carte Pack Ultra
    a, n = re.subn(r'(    <!-- CTA FINAL -->\n)?    <section class="section section--dark[^"]*".*?</section>\n'
                   r'|    <!-- fin-article:pack-ultra -->\n    <section.*?</section>\n',
                   lambda m: carte_pack(cle, sid), a, count=1, flags=re.S)
    assert n == 1, f
    # 3. Barre collante
    motif = r'(  <!-- (vague2:sticky-bar|fin-article:sticky) -->\n)?  <div class="sticky-cta-bar[^"]*" id="stickyCta">.*?\n  </div>\n'
    if "optimiseur-pages-existantes 20" in a and re.search(motif, a, re.S):
        pass  # barre collante réglée par optimiseur-pages-existantes sur la requête réelle, on la garde
    elif re.search(motif, a, re.S):
        a = re.sub(motif, lambda m: barre(cle, sid), a, count=1, flags=re.S)
    else:
        i = a.index("</footer>") + len("</footer>\n")
        a = a[:i] + barre(cle, sid) + a[i:]
    if 'data-tjd-produit=' in a and "assets/js/achat.js" not in a:
        v = re.search(r'assets/js/achat\.js\?v=([a-f0-9]+)', (ROOT / "index.html").read_text()).group(1)
        a = re.sub(r'^(\s*)<script src="assets/js/main\.js', lambda m: f'{m.group(1)}<script src="assets/js/achat.js?v={v}" defer></script>\n{m.group(1)}<script src="assets/js/main.js', a, count=1, flags=re.M)
    if a != avant:
        path.write_text(a)
        return True
    return False


if __name__ == "__main__":
    # Page hors blog (routines SEO) : --page fichier.html --produit <clé FICHES/AUTRES> --pack <l1-s1|l1-s2|l2-s1|l2-s2|l3-s1>
    if "--page" in sys.argv:
        a = dict(zip(sys.argv[1::2], sys.argv[2::2]))
        cle, sid = a["--produit"], a["--pack"]
        if cle not in FICHES and cle not in AUTRES: sys.exit(f"Produit inconnu {cle}, choisir parmi {sorted(FICHES) + sorted(AUTRES)}")
        if sid not in PACKS: sys.exit(f"Pack inconnu {sid}, choisir parmi {sorted(PACKS)}")
        print(("modifié " if traiter(a["--page"], cle, sid) else "inchangé"), a["--page"], cle, sid)
        sys.exit(0)
    blog = (ROOT / "blog.html").read_text()
    articles = [re.search(r'href="([^"]+)"', c).group(1)
                for c in re.findall(r'<article class="post-card">(.*?)</article>', blog, re.S)]
    manquants = [f for f in articles if f not in M and f not in ("methode-cas-pratique.html", "fiche-arrets.html")]
    if manquants: sys.exit(f"Articles sans correspondance : {manquants}")
    cibles = sys.argv[1:] or list(M)
    for f in cibles:
        cle, sid = M[f]
        print(("modifié " if traiter(f, cle, sid) else "inchangé"), f, cle, sid)
