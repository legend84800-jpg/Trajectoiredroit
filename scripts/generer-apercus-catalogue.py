#!/usr/bin/env python3
"""Rend les pages choisies des quatre PDF dans leur version vérifiée."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf-root", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(subprocess.check_output([
        "node", "-e", "console.log(JSON.stringify(require('./scripts/catalogue-presentations').APERCUS))"
    ], cwd=ROOT))
    target = ROOT / "assets/apercus/catalogue-20261029"
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tjd-apercus-") as temporary:
        for item in data:
            source = args.pdf_root / item["fichier"]
            if hashlib.sha256(source.read_bytes()).hexdigest() not in {item["sha256"], item.get("sha256R2")}:
                raise ValueError(f"La version du PDF a changé, {item['fichier']}")
            for page in item["pages"]:
                output = Path(temporary) / f"{item['id']}-{page}"
                subprocess.run([
                    "pdftoppm", "-f", str(page), "-l", str(page), "-singlefile",
                    "-scale-to", "1800", "-png", str(source), str(output)
                ], check=True, capture_output=True)
                image = Image.open(output.with_suffix(".png")).convert("RGB")
                destination = target / f"{item['id']}-p{page:03d}.webp"
                image.save(destination, "WEBP", quality=88, method=6)
                print(f"{destination.relative_to(ROOT)} · page {page} · {image.width} × {image.height}")


if __name__ == "__main__":
    main()
