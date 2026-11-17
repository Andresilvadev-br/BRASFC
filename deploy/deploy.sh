#!/usr/bin/env bash
# Publica uma versão do BRASFC na VPS com verificação de saúde e retorno automático.
# Uso (na VPS):  deploy/deploy.sh <producao|staging> <tag-da-imagem>
# Executado pelo GitHub Actions via SSH, ou manualmente.
set -euo pipefail

ENV_NAME="${1:?informe o ambiente: producao ou staging}"
TAG="${2:?informe a tag da imagem (ex.: sha-abc1234)}"
case "$ENV_NAME" in producao|staging) ;; *) echo "ambiente inválido: $ENV_NAME" >&2; exit 2 ;; esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/.env.$ENV_NAME"
STATE_FILE="$ROOT/deploy/.current-tag.$ENV_NAME"
[ -f "$ENV_FILE" ] || { echo "arquivo $ENV_FILE não encontrado (copie de deploy/env.example)" >&2; exit 2; }

compose() { BRASFC_ENV="$ENV_NAME" BRASFC_TAG="$1" docker compose -f "$ROOT/compose.yml" --env-file "$ENV_FILE" "${@:2}"; }

PREVIOUS="$(cat "$STATE_FILE" 2>/dev/null || true)"
echo "▶ $ENV_NAME: $PREVIOUS → $TAG"

docker network inspect brasfc-edge >/dev/null 2>&1 || docker network create brasfc-edge

# Backup antes de qualquer migração (apenas se o banco já existir).
if compose "${PREVIOUS:-$TAG}" ps --status running db 2>/dev/null | grep -q db; then
  ENV_NAME="$ENV_NAME" "$ROOT/deploy/backup.sh" || echo "⚠ backup falhou; seguindo com cautela"
fi

compose "$TAG" pull app
compose "$TAG" up -d --remove-orphans

echo "⏳ aguardando /api/health…"
for i in $(seq 1 30); do
  if compose "$TAG" exec -T app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "$TAG" > "$STATE_FILE"
    echo "✅ $ENV_NAME saudável na versão $TAG"
    docker image prune -f >/dev/null || true
    exit 0
  fi
  sleep 3
done

echo "❌ versão $TAG não ficou saudável." >&2
compose "$TAG" logs --tail 80 app >&2 || true
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$TAG" ]; then
  echo "↩ retornando para $PREVIOUS" >&2
  compose "$PREVIOUS" up -d
fi
exit 1
