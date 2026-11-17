# Ultra Motion X no BRASFC

## O que foi analisado

O repositório `Andresilvadev-br/ULTRA-MOTION-X` tem a branch `main` vazia (só README). O código real está em branches:

| Branch | Conteúdo | Compatível com SvelteKit? |
| --- | --- | --- |
| `claude/dreamy-archimedes-7awdnm` (**1.3.0**) | Pacote único em JavaScript puro, sem dependências, 74 testes | **Sim** — usado no BRASFC |
| `claude/jolly-dijkstra-4nujtt` | Monorepo com núcleo Rust/WASM, SDK TypeScript e adaptador Svelte | Não diretamente: exige compilar Rust/WASM e os pacotes não são instaláveis como dependência (workspaces sem `dist` publicado) |
| `chatgpt/continuation-20261112` | Base anterior do monorepo | Idem |

## Como está integrado

- Dependência fixada por commit, baixada por HTTPS (sem git/SSH no CI ou Docker):
  `ultra-motion-x → codeload.github.com/…/tar.gz/25344fb5…` (versão 1.3.0).
- O motor **não foi copiado nem reescrito**. O BRASFC só tem uma camada de integração:
  - `src/lib/motion/motion.svelte.ts` — carrega o motor sob demanda no navegador, aplica perfis e a preferência de movimento.
  - `src/lib/motion/actions.ts` — ações Svelte (`use:enter`, `use:pop`, `use:indicator`, `use:spring`).
  - `src/lib/motion/ultra-motion-x.d.ts` — tipos da parte da API usada.

### Recursos usados

| Recurso da UMX | Onde no BRASFC |
| --- | --- |
| `animate` (molas analíticas no compositor) | entradas de painéis, modais, apresentação, seleção de jogador |
| `transitions.prewarm/navigate` (FLIP + entrada escalonada) | transição entre páginas (`onNavigate` no layout raiz) |
| `capsule` (CapsuleMorph) | **Dynamic Island** contextual |
| `indicator` (LiquidIndicator) | barra do menu principal, abas da carreira, controles segmentados |
| `bind` (microinterações `data-umx-press`/`data-umx-hover`) | botões, cartões e atalhos |
| `effects.burst/wave` | celebração na apresentação do clube |
| `budget.setProfile` (Ultra/Balanced/Performance) | Configurações → Desempenho visual |

## Limitações encontradas (documentadas, não escondidas)

1. **Sem suporte a `prefers-reduced-motion` na 1.3.0.** A camada do BRASFC resolve: com movimento reduzido (sistema ou Configurações), toda chamada vira aplicação instantânea do estado final, microinterações são desligadas e animações CSS são neutralizadas.
2. **Sem tipos TypeScript.** Criado `ultra-motion-x.d.ts` com a superfície usada.
3. **Pensada para WebView2.** A ponte com host nativo (`bridge`) fica desligada no navegador.
4. **Adaptador Svelte só existe no monorepo** (não instalável). Usamos ações Svelte próprias, finas, sobre a API pública da 1.3.0.
5. **Hidratação:** animar a entrada do HTML que já veio do servidor causaria "pisca". As entradas só rodam depois da primeira pintura (`markHydrated`).

Se o motor falhar ao carregar, a interface continua funcional sem animações (`motion.failed`).

## Atualizar a versão

Troque o commit em `package.json` (`ultra-motion-x`), rode `npm install`, `npm run verify` e confira as telas.
