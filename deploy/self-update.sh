#!/usr/bin/env bash
# Atualização automática SEM chaves nem secrets: a VPS acompanha a branch do GitHub,
# baixa a imagem pronta do GitHub (ou constrói localmente) e publica com verificação de saúde e retorno automático.
#
# Instalar (uma vez, como root):
#   curl -fsSL https://raw.githubusercontent.com/Andresilvadev-br/BRASFC/dev/deploy/self-update.sh | bash -s -- --install
#
# Depois disso, a cada minuto a VPS verifica se há commits novos e atualiza sozinha.
# Log: /opt/brasfc/backups/self-update.log
set -euo pipefail

DIR=/opt/brasfc
SRC="$DIR/src"
REPO="https://github.com/Andresilvadev-br/BRASFC.git"
BRANCH="${BRASFC_BRANCH:-dev}"
ENV_NAME="${BRASFC_DEPLOY_ENV:-producao}"
LOG="$DIR/backups/self-update.log"
GHCR="ghcr.io/andresilvadev-br/brasfc"

if [ "${1:-}" = "--install" ]; then
	[ "$(id -u)" -eq 0 ] || { echo "rode como root" >&2; exit 1; }
	[ -f "$DIR/deploy/.env.$ENV_NAME" ] || { echo "rode antes o bootstrap-vps.sh" >&2; exit 1; }
	command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }
	command -v flock >/dev/null || apt-get install -y -qq util-linux
	command -v crontab >/dev/null || { apt-get install -y -qq cron && systemctl enable --now cron; }
	curl -fsSL "https://raw.githubusercontent.com/Andresilvadev-br/BRASFC/$BRANCH/deploy/self-update.sh" -o "$DIR/deploy/self-update.sh"
	chmod +x "$DIR/deploy/self-update.sh"
	chown -R deploy:deploy "$DIR"
	CURRENT="$(crontab -u deploy -l 2>/dev/null || true)"
	{ printf '%s\n' "$CURRENT" | grep -v 'self-update.sh' | grep -v '^$' || true
	  echo "* * * * * flock -n /tmp/brasfc-update.lock $DIR/deploy/self-update.sh >> $LOG 2>&1"; } | crontab -u deploy -
	echo "▶ Primeira publicação (leva alguns minutos na primeira vez)…"
	sudo -u deploy flock /tmp/brasfc-update.lock "$DIR/deploy/self-update.sh" 2>&1 | tee -a "$LOG"
	exit "${PIPESTATUS[0]}"
fi

stamp() { date -u '+%Y-%m-%d %H:%M:%S'; }

# Instalações antigas verificavam a cada 5 minutos; passa a verificar a cada minuto.
if crontab -l 2>/dev/null | grep -q '^\*/5 .*self-update.sh'; then
	crontab -l 2>/dev/null | sed 's#^*/5 #* #' | crontab - || true
fi

if [ ! -d "$SRC/.git" ]; then
	git clone --quiet --branch "$BRANCH" "$REPO" "$SRC"
fi
cd "$SRC"
git fetch --quiet origin "$BRANCH"
REMOTE="$(git rev-parse "origin/$BRANCH")"
SHA="${REMOTE:0:12}"
TAG="sha-$SHA"
CURRENT_TAG="$(cat "$DIR/deploy/.current-tag.$ENV_NAME" 2>/dev/null || true)"

if [ "$CURRENT_TAG" = "$TAG" ] && docker ps --format '{{.Names}}' | grep -q "^brasfc-$ENV_NAME-app-1$"; then
	exit 0 # já está na versão mais nova
fi

echo "[$(stamp)] nova versão $TAG (atual: ${CURRENT_TAG:-nenhuma})"
git checkout --quiet --force "$REMOTE"

# Atualiza os arquivos de implantação a partir do repositório.
cp compose.yml "$DIR/compose.yml"
# Troca atômica (mv): este próprio script está em execução e não pode ser sobrescrito no lugar.
for f in deploy/*.sh deploy/env.example; do
	cp "$f" "$DIR/deploy/.novo" && mv -f "$DIR/deploy/.novo" "$DIR/deploy/$(basename "$f")"
done
cp deploy/caddy/* "$DIR/deploy/caddy/"
chmod +x "$DIR"/deploy/*.sh

# Caminho rápido: o GitHub Actions já publica a imagem pronta (pública) em ~3 min após o push.
# Baixar leva segundos; construir na VPS leva vários minutos. Só constrói aqui se o GitHub não publicou.
if docker pull --quiet "$GHCR:$TAG" >/dev/null 2>&1; then
	echo "[$(stamp)] imagem pronta baixada do GitHub ($GHCR:$TAG)"
	docker tag "$GHCR:$TAG" "brasfc-local:$TAG"
elif [ $(( $(date +%s) - $(git log -1 --format=%ct "$REMOTE") )) -lt 900 ]; then
	echo "[$(stamp)] aguardando o GitHub publicar a imagem de $TAG"
	exit 0
else
	echo "[$(stamp)] imagem não publicada pelo GitHub; construindo na VPS…"
	docker build --quiet --build-arg GIT_SHA="$REMOTE" -t "brasfc-local:$TAG" . >/dev/null
fi

BRASFC_IMAGE=brasfc-local BRASFC_SKIP_PULL=1 "$DIR/deploy/deploy.sh" "$ENV_NAME" "$TAG"

# Recarrega o proxy caso o Caddyfile tenha mudado.
docker compose -f "$DIR/deploy/caddy/compose.yml" --env-file "$DIR/deploy/.env.caddy" up -d >/dev/null 2>&1 || true
docker exec brasfc-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

# Mantém só as 3 imagens locais mais recentes.
docker images brasfc-local --format '{{.Tag}}' | tail -n +4 | xargs -r -I{} docker rmi "brasfc-local:{}" >/dev/null 2>&1 || true
echo "[$(stamp)] publicado $TAG"
