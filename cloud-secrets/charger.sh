#!/usr/bin/env bash
# Déchiffre les clés (env.enc) à la racine du dépôt courant et les exporte.
# Usage dans une session cloud : source cloud-secrets/charger.sh
# Nécessite CLOUD_SECRETS_KEY dans les réglages de l'environnement cloud (session ouverte après l'enregistrement).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; RACINE="$(cd "$DIR/.." && pwd)"
[ -z "$CLOUD_SECRETS_KEY" ] && { echo "CLOUD_SECRETS_KEY absente : ouvrir une nouvelle session après l'enregistrement de l'environnement" >&2; return 1 2>/dev/null || exit 1; }
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$DIR/env.enc" -pass env:CLOUD_SECRETS_KEY -out "$RACINE/.env.cloud" || { return 1 2>/dev/null || exit 1; }
mkdir -p "$RACINE/.secrets-vault"
grep -E '^(R2_|TP_R2_)' "$RACINE/.env.cloud" > "$RACINE/.secrets-vault/cloudflare-r2.env"
touch "$RACINE/.env"
grep -vE '^#' "$RACINE/.env.cloud" | while IFS= read -r l; do grep -qxF "$l" "$RACINE/.env" || echo "$l" >> "$RACINE/.env"; done
set -a; . "$RACINE/.env.cloud"; set +a
echo "Clés chargées : $(grep -c '=' "$RACINE/.env.cloud")"
