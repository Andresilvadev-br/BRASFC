#!/usr/bin/env bash
# Prepara uma VPS Linux (Ubuntu/Debian) para o BRASFC — execute UMA vez, como root ou com sudo.
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/Andresilvadev-br/BRASFC/dev/deploy/bootstrap-vps.sh -o bootstrap.sh
#   sudo bash bootstrap.sh brasfc.seudominio.com.br seu-email@exemplo.com [staging.seudominio.com.br]
#
# O que faz: instala Docker, cria o usuário "deploy", baixa os arquivos de implantação,
# gera senhas fortes nos .env (só na VPS), sobe o Caddy (HTTPS) e a primeira versão do jogo.
set -euo pipefail

DOMAIN="${1:?informe o domínio de produção}"
EMAIL="${2:?informe o e-mail para o certificado HTTPS}"
STAGING="${3:-staging.localhost}"
DIR=/opt/brasfc
BRANCH="${BRASFC_BRANCH:-dev}"
RAW="https://raw.githubusercontent.com/Andresilvadev-br/BRASFC/$BRANCH"

[ "$(id -u)" -eq 0 ] || { echo "rode com sudo" >&2; exit 1; }

echo "▶ Verificando portas 80/443…"
if ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' | grep -vq docker; then
  echo "⚠ Algo já usa a porta 80/443 (Apache/Nginx do site antigo?)."
  echo "  Pare-o antes de continuar, ex.: systemctl disable --now apache2 nginx"
  ss -ltnp | grep -E ':(80|443)\s' || true
  exit 1
fi

echo "▶ Docker…"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

echo "▶ Usuário de deploy…"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -o deploy -g deploy "$DIR" "$DIR/deploy" "$DIR/deploy/caddy" "$DIR/backups"

echo "▶ Arquivos de implantação…"
for f in compose.yml deploy/deploy.sh deploy/backup.sh deploy/restore.sh deploy/env.example deploy/caddy/compose.yml deploy/caddy/Caddyfile; do
  curl -fsSL "$RAW/$f" -o "$DIR/$f"
done
chmod +x "$DIR"/deploy/*.sh

gen() { openssl rand -base64 36 | tr -d '/+=' | cut -c1-40; }
for env in producao staging; do
  file="$DIR/deploy/.env.$env"
  [ -f "$file" ] && continue
  origin="https://$DOMAIN"; [ "$env" = staging ] && origin="https://$STAGING"
  cat > "$file" <<EOF
POSTGRES_PASSWORD=$(gen)
ORIGIN=$origin
BRASFC_IMAGE=ghcr.io/andresilvadev-br/brasfc
EOF
  chmod 600 "$file"
done
cat > "$DIR/deploy/.env.caddy" <<EOF
BRASFC_DOMAIN=$DOMAIN
BRASFC_STAGING_DOMAIN=$STAGING
ACME_EMAIL=$EMAIL
EOF
chown -R deploy:deploy "$DIR"

echo "▶ Rede e proxy HTTPS…"
docker network inspect brasfc-edge >/dev/null 2>&1 || docker network create brasfc-edge
cd "$DIR"
docker compose -f deploy/caddy/compose.yml --env-file deploy/.env.caddy up -d

echo "▶ Backup diário às 04:15…"
( crontab -u deploy -l 2>/dev/null | grep -v backup.sh; echo "15 4 * * * cd $DIR && ENV_NAME=producao deploy/backup.sh >> backups/backup.log 2>&1" ) | crontab -u deploy -

echo "▶ Firewall (se o ufw existir)…"
if command -v ufw >/dev/null; then ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp; ufw --force enable; fi

cat <<EOF

✅ Servidor preparado.

Próximos passos:
 1. Crie a chave de deploy do GitHub (rode como root):
      sudo -u deploy ssh-keygen -t ed25519 -N '' -f /home/deploy/.ssh/github_deploy
      sudo -u deploy sh -c 'cat /home/deploy/.ssh/github_deploy.pub >> /home/deploy/.ssh/authorized_keys'
      cat /home/deploy/.ssh/github_deploy        # → secret VPS_SSH_KEY
      ssh-keyscan -H $(hostname -I | awk '{print $1}')   # → secret VPS_KNOWN_HOSTS
 2. No GitHub: secrets VPS_HOST=$(hostname -I | awk '{print $1}'), VPS_USER=deploy, VPS_SSH_KEY, VPS_KNOWN_HOSTS
    e variável PUBLIC_URL=https://$DOMAIN (veja docs/DEPLOY.md).
 3. Faça um push na branch dev/main: o GitHub Actions publica o jogo.
EOF
