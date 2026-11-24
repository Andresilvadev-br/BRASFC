# BRASFC Dev 0.12 — Carreira única e desempenho: relatório parcial (etapas 1 a 3)

- **Branch:** `dev-0.12`, criada sobre `dev-87mxsh` (PR #27, Carreira de Treinador 2.0).
- **Publicação:** nada foi publicado. A versão **não está concluída**; as pendências estão na seção 7.

## 1. Funcionalidades removidas

**Carreira de jogador, offline e online:**
- criação de atleta;
- escolha entre carreira de jogador e de treinador (no jogo e na criação de liga);
- telas, componentes e ações exclusivos do modo:
  - Central do Jogador;
  - cartões de modo;
  - identidade do atleta;
  - seletor de posição;
  - ações `jogador-*` no servidor;
  - ramos de jogador no processamento da rodada e no fim de temporada.

**Funções humanas no multiplayer:**
- auxiliar técnico humano;
- atleta humano;
- convites para auxiliar;
- opção "Exigir prontidão dos auxiliares".

O auxiliar técnico continua existindo, sempre controlado pela IA.

## 2. Funcionalidades preservadas

Ficou intacto:

- desenvolvimento e atributos dos atletas;
- categorias de base;
- contratos, transferências e empréstimos;
- IA dos jogadores;
- aparência e personalização do treinador;
- motor de partidas e todo o gerenciamento do clube.

**Saves de jogador antigos:**
- continuam no banco, sem exclusão silenciosa;
- aparecem na biblioteca marcados como **legado**, com explicação;
- podem ser excluídos;
- nunca são abertos nem oferecidos em "Continuar carreira";
- o servidor recusa jogá-los (410).

**Ligas antigas com atletas ou auxiliares:**
- continuam funcionando;
- esses participantes não bloqueiam a prontidão da rodada;
- não podem assumir clubes.

Saves de treinador continuam compatíveis.

## 3. Carreira online simplificada

- **Criação de liga:**
  - nome, privacidade, vagas e temporada;
  - convites ou código de acesso;
  - cada participante escolhe o próprio clube;
  - todos confirmam a prontidão.
- **Um treinador por clube:** a verificação acontece na mesma transação da liga. Uma segunda tentativa no mesmo clube recebe 409, e o teste cobre esse caso.
- **Convites:** só o administrador convida (vaga livre ou clube reservado). O administrador não decide pelos outros: decisões de partida para outro clube são recusadas pelo motor, e o teste cobre isso.

## 4. Menu principal

Antes, a auditoria de layout automatizada (Chromium, só texto) mostrava:

| Resolução | Problemas encontrados |
|---|---|
| 1280×720 | Rolagem vertical (765/720); rodapé fora da tela; NOVO, BETA e textos para fora dos cards; rótulos quebrados |
| 1366×768 e 1600×900 | Badges para fora dos cards |
| 1920×1080 | "Carreiras compartilhadas Beta" quebrado |
| 1280×600 | Seis cards abaixo da tela |
| Todas | "Continuar" aparecia duas vezes |

Depois da correção:

- **0 problemas** em 1280×720, 1366×768, 1600×900, 1920×1080, 2560×1440, 3840×2160 e 1280×600;
- sem rolagem nem estouro horizontal;
- um único "Continuar carreira".

O que mudou no menu:

- **Layout:** lista vertical à esquerda, apresentação no centro e o treinador à direita, dimensionado pela altura da tela.
- **Itens:** Continuar carreira, Nova carreira, Carreira online, Carregar carreira, Laboratório, Configurações e Atualizações.
- **Identidade preservada:** estádio, pixel art, tipografia e paleta.

## 5. Desempenho

### 5.1 Demora depois da partida

**Ambiente:** PGlite (banco local do modo offline) neste contêiner Linux; carreira Palmeiras, Série A (20 clubes); 12 passos seguidos do calendário.

**Gargalo encontrado:** o tempo do servidor ao registrar a rodada era dominado pela simulação, com o motor completo, dos outros 9 jogos da divisão. Eles levavam cerca de 1,7 a 2,1 s, e a resposta ainda trazia a carreira inteira (cerca de 100 KB, dos quais 70 KB do universo).

**Correções:**
1. **Pré-cálculo dos outros jogos.** Eles não dependem das decisões do treinador.
   - Começa quando a tela da partida abre e logo depois de cada rodada.
   - Roda em fatias de um jogo, sem travar outras requisições.
   - Só é usado com a mesma versão do save e o mesmo passo do calendário; qualquer mudança no save descarta o cálculo.
   - O teste confirma que o resultado é idêntico ao calculado na hora e que o pré-cálculo é descartado quando a versão muda.
2. **Resposta enxuta da rodada.** Leva só resultado e versão; a gestão relê a carreira ao voltar.
3. **Cabeçalho `Server-Timing`** com o tempo de cada etapa, para medir em produção.

**Medições (passos com jogo do usuário):**

| | P50 | P95 aprox. | Resposta |
|---|---:|---:|---:|
| Antes | 2.096 ms | 2.500 ms | ~100 KB |
| Depois (com pré-cálculo pronto) | 256 ms | 334 ms | ~14 KB |

Etapas depois da correção, em média:

| Etapa | Tempo |
|---|---:|
| Reprodução autoritativa da partida do usuário | ~210 ms |
| Gestão | ~6 ms |
| Mundo | ~6 ms |
| Gravação | ~15 ms |
| Recálculo das telas ao voltar (servidor) | ~13 ms |

**Mesma medição em PostgreSQL 16.15** (banco usado na VPS), local neste contêiner, 12 passos:

| | P50 | Máximo |
|---|---:|---:|
| Antes | 2.032 ms | 2.307 ms |
| Depois (com pré-cálculo pronto) | 229 ms | 271 ms |

Na gravação, a transação da rodada inteira leva cerca de 15 ms.

**Índices:** os índices existentes cobrem as consultas mais frequentes:
- resultados por temporada, pela chave primária de `career_matches`;
- mensagens por carreira;
- lançamentos por temporada;
- lista de carreiras do perfil;
- jogos da liga por calendário.

Não foi necessária nenhuma migração.

**O que ainda não foi medido:**
- a própria VPS (o PostgreSQL foi medido localmente);
- latência de rede;
- hardware de entrada;
- o tempo total do clique até a tela de gestão no navegador.

Também falta registrar o caso em que o pré-cálculo ainda não terminou: aí o servidor calcula na hora (cerca de 2 s).

### 5.2 Qualidade visual adaptativa (Ultra Motion X)

Nas Configurações, a **Qualidade visual** tem cinco modos: Automático, Alto, Equilibrado, Econômico e Ultra Econômico. Ela ficou separada das **Animações** (automático, completo ou reduzido), que é a configuração de acessibilidade.

| Modo | O que faz |
|---|---|
| Automático | Escolhe Econômico em hardware de entrada (até 4 núcleos e até 4 GB, ou até 2 núcleos ou até 2 GB) e Alto nos demais |
| Econômico | Remove desfoque, luz de cursor e inclinação 2.5D; perfil `performance` da Ultra Motion X |
| Ultra Econômico | Além disso, sombras simples, sem brilho de texto, sem animações decorativas infinitas e sem paralaxe do estádio |

- O feedback de clique e as transições essenciais continuam em todos os modos.
- As preferências antigas ("Leve" e o perfil "Desempenho") são convertidas automaticamente.
- FPS e consumo de GPU **não foram medidos**: este ambiente não tem GPU nem o hardware de referência.

## 6. Testes executados

| Verificação | Resultado |
|---|---|
| `npm run verify` | svelte-check sem erros; **216 aprovados**, 3 ignorados (exigem PostgreSQL real); build concluído |
| Playwright: carreira online (`tests/multiplayer-browser.mjs`) | Aprovado em Chromium: criar liga, recarregar, voltar, convidar, clube exclusivo, quatro larguras |
| Playwright: biblioteca offline (`tests/career-browser.mjs`) | Aprovado em cinco resoluções; criação de jogador recusada |
| Auditoria do menu | Aprovada em 7 resoluções |

**Testes reescritos para a carreira única:** `live-round` (três treinadores), `connected-world` (duas temporadas com dois treinadores) e `multiplayer-social`.

**Testes novos:** `legacy-player-saves` e `round-prefetch`.

## 6.1 Etapa 2 (continuação)

**Auditoria de interface da carreira**

A auditoria passou por 26 rotas, em seis resoluções: 1280×720, 1366×768, 1600×900, 1920×1080, 2560×1440 e 3840×2160.

| | Resultado |
|---|---|
| Antes | Sem rolagem horizontal em nenhuma tela, mas com textos cortados e tamanhos de fonte abaixo de 11 px |
| Depois | 0 rolagens horizontais, 0 textos abaixo de 11 px e 0 textos cortados sem dica do texto completo |

Problemas corrigidos:

- **Trilho lateral:** "Carreira de Treinador · nome" ficava cortado em todas as larguras. Agora mostra "Treinador · nome" e quebra a linha quando precisa.
- **Idade desconhecida:** aparecia como "—a" no Elenco e nas Táticas. Agora fica omitida.
- **Fontes pequenas:** 9 textos abaixo de 11 px em Finanças e nos selos de suspensão e de forma. Todos passaram para 11 px ou mais.
- **Siglas de clubes** cortadas nos cards de confronto: agora nunca são cortadas.
- **Listas compactas** (nomes, funções, assuntos e notícias): mantêm as reticências e ganharam a dica com o texto completo.

O script `scripts/audit-layout.mjs` passou a detectar textos cortados e ignora textos só para leitores de tela.

**Carreira online**

- **Prontidão:** a revalidação já existia. Mudar tática, treino ou mercado retira a confirmação do treinador, e o avanço é automático quando todos estão prontos. Isso foi conferido nesta etapa.
- **Delegação temporária à IA:**
  - nova ação `ai-cover`, que só o próprio treinador liga ou desliga;
  - com ela ligada, a rodada não espera por ele e a IA comanda o clube dele na partida ao vivo;
  - no jogo, aparece como o interruptor "IA comanda meu clube enquanto eu estiver ausente";
  - o teste cobre a autorização e o avanço.
- **Dynamic Island da liga:**
  - estado de sincronização: sincronizado, sincronizando, reconectando, sem conexão ou servidor indisponível;
  - atividades genéricas novas: base, finanças, clube, treinos e "preparando a próxima partida", sem valores nem escalações;
  - "pronto para avançar" e "ausente";
  - recolhe sozinha durante a partida.

**Testes:** `npm run verify` com **217 aprovados** e 3 ignorados.

## 6.2 Etapa 3 — Carreira única (offline × online) e Hybrid Save Engine

### 6.2.1 Uma interface, dois armazenamentos

As telas da carreira deixaram de pertencer às rotas e foram para `src/lib/ui/career/screens/`:
Elenco, Táticas, Treinos, Finanças, Clube, Base, Comissão, Gabinete, Calendário, Competições e Copa.
As mesmas telas, sem cópia, rodam:

- na carreira individual (`/carreira/[id]/…`), onde as rotas viraram invólucros de duas linhas;
- na carreira online (`/multiplayer/sala/[código]?secao=…`), dentro do `ConnectedWorld`.

As telas nunca chamam a API diretamente: falam com uma **porta de armazenamento** (`src/lib/career/port.ts`).

| Porta | Onde grava | Concorrência |
|---|---|---|
| `local` (`local-port.ts`) | save da carreira (servidor local no offline ou API de carreiras) | versão da carreira (409 → reconsulta) |
| `online` (no `ConnectedWorld`) | universo compartilhado da liga, por comandos autoritativos | revisão do universo + id de operação (idempotência) |

Para as telas receberem os mesmos dados, o servidor projeta o clube do treinador online numa `Career` (`projectCareer`, com `sharedWorld: true`). O navegador calcula `careerView`, `manageView` e `officeView` exatamente como na carreira individual. O teste confirma que o elenco calculado pela tela é o elenco oficial da liga, e que caixa e tática batem.

Também passaram a ser servidor compartilhado:

- a biblioteca **Minhas Táticas** (`applyPresetOperation`);
- a dispensa de dicas do auxiliar.

O que continua diferente, por regra de jogo e não por duplicação:

- a Central online é o hub da liga (prontidão, convites, chat);
- a troca de clube online acontece pelas vagas da liga (não há Central de Propostas);
- Mundo, Estatísticas, História e Mercado têm implementação própria (o Mercado já usa o `MarketWorkspace` compartilhado).

### 6.2.2 Hybrid Save Engine

| Peça | Arquivo | Função |
|---|---|---|
| Armazenamento local | `src/lib/sync/local-store.ts` | IndexedDB (navegador e Electron); sem ele, cai para a memória e avisa que a fila vale só naquela janela. Limite de 4 MB por registro. |
| Fila de operações | `src/lib/sync/outbox.ts` | Persistente, entregue em ordem, deduplicada por campo, com espera exponencial (1 s → 30 s) e no máximo 40 tentativas. |
| Canal reativo | `src/lib/stores/sync.svelte.ts` | Um por carreira ou liga. Mostra o estado nos indicadores e reenvia ao reconectar (evento `online`, timer e ao abrir a tela). |
| Indicadores | `SyncBadge.svelte` (carreira individual, barra superior) e `Island.svelte` (liga) | Salvo localmente · Aguardando sincronização · Sincronizando · Sincronizado · Reconectando · Falha de sincronização, com o número de alterações na fila e o botão "Tentar agora". |

**Regras de segurança**

- **O que pode esperar na fila:**
  - tática, plano de treinos e dicas (nas duas carreiras);
  - biblioteca de táticas, só no online, porque o servidor reconhece o id da operação.
- **O que nunca vai para a fila:** dinheiro, mercado, contratos, diretoria e resultados oficiais. Essas ações continuam exigindo resposta imediata do servidor.
- **Idempotência:**
  - online: a operação é reenviada com o MESMO id. O servidor confere o recibo antes da revisão, então uma resposta perdida não duplica nada (há teste com revisão antiga);
  - local: as operações enfileiradas são idempotentes por valor.
- **Conflito na tática:** a fila guarda a tática-base. Se a tática oficial mudou em outra janela enquanto o usuário estava sem conexão, a alteração local é descartada e o usuário é avisado. Ela nunca sobrescreve em silêncio.
- **Revisão mudou ou rodada em andamento (409):** a fila atualiza o universo e tenta de novo depois. Recusas definitivas saem da fila com o aviso "Falha de sincronização".
- **Leitura otimista:** na liga, a tela mostra a tática e o plano salvos localmente mesmo antes de chegarem ao servidor. Na carreira individual, o rascunho continua na tela até sincronizar.

**Fora desta etapa:** o *snapshot* completo do universo não é guardado em cache local, porque a tela da liga é carregada pelo servidor (SSR). Abrir uma liga sem nenhuma conexão continua indisponível. A fila e as alterações pendentes, porém, sobrevivem a recarregar e a fechar o app.

### 6.2.3 Testes desta etapa

- `tests/sync-engine.test.ts` (6 testes):
  - deduplicação por campo;
  - persistência entre recargas e isolamento por escopo;
  - ordem e espera exponencial com o mesmo id;
  - conflito, recusa e limite de tentativas;
  - erro inesperado;
  - estados do canal.
- `tests/connected-world.test.ts`:
  - projeção online igual à individual;
  - reenvio com o mesmo id e revisão antiga sem duplicar;
  - operação nova com revisão antiga bloqueada.
- **Navegador, online (`tests/multiplayer-browser.mjs`):**
  - Táticas, Finanças, Gabinete, Calendário e Elenco compartilhados;
  - comandos para o servidor cortados → "Salvar tática atual" vai para a fila;
  - a Island mostra "· 1";
  - a fila **sobrevive ao recarregar**;
  - com a conexão de volta, aparece "Sincronizado" e a biblioteca tem **exatamente 1** tática.
- **Navegador, carreira individual (`tests/career-browser.mjs`):**
  - PATCH cortado → "Tática salva localmente" e o selo mostra "(1)";
  - após recarregar, a fila continua e nada chegou ao servidor;
  - com a conexão de volta, aparece "Sincronizado" e a tática está no save;
  - sem rolagem horizontal.
- `npm run verify`: 0 erros de tipo, **225 aprovados** e 3 ignorados; build OK.

## 7. Pendências (não concluídas nesta etapa)

1. **Unificação:** feita (seção 6.2.1). Ainda restam a Central, o Mundo, as Estatísticas e a História online, que são próprios da liga.
2. **Hybrid Save Engine:** feito (seção 6.2.2). Falta o cache do universo inteiro para abrir uma liga sem nenhuma conexão.
3. **Dynamic Island:** mostra "salvo localmente" e a fila (seção 6.2.2).
4. **Multiplayer.** O código de servidor das funções antigas (atleta e auxiliar) segue ativo só para ligas legadas e deve ser removido depois de migrá-las.
5. **VPS e banco.** Faltam auditoria de índices e consultas, carregamento e descarregamento de universos e medições na VPS.
6. **Auditoria de interface.** Faltam a escala de exibição do Windows, o Electron e as telas da carreira online.
7. **Testes ainda não executados:** 8 treinadores simultâneos, queda de servidor, Windows, rede lenta, uso prolongado e memória.
8. **Medições ainda não feitas:** FPS, RAM, CPU do Electron e hardware de referência.
