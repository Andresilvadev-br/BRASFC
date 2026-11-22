# Implantação, atualização e recuperação

Este documento descreve os métodos de implantação e a configuração necessária. Consulte o resumo de cada execução do Actions e confira o commit em `/api/health` para verificar a versão do site.

## O que é necessário (você fornece)

| Item | Para quê |
| --- | --- |
| VPS Linux (Ubuntu 24.04 recomendado), 4 GB RAM | servidor |
| Domínio (ex.: `brasfc.seudominio.com.br`) e, opcional, `staging.…` apontando (registro A) para o IP da VPS | HTTPS |
| E-mail para o Let's Encrypt | certificados |
| Usuário SSH com permissão no Docker e uma **chave de deploy** | GitHub Actions |

## Atalho: preparar a VPS com um comando

Na VPS, como root (troque domínio e e-mail):

```bash
curl -fsSL https://raw.githubusercontent.com/Andresilvadev-br/BRASFC/dev/deploy/bootstrap-vps.sh -o bootstrap.sh && sudo bash bootstrap.sh brasfc.seudominio.com.br seu-email@exemplo.com
```

O script instala o Docker, cria o usuário `deploy`, gera senhas fortes nos `.env` (só na VPS), sobe o Caddy com HTTPS, agenda o backup diário e mostra como criar a chave para o GitHub. Ele se recusa a continuar se outro serviço (ex.: Apache/Nginx de um site antigo) estiver usando as portas 80/443.

## Atualização automática sem chaves (recomendado para começar)

Depois do bootstrap, na VPS, como root:

```bash
curl -fsSL https://raw.githubusercontent.com/Andresilvadev-br/BRASFC/dev/deploy/self-update.sh | bash -s -- --install
```

A VPS passa a verificar a branch `dev` a cada 5 minutos: se houver commit novo, constrói a imagem localmente e publica com backup, verificação de saúde e retorno automático. Não precisa de secrets no GitHub. Log em `/opt/brasfc/backups/self-update.log`.

O deploy via GitHub Actions (abaixo) continua disponível como alternativa.

## 1. Preparar a VPS manualmente (alternativa)

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

Variáveis por ambiente:

| Variável | Valor |
| --- | --- |
| `DEPLOY_METHOD` | `ssh` para executar a implantação pelo Actions, `self-update` para confirmar o atualizador instalado na VPS ou `image-only` para publicar só a imagem de staging. Sem valor, o job usa SSH quando as quatro credenciais estão presentes. |
| `PUBLIC_URL` | URL que responde a `/api/health`. Obrigatória em produção e no método `self-update`. |
| `VPS_DIR` | Diretório usado pelo SSH. Padrão `/opt/brasfc`. |

## 3. Fluxo de publicação

1. Push em `dev` → CI (tipos, testes, build, smoke test do servidor, build Docker) → imagem `ghcr.io/andresilvadev-br/brasfc:sha-…` → deploy em **staging**.
2. Merge em `main` → mesmo processo → aprovação manual → **produção**.
3. `deploy/deploy.sh` faz backup do banco, sobe a nova imagem, espera `/api/health` e **volta automaticamente à versão anterior** se a nova não ficar saudável.

O resumo indica separadamente CI, publicação da imagem, instalação e confirmação do commit saudável na URL pública. Produção exige um método de implantação válido e a URL deve responder com o commit desse workflow. Quando a VPS usa o atualizador, confirme que seu serviço acompanha `main` para produção e `dev` para staging. A configuração do serviço é administrada na VPS. Uma falha de backup cancela a instalação antes que a candidata possa executar migrações.

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


## Atualização automática (Dev 0.4)

- **Por que o site parou na 0.1.0:** a regra `data/` do `.gitignore` também ignorava `src/lib/data/` (base Brasil 2026). O CI falhava na verificação de tipos e a VPS não conseguia montar a imagem. Corrigido para `/data/`.
- A VPS verifica a branch a cada minuto, **baixa a imagem pronta do GitHub** (registro público, verificada pelo digest, que vai para o log) e só monta localmente se a imagem não existir após 15 minutos.
- Antes de publicar: backup do banco (`deploy.sh`); depois: verificação de saúde e retorno automático à versão anterior se falhar.
- Uma versão que falhou não é tentada de novo a cada minuto (`.failed-tag`); um commit novo libera.
- Estado da última implantação: `/opt/brasfc/backups/deploy-status.json`. Aviso opcional: crie `/opt/brasfc/deploy/.env.notify` com `DEPLOY_WEBHOOK_URL=...` (Discord, Slack, ntfy) — nada disso vai para o repositório.
- O botão **Atualizar agora** da Central de Atualizações troca só o cliente (navegador/PWA) para a versão já publicada; ele nunca executa comandos na VPS.

## Aplicativo para Windows (Dev 0.4.1)

- Código em `desktop/` (Electron). O app abre o site oficial (`BRASFC_URL` para testar outro endereço), então o JOGO se atualiza pelo servidor como sempre; a casca se atualiza sozinha pelo GitHub Releases (`electron-updater`).
- Workflow `.github/workflows/desktop.yml`: nos PRs de integração e nas publicações Windows, roda o autoteste da janela e valida a atualização a partir da release atual, com save e recuperação de falhas. Uma publicação com versão inédita empacota os mesmos arquivos testados e só então os entrega ao GitHub Releases. Para lançar outra versão do app, aumente `version` em `desktop/package.json`.
- O botão de download consulta `/api/desktop`, que só devolve link quando a release tem o instalador.
- Teste local: `cd desktop && npm ci && npx electron . --selftest` (imprime `SELFTEST {...}` e sai com 0 se a janela abriu centralizada e entrou/saiu da tela cheia). Instalador local: `npm run dist`.

### Modo offline (app 1.1.0)

- O app tem dois modos, escolhidos em **Configurações → Janela e aplicativo** ou no indicador **Online/Offline** da barra da janela; sem internet, a tela de erro oferece **Jogar offline**. O app lembra o último modo.
- **Offline**: o jogo completo (o mesmo servidor do site, `build/` + `server/`) roda dentro do app em `http://127.0.0.1:47615` (outra porta se estiver ocupada), com banco PGlite em `%APPDATA%/BRASFC/saves/pglite`. Nada sai do computador. O banco é fechado com segurança ao sair.
- As carreiras online (servidor) e offline (computador) são separadas. No offline não há multiplayer.
- O jogo offline é empacotado no instalador por `desktop/scripts/prepare-offline.mjs` (o CI roda `npm ci && npm run build` na raiz e depois o script com `--install`), em `resources/app-offline` (o script monta em `desktop/offline/app-offline`: o electron-builder descarta o `node_modules` da raiz de um recurso extra, então o jogo fica uma pasta abaixo). Ele só muda quando sai um novo instalador: para levar uma versão nova do jogo ao offline, aumente `version` em `desktop/package.json`.
- Teste local do offline sem instalador: `npm run build && node desktop/scripts/prepare-offline.mjs --install && cd desktop && npx electron .`
- O instalador ainda não tem assinatura digital paga: o SmartScreen pode pedir confirmação na primeira execução.
