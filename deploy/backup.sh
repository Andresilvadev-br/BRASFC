#!/usr/bin/env bash
# Backup do PostgreSQL do BRASFC (pg_dump compactado) com retenção.
# Uso: ENV_NAME=producao deploy/backup.sh      (agende no cron, ver docs/DEPLOY.md)
set -euo pipefail

ENV_NAME="${ENV_NAME:-producao}"
KEEP_DAYS="${KEEP_DAYS:-14}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/backups/$ENV_NAME"
mkdir -p "$DIR"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$DIR/brasfc-$ENV_NAME-$STAMP.sql.gz"
CONTAINER="brasfc-$ENV_NAME-db-1"

docker exec "$CONTAINER" pg_dump -U brasfc -d brasfc --no-owner --clean --if-exists | gzip -9 > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
gzip -t "$FILE"
echo "💾 backup: $FILE ($(du -h "$FILE" | cut -f1))"

find "$DIR" -name 'brasfc-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
