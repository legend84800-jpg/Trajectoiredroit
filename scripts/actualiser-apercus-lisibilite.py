#!/usr/bin/env python3
"""Rend les pages des PDF vérifiés et remplace leurs références sur le site."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import hashlib
import html
import json
import re
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'scripts/apercus-produits.json'
ATTR = re.compile(r'([\w-]+)\s*=\s*([\'"])(.*?)\2', re.S)
TAG = re.compile(r'<(?:button|a)\b[^>]*\bdata-apercu=[^>]*>', re.S)


def attributs(tag):
    return {m[1]: html.unescape(m[3]) for m in ATTR.finditer(tag)}


def champ(tag, nom, valeur):
    pattern = re.compile(r'\b' + re.escape(nom) + r'=([\'"])(.*?)\1', re.S)
    def remplacer(m):
        quote = "'" if nom == 'data-apercu' else m[1]
        escaped = html.escape(valeur, quote=True) if quote == '"' else valeur.replace("'", '&#x27;')
        return nom + '=' + quote + escaped + quote
    tag, n = pattern.subn(remplacer, tag)
    assert n == 1, nom
    return tag


def galeries(texte):
    return [attributs(m[0]) for m in TAG.finditer(texte)]


def actualiser_pages_cartes(texte, produits, normaliser=False):
    espaces = r'(?:\s|&nbsp;|&#160;)*'
    nombre = re.compile(r'(\bPDF' + espaces + r'(?:(?:·|&middot;|&#183;|\||•)' + espaces
                        + r')?)\d+(' + espaces + r'(?:pp?\.?|pages?)(?![\w.]))', re.I)
    def carte(match):
        bloc = match[0]
        ids = {g.get('data-apercu-cta') for g in galeries(bloc)}
        if len(ids) != 1:
            return bloc
        produit = next(iter(ids))
        if produit not in produits:
            return bloc
        pages = '<PAGES>' if normaliser else str(produits[produit]['pages_pdf'])
        return nombre.sub(lambda m:m[1] + pages + m[2], bloc)
    return re.sub(r'<article\b.*?</article>', carte, texte, flags=re.S)


def rendre(catalogue, manifest):
    for produit, p in catalogue['produits'].items():
        if produit not in manifest:
            continue
        source = manifest[produit]
        chemin = Path(source['fichier'])
        assert hashlib.sha256(chemin.read_bytes()).hexdigest() == source['sha256'] == p['sha256'], produit
        doc = fitz.open(chemin)
        assert len(doc) == p['pages_pdf'] == source['pages'], produit
        preuves = {}
        for numero, image in zip(p['pages_images'], p['images']):
            page = doc[numero - 1]
            cible = ROOT / image
            cible.parent.mkdir(parents=True, exist_ok=True)
            fitz.TOOLS.store_shrink(100)
            pix = page.get_pixmap(matrix=fitz.Matrix(2.4, 2.4), alpha=False)
            Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(cible, 'WEBP', quality=91, method=6)
            with Image.open(cible) as im:
                taille = list(im.size)
                im.verify()
            preuves[image] = {'page_pdf': numero, 'sha256_image': hashlib.sha256(cible.read_bytes()).hexdigest(), 'dimensions': taille}
        vignette = p.get('vignette')
        if vignette:
            cible = ROOT / vignette['image']
            fitz.TOOLS.store_shrink(100)
            pix = doc[vignette['page_pdf'] - 1].get_pixmap(matrix=fitz.Matrix(.6, .6), alpha=False)
            Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(cible, 'WEBP', quality=88, method=6)
            preuves[vignette['image']] = {'page_pdf': vignette['page_pdf'], 'sha256_image': hashlib.sha256(cible.read_bytes()).hexdigest(), 'dimensions': [pix.width, pix.height], 'vignette': True}
        p['preuves_images'] = preuves


def actualiser(texte, fichier, catalogue):
    produits = catalogue['produits']
    avant = galeries(texte)
    comptes = {}
    def bouton(match):
        tag = match[0]
        attrs = attributs(tag)
        produit = attrs.get('data-apercu-cta')
        if produit not in produits:
            return tag
        p = produits[produit]
        courantes = json.loads(attrs['data-apercu'])
        candidats = [v for v in p['variantes'] if courantes in [v['avant'], v['images'], *v.get('versions_precedentes', [])]]
        if not candidats or any(c['images'] != candidats[0]['images'] for c in candidats):
            raise ValueError((fichier, produit, 'Galerie inconnue', courantes))
        v = candidats[0]
        tag = champ(tag, 'data-apercu', json.dumps(v['images'], ensure_ascii=False, separators=(',', ':')))
        sous = attrs.get('data-apercu-sub', '')
        if re.search(r'pages? \d+', sous):
            if 'Blanco, page ' in sous:
                sous = re.sub(r'page \d+', f"page {v['pages'][0]}", sous)
            elif sous.startswith('Extraits du PDF vendu, pages '):
                sous = re.sub(r'pages [\d, ]+', 'pages ' + ', '.join(map(str, v['pages'])), sous)
            if sous != attrs.get('data-apercu-sub'):
                tag = champ(tag, 'data-apercu-sub', sous)
        comptes[produit] = comptes.get(produit, 0) + 1
        return tag
    texte = TAG.sub(bouton, texte)
    texte = actualiser_pages_cartes(texte, produits)
    images = catalogue['remplacements_images']
    motif = re.compile('|'.join(re.escape(s) + r'(?:\?v=[\w.-]+)?' for s in sorted(images, key=len, reverse=True)))
    def image(match):
        ref = images[match[0].split('?')[0]]
        p = produits[ref['produit']]
        return ref.get('image') or p['images'][p['pages_images'].index(ref['page'])]
    def repere_image(match):
        tag = match[0]
        src = attributs(tag).get('src', '').split('?')[0]
        produit = images.get(src, {}).get('produit')
        if not produit:
            produit = next((id for id in produits if f'lisibilite-20261107/{id}/' in src), None)
        if 'article-produit-inline__thumb' in attributs(tag).get('class', '') and produit in produits:
            vignette = produits[produit].get('vignette')
            if vignette:
                tag = champ(tag, 'src', vignette['image'])
        if src in images:
            numero = images[src]['page']
            tag = re.sub(r'([Pp]age )\d+', lambda m: m[1] + str(numero), tag)
        return tag
    texte = re.sub(r'<img\b[^>]*>', repere_image, texte)
    texte = motif.sub(image, texte)
    for produit, p in produits.items():
        c = p.get('comparaison_dol')
        if not c:
            continue
        texte = texte.replace(c['avant'], c['image'])
        if fichier in ('formations.html', 'droit-des-contrats-l2.html'):
            def bloc(match):
                b = match[0]
                if c['image'] not in b:
                    return b
                b = re.sub(r'page \d+ du PDF', f"page {c['page_pdf']} du PDF", b)
                b = re.sub(r'\d+ pages au total, extrait p\. \d+ du PDF', f"{p['pages_pdf']} pages au total, extrait p. {c['page_pdf']} du PDF", b)
                return b
            texte = re.sub(r'<div class="format-comparison__format">(?:(?!<div class="format-comparison__format">).)*?(?=<div class="format-comparison__format">|<p class="format-comparison__note">)', bloc, texte, flags=re.S)
    references = catalogue['decomptes'].get(fichier, {})
    if references:
        pattern = re.compile(r'\b(' + '|'.join(re.escape(n) for n in references) + r')(?= pages\b)')
        texte = pattern.sub(lambda m: str(references[m[0]]['pages']), texte)
    majeures = catalogue.get('decomptes_majeures', {}).get(fichier, {})
    if majeures:
        pattern = re.compile(r'\b(' + '|'.join(re.escape(n) for n in majeures) + r')(?= majeures\b)')
        texte = pattern.sub(lambda m: str(majeures[m[0]]['majeures']), texte)
    if fichier == 'majeures-preparees.html':
        def article(match):
            contenu = match[0]
            ids = [p for p in produits if p.startswith('maj-') and f'data-apercu-cta="{p}"' in contenu]
            if len(ids) == 1:
                p = produits[ids[0]]
                contenu, n = re.subn(r'\d+ pages</span>', f"{p['pages_pdf']} pages</span>", contenu)
                assert n == 1
                contenu, n = re.subn(r'\d+ majeures</span>', f"{p['majeures']} majeures</span>", contenu)
                assert n == 1
            return contenu
        texte = re.sub(r'<article\b.*?</article>', article, texte, flags=re.S)
    # The first count in these existing two-product sentences has no unit.
    for ids, pattern in [
        (['cours-fiche-constit-l1-s1', 'cours-fiche-constit-l1-s2'], r'(comptent )\d+( et )\d+( pages)'),
        (['fiche-contrats-l2-s1', 'fiche-obligations-l2-s2'], r'(compte )\d+( pages et celle du semestre 2 en compte )\d+(,)')]:
        if all(p in produits for p in ids) and fichier in ('fiche-revision-droit-constitutionnel-l1.html', 'fiche-revision-droit-des-obligations-l2.html'):
            texte = re.sub(pattern, lambda m: m[1] + str(produits[ids[0]]['pages_pdf']) + m[2] + str(produits[ids[1]]['pages_pdf']) + m[3], texte)
    for reference in catalogue.get('references_texte', []):
        if reference['fichier'] == fichier:
            texte = texte.replace(reference['avant'], reference['apres'])
    apres = galeries(texte)
    assert len(avant) == len(apres)
    for a, b in zip(avant, apres):
        p = a.get('data-apercu-cta')
        if p not in produits:
            assert a == b, (fichier, p)
        else:
            assert {k:v for k,v in a.items() if k not in ('data-apercu', 'data-apercu-sub')} == {k:v for k,v in b.items() if k not in ('data-apercu', 'data-apercu-sub')}, (fichier, p)
    return texte, comptes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--selection', type=Path)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--rapport', type=Path)
    args = parser.parse_args()
    catalogue = json.loads((args.selection or CATALOGUE).read_text())
    if args.render:
        assert args.manifest and args.write
        rendre(catalogue, json.loads(args.manifest.read_text()))
    for produit, p in catalogue['produits'].items():
        for image in p['images'] + ([p['vignette']['image']] if p.get('vignette') else []):
            cible = ROOT / image
            if not cible.is_file():
                raise ValueError((produit, 'Image absente', image))
            preuve = p.get('preuves_images', {}).get(image)
            if preuve:
                assert hashlib.sha256(cible.read_bytes()).hexdigest() == preuve['sha256_image'], image
    changes = {}
    totaux = {}
    for f in ROOT.glob('*.html'):
        avant = f.read_text()
        apres, comptes = actualiser(avant, f.name, catalogue)
        for produit, n in comptes.items():
            totaux[produit] = totaux.get(produit, 0) + n
        if avant != apres:
            changes[f.name] = hashlib.sha256(apres.encode()).hexdigest()
            if args.write:
                f.write_text(apres)
    assert set(catalogue['produits']) == set(totaux), set(catalogue['produits']) - set(totaux)
    if args.write:
        CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + '\n')
    resultat = {'produits': len(totaux), 'galeries': sum(totaux.values()), 'par_produit': totaux, 'fichiers': changes, 'ecriture': args.write}
    if args.rapport:
        args.rapport.write_text(json.dumps(resultat, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(resultat, ensure_ascii=False))


if __name__ == '__main__':
    main()
