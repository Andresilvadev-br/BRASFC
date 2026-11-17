#!/usr/bin/env bash
# Restaura um backup do BRASFC. ATENÇÃO: substitui os dados atuais do ambiente.
# Uso: deploy/restore.sh <producao|staging> <arquivo.sql.gz>
set -euo pipefail

ENV_NAME="${1:?ambiente}"
FILE="${2:?arquivo .sql.gz}"
[ -f "$FILE" ] || { echo "arquivo não encontrado: $FILE" >&2; exit 2; }
gzip -t "$FILE"

read -r -p "Restaurar $FILE em $ENV_NAME? Os dados atuais serão substituídos. Digite RESTAURAR: " ok
[ "$ok" = "RESTAURAR" ] || { echo "cancelado"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_NAME="$ENV_NAME" "$ROOT/deploy/backup.sh"   # cópia de segurança do estado atual
docker stop "brasfc-$ENV_NAME-app-1" || true
gunzip -c "$FILE" | docker exec -i "brasfc-$ENV_NAME-db-1" psql -v ON_ERROR_STOP=1 -U brasfc -d brasfc
docker start "brasfc-$ENV_NAME-app-1"
echo "✅ restaurado. Verifique: curl -s https://SEU_DOMINIO/api/health"
