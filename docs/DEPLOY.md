# Implantação, atualização e recuperação

Tudo está automatizado, mas **ainda não há VPS, domínio nem credenciais configurados** — nenhum deploy público foi feito. Para ativar, siga os passos abaixo.

## O que é necessário (você fornece)

| Item | Para quê |
| --- | --- |
| VPS Linux (Ubuntu 24.04 recomendado), 4 GB RAM | servidor |
| Domínio (ex.: `brasfc.seudominio.com.br`) e, opcional, `staging.…` apontando (registro A) para o IP da VPS | HTTPS |
| E-mail para o Let's Encrypt | certificados |
| Usuário SSH com permissão no Docker e uma **chave de deploy** | GitHub Actions |

## 1. Preparar a VPS (uma vez)

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
sudo usermod -aG docker $USER && sudo mkdir -p /opt/brasfc && sudo chown $USER /opt/brasfc
```

```bash
docker network create brasfc-edge
```

Crie os arquivos de ambiente **na VPS** (nunca no repositório), a partir de `deploy/env.example`:

- `/opt/brasfc/deploy/.env.producao` e `/opt/brasfc/deploy/.env.staging` — `POSTGRES_PASSWORD` (gere com `openssl rand -base64 32`), `ORIGIN`, `BRASFC_IMAGE`.
- `/opt/brasfc/deploy/.env.caddy` — `BRASFC_DOMAIN`, `BRASFC_STAGING_DOMAIN`, `ACME_EMAIL`.

Suba o proxy (depois do primeiro envio de arquivos pelo Actions, ou copiando `deploy/caddy` manualmente):

```bash
cd /opt/brasfc && docker compose -f deploy/caddy/compose.yml --env-file deploy/.env.caddy up -d
```

## 2. Configurar o GitHub

Settings → Environments: crie `staging` e `producao` (em `producao`, ative *Required reviewers*).

Secrets (por ambiente ou do repositório):

| Secret | Valor |
| --- | --- |
| `VPS_HOST` | IP ou host da VPS |
| `VPS_USER` | usuário SSH |
| `VPS_SSH_KEY` | chave privada de deploy |
| `VPS_KNOWN_HOSTS` | saída de `ssh-keyscan SEU_HOST` |

Variables: `PUBLIC_URL` (ex.: `https://brasfc.seudominio.com.br`) e, opcional, `VPS_DIR` (padrão `/opt/brasfc`).

## 3. Fluxo de publicação

1. Push em `dev` → CI (tipos, testes, build, smoke test do servidor, build Docker) → imagem `ghcr.io/andresilvadev-br/brasfc:sha-…` → deploy em **staging**.
2. Merge em `main` → mesmo processo → aprovação manual → **produção**.
3. `deploy/deploy.sh` faz backup do banco, sobe a nova imagem, espera `/api/health` e **volta automaticamente à versão anterior** se a nova não ficar saudável.

Sem os secrets, o workflow publica a imagem e avisa que o deploy foi ignorado — nunca finge sucesso.

Jogadores conectados recebem o aviso "Nova versão do BRASFC" e atualizam quando quiserem; alterações não salvas são protegidas.

## Backups

Automático antes de cada deploy. Agende também um diário (cron da VPS):

```bash
crontab -e
```

```
15 4 * * * cd /opt/brasfc && ENV_NAME=producao deploy/backup.sh >> backups/backup.log 2>&1
```

Arquivos em `/opt/brasfc/backups/<ambiente>/`, retenção de 14 dias (`KEEP_DAYS`). **Copie periodicamente para fora da VPS** (ex.: `rclone` para um storage externo).

## Recuperação

Restaurar um backup (faz uma cópia do estado atual antes):

```bash
cd /opt/brasfc && deploy/restore.sh producao backups/producao/brasfc-producao-AAAAMMDD-HHMMSS.sql.gz
```

Voltar para uma versão anterior da aplicação:

```bash
cd /opt/brasfc && deploy/deploy.sh producao sha-<commit-anterior>
```

Conferir a saúde:

```bash
curl -s https://brasfc.seudominio.com.br/api/health
```

Logs:

```bash
docker logs --tail 200 brasfc-producao-app-1
```

## Uso de memória previsto (VPS 4 GB)

App ≤ 512 MB (heap Node 384 MB), PostgreSQL ≤ 512 MB, Caddy ≤ 128 MB por ambiente. Produção + staging ficam em ~2,3 GB no pior caso.
