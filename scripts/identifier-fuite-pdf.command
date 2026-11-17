#!/bin/zsh
set -euo pipefail

dossier_script="${0:A:h}"
racine_site="${dossier_script:h}"

if (( $# == 0 )); then
  pdf_suspect="$(osascript -e 'POSIX path of (choose file with prompt "Choisis le PDF ou la photo de la page" of type {"com.adobe.pdf", "public.jpeg", "public.png"})')"
  set -- "$pdf_suspect"
fi

exec uv run \
  --project "$racine_site" \
  --with "pymupdf==1.28.2" \
  --with "pillow==12.3.0" \
  --with "python-dotenv==1.2.3" \
  python "$dossier_script/identifier-fuite-pdf.py" "$@"
