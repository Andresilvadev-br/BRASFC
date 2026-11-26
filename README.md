# BRASFC

Simulador brasileiro de futebol para **Windows**, 100% offline: carreira de treinador individual ou com **vários treinadores no mesmo computador, em turnos** — a simplicidade do Brasfoot, a profundidade do BRASFC e a fluidez do Ultra Motion X.

> Versão do jogo em [package.json](package.json) e do aplicativo em [desktop/package.json](desktop/package.json).
>
> **0.13 LOCAL LEGACY:** o aplicativo (`desktop/`) roda o jogo embutido (servidor SvelteKit em `127.0.0.1` + save PGlite na pasta do usuário) e nunca abre o site. O site público (VPS) só apresenta e distribui o jogo: fora do app (`BRASFC_OFFLINE=1`), do `vite dev` ou de `BRASFC_GAME=1`, as rotas do jogo redirecionam para `/` e a API responde 410. A internet é usada só para baixar e atualizar o app.

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
npm run build && BRASFC_OFFLINE=1 BRASFC_ALLOW_PGLITE=1 ORIGIN=http://127.0.0.1:3000 npm start
```

(sem `BRASFC_OFFLINE=1` o mesmo build sobe como site público; o smoke test reconhece os dois modos)

```bash
node scripts/smoke.mjs http://127.0.0.1:3000
```

Calibração do motor (estatísticas de muitas partidas):

```bash
node scripts/engine-stats.ts 200 --taticas
node scripts/engine-balance.ts 30      # estilos × estilos
node scripts/engine-formations.ts 40   # formações × 4-3-3
node scripts/engine-mastery.ts 160     # efeito do domínio tático
node scripts/season-sim.ts             # temporada completa A/B/C
```

Capturas reais das telas (com o servidor rodando): `node scripts/capturas.mjs http://localhost:5173 docs/capturas`.

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
- `improvement/master-integration` — valida a candidata Master em PRs separados de engenharia e interface.
