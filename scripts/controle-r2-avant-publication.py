import concurrent.futures
import contextlib
import io
import json
import os
import re
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

import boto3
from botocore.config import Config

BUCKET_PDF_PRIVES = os.environ.get("R2_PERSONNALISES_BUCKET", "trajectoiredroit-pdf-personnalises")

def parser_produits(site_dir):
    produits_js = site_dir / "api" / "_produits.js"
    if not produits_js.exists():
        print(f"ATTENTION : {produits_js} introuvable, volet produits sauté.")
        return []
    content = produits_js.read_text(encoding="utf-8")
    urls = re.findall(r'(?:https://|r2://tjd/)[^\s"\'\]]+\.(?:pdf|zip|apkg)', content)
    return sorted(set(urls))


def parser_liens_internes(site_dir, base_url):
    liens = set()
    for html_file in site_dir.glob("*.html"):
        content = html_file.read_text(encoding="utf-8", errors="ignore")
        for href in re.findall(r'href=["\']([^"\']+)["\']', content):
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#", "javascript:")):
                if base_url and href.startswith(base_url):
                    liens.add(href)
                continue
            liens.add(urljoin(base_url + "/", href))
    return sorted(liens)


def redirects_vercel(site_dir):
    config = site_dir / "vercel.json"
    if not config.exists():
        return set()
    try:
        donnees = json.loads(config.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    return {r.get("source") for r in donnees.get("redirects", []) if r.get("source")}


def verifier_liens_locaux(urls, site_dir):
    print(f"\n=== Liens internes du site ({len(urls)} URLs) ===")
    redirections = redirects_vercel(site_dir)
    problemes = []
    for url in urls:
        chemin_url = unquote(urlparse(url).path)
        relatif = chemin_url.lstrip("/")
        if not relatif:
            candidats = [site_dir / "index.html"]
        elif chemin_url.endswith("/"):
            candidats = [site_dir / relatif / "index.html"]
        else:
            candidats = [site_dir / relatif, site_dir / f"{relatif}.html"]
        if chemin_url not in redirections and not any(p.is_file() for p in candidats):
            problemes.append((url, "CIBLE LOCALE ABSENTE"))
            print(f"  CASSE [CIBLE LOCALE ABSENTE] {url}")
    if not problemes:
        print(f"  OK, {len(urls)} liens pointent vers un fichier ou une redirection déployable.")
    return problemes




def main():
    root = Path.cwd()
    references = parser_produits(root)
    if not references or any(not value.startswith("r2://tjd/") for value in references):
        raise SystemExit("Le catalogue contient des références qui exigent un autre contrôle.")
    links = parser_liens_internes(root, "https://trajectoiredroit.com")
    with contextlib.redirect_stdout(io.StringIO()):
        invalid_links = verifier_liens_locaux(links, root)
    if invalid_links:
        raise SystemExit(f"{len(invalid_links)} liens internes nécessitent une correction.")

    account = os.environ.get("R2_ACCOUNT_ID")
    access_id = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    if not all((account, access_id, secret)):
        raise SystemExit("L’accès au stockage privé manque dans cet aperçu.")

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=access_id,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(signature_version="s3v4", connect_timeout=6, read_timeout=8,
                      retries={"mode": "standard", "max_attempts": 2}),
    )

    def exists(reference):
        try:
            result = client.head_object(Bucket=BUCKET_PDF_PRIVES, Key="sources/" + reference.removeprefix("r2://"))
            return result.get("ContentLength", 0) > 0
        except Exception:
            return False

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        missing = sum(not present for present in executor.map(exists, references))
    if missing:
        raise SystemExit(f"Le contrôle du stockage a échoué pour {missing} fichiers.")
    print(f"Contrôle validé pour {len(references)} fichiers privés et {len(links)} liens internes.")


if __name__ == "__main__":
    main()
