# BRASFC

Simulador brasileiro de futebol com **Carreira de Treinador** e **Carreira de Jogador**, multiplayer e identidade visual premium — a simplicidade do Brasfoot com a apresentação de um jogo moderno.

> Versão atual: **Dev 0.2 (motor de futebol e partidas 2D)**. Relatórios: [Dev 0.2](RELATORIO-DEV-0.2.md) · [Etapa 1](RELATORIO-ETAPA-1.md).

## Rodar localmente (com HMR)

Pré-requisito: Node.js 22.12+ (recomendado 24, ver `.nvmrc`). Docker **não** é necessário para desenvolver.

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:5173. Sem `DATABASE_URL`, o servidor usa **PGlite** (PostgreSQL compilado para WebAssembly) e guarda os dados em `./data/pglite`. As mesmas migrações rodam no PostgreSQL de produção.

Para usar um PostgreSQL real, copie `.env.example` para `.env` e defina `DATABASE_URL`.

## Verificações

```bash
npm run verify
```

Executa `svelte-check` (tipos), os testes (`vitest`) e o build de produção. Para testar o servidor de produção rodando:

```bash
npm run build && BRASFC_ALLOW_PGLITE=1 ORIGIN=http://127.0.0.1:3000 npm start
```

```bash
node scripts/smoke.mjs http://127.0.0.1:3000
```

Calibração do motor (estatísticas de muitas partidas):

```bash
node scripts/engine-stats.ts 200 --taticas
```

## Documentação

- [Arquitetura](docs/ARQUITETURA.md) — módulos, dados, tempo real, segurança.
- [Motor de futebol](docs/MOTOR.md) — simulação, táticas, calibração e reprodução autoritativa.
- [Dados Brasil 2026](docs/DADOS.md) — fontes, pendências, validador e correções.
- [Ultra Motion X](docs/ULTRA-MOTION-X.md) — integração, compatibilidade e limitações.
- [Implantação e recuperação](docs/DEPLOY.md) — VPS, Docker, Caddy, CI/CD, backups.
- [Novidades](CHANGELOG.md)

## Branches

- `dev` — versões experimentais (publica no ambiente **staging**).
- `main` — versões estáveis (publica em **produção**, com aprovação).
