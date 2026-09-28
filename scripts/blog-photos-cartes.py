#!/usr/bin/env python3
"""Pose les photos du blog : assets/blog/<slug>.webp dans la carte de blog.html et en og:image de l'article.

Usage : python3 scripts/blog-photos-cartes.py <dossier_png> ; chaque PNG s'appelle <slug-article>.png.
Idempotent. Lancer depuis n'importe où.
"""
import re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1])
blog = (ROOT / "blog.html").read_text()
for png in sorted(src.glob("*.png")):
    slug = png.stem
    art = ROOT / f"{slug}.html"
    if not art.exists():
        print("article introuvable", slug); continue
    out = ROOT / "assets/blog" / f"{slug}.webp"
    im = Image.open(png).convert("RGB")
    w, h = im.size; th = round(w * 9 / 16)
    if th < h: im = im.crop((0, (h - th) // 2, w, (h - th) // 2 + th))
    im.resize((1200, 675), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
    im.resize((640, 360), Image.LANCZOS).save(out.with_name(f"{slug}-640.webp"), "WEBP", quality=78, method=6)
    # Carte du blog
    pat = re.compile(r'(<a href="%s" aria-hidden="true" tabindex="-1" class="post-card__media)([^"]*)(">)(.*?)(</a>)' % re.escape(art.name), re.S)
    m = pat.search(blog)
    if m:
        classes = m.group(2) if "post-card__media--photo" in m.group(2) else m.group(2) + " post-card__media--photo"
        inner = re.sub(r'\s*<img class="post-card__photo"[^>]*>', "", m.group(4))
        img = (f'\n              <img class="post-card__photo" src="assets/blog/{slug}-640.webp" '
               f'srcset="assets/blog/{slug}-640.webp 640w, assets/blog/{slug}.webp 1200w" sizes="(max-width: 700px) 100vw, 400px" '
               f'alt="" width="640" height="360" loading="lazy" decoding="async">')
        blog = blog[:m.start()] + m.group(1) + classes + m.group(3) + img + inner + m.group(5) + blog[m.end():]
    # og:image et twitter:image de l'article
    a = art.read_text()
    url = f"https://trajectoiredroit.com/assets/blog/{slug}.webp"
    a = re.sub(r'(<meta property="og:image" content=")[^"]*(")', r'\g<1>%s\2' % url, a)
    a = re.sub(r'(<meta name="twitter:image" content=")[^"]*(")', r'\g<1>%s\2' % url, a)
    art.write_text(a)
    print("ok", slug, "carte" if m else "SANS CARTE")
(ROOT / "blog.html").write_text(blog)
