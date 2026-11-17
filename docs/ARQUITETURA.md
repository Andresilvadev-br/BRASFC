# Arquitetura do BRASFC (Dev 0.1)

## Visão geral

```
Navegador ── HTTPS ──► Caddy ──► Node (SvelteKit + adapter-node) ──► PostgreSQL
                  └─ WSS /ws/realtime ─┘ (mesmo processo, mesma porta)
```

| Camada | Tecnologia | Onde |
| --- | --- | --- |
| Interface | SvelteKit 3.2 + Svelte 5 (runes), TypeScript 6, Vite 8 | `src/routes`, `src/lib/ui` |
| Movimento | Ultra Motion X 1.3.0 + camada de integração | `src/lib/motion` |
| Domínio (puro, sem I/O) | TypeScript compartilhado servidor/cliente | `src/lib/domain` |
| Pixel art | Grades paramétricas → SVG nítido | `src/lib/pixel` |
| Servidor | Rotas de API do SvelteKit + hooks | `src/routes/api`, `src/hooks.server.ts` |
| Dados | PostgreSQL (`postgres`) / PGlite em dev e testes | `src/lib/server/db`, `migrations/` |
| Tempo real | `ws` (WebSocket) com hub autoritativo | `src/lib/server/realtime`, `src/lib/realtime` |
| Produção | `server/index.js` (HTTP + upgrade WS + desligamento gracioso) | `server/` |

**Por que SvelteKit 3 e não 2:** a linha 2.x tem avisos de segurança altos sem correção publicada; a correção existe a partir da 3.1.1.

## Domínio

Tudo que é determinístico vem de uma **semente** por carreira e é recalculado igual no servidor e no navegador, sem ocupar o banco:

- `clubs.ts` — 20 clubes fictícios (cores, escudo gerado, reputação).
- `squad.ts` — 25 atletas por clube (nomes aleatórios, nota, potencial, condição, moral).
- `season.ts` — calendário turno/returno (método do círculo, 38 rodadas) e classificação.
- `tactics.ts` — formações, escalação automática, familiaridade, validação e relatório do auxiliar.
- `training.ts` — plano semanal por ênfase.
- `career.ts` — validação de criação, dados iniciais, mensagens de boas-vindas.
- `view.ts` — "visão" derivada da carreira usada pelas telas.

O que é escolha do usuário é **persistido**: carreira, tática, foco de treino, aparência, mensagens lidas.

## Banco de dados

Migrações SQL em `migrations/*.sql`, embutidas no build (`import.meta.glob`) e aplicadas na inicialização sob `pg_advisory_xact_lock`. Tabelas: `profiles`, `careers`, `career_messages`, `rooms`, `room_members`, `schema_migrations`.

- Atualizações de carreira usam **controle otimista de versão** (`version`): outra aba não sobrescreve sem aviso.
- O token de sessão nunca é gravado puro — apenas o hash SHA-256.

## Modos de carreira

Os dois modos compartilham domínio e futuro motor, mas têm navegação e regras próprias (`mode = coach | player`): o treinador edita tática e ênfase do time; o jogador tem foco individual e atributos próprios em `data.player`. A separação já está no servidor (ex.: `PATCH` recusa tática vinda de carreira de jogador).

## Tempo real e multiplayer

- Cliente envia **intenções** (`join`, `ready`, `leave`, `ping`); o servidor responde com **instantâneos completos** da sala. Nada do estado é confiado ao cliente.
- Autenticação pelo mesmo cookie de sessão; origem verificada (proteção contra CSWSH); limite de taxa por conexão; `maxPayload` de 2 KB; heartbeat a cada 25 s.
- Membros e salas ficam no banco; presença/"pronto" ficam em memória do processo (suficiente para uma instância; para várias, usar Postgres `LISTEN/NOTIFY` ou Redis).
- Em dev, o plugin `brasfc-realtime-dev` (em `vite.config.ts`) anexa o WebSocket ao servidor do Vite usando o mesmo runner SSR das rotas.

## Atualizações

- **Local:** HMR do Vite (`npm run dev`).
- **Hospedado:** cada build tem versão `0.1.0+<commit>`. O SvelteKit verifica novas versões (a cada 60 s, ao focar a aba e nas respostas do servidor). O jogo mostra "Nova versão" na Dynamic Island; se houver alterações não salvas (registro em `stores/unsaved.svelte.ts`), pede confirmação antes de recarregar. Sem pendências, a próxima navegação carrega a versão nova.

## Segurança básica

CSP com nonce, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; verificação de origem em toda mutação da API; limites de taxa; validação de entrada no servidor; cookies `HttpOnly`/`SameSite=Lax`/`Secure`; erros inesperados viram mensagem genérica com id (detalhe só no log).

## Desempenho

Motor de animação carregado sob demanda; animações no compositor (GPU); fontes auto-hospedadas com subconjuntos; arquivos estáticos pré-comprimidos (gzip/brotli); Node limitado a 384 MB de heap e PostgreSQL ajustado para a VPS de 4 GB.
