# BRASFC 0.10.0 — Visual Premium

Relatório da atualização visual. Data: 21/11/2026. Base: BRASFC 0.9.1 (commit 0c64562).

## 1. Resumo

Esta entrega começa a reformulação visual pelas telas com problemas confirmados no código: a Central do Jogador, a partida ao vivo, o lobby e a lista de ligas multiplayer, o editor de personagem e os painéis no celular. Ela também cria uma biblioteca de cards reutilizáveis para as próximas telas.

As mecânicas, os saves e as regras do servidor ficaram como estavam. Nenhuma estatística, proposta ou evolução é inventada: todos os cards leem os dados que o jogo já calcula.

## 2. Auditoria (feita no código, sem capturas)

| Problema | Causa encontrada | Situação |
|---|---|---|
| Exclusão de liga quebrada no celular | O painel `position: fixed` estava dentro de um card com `transform` (inclinação 2.5D e entrada com mola), então ficava preso ao card e não à tela | Corrigido |
| Lances como `shot_off` sem tradução | O mapa de textos da partida ao vivo cobria só parte dos 33 tipos de lance do motor | Corrigido |
| Placar da rodada longo e misturado | O servidor envia os jogos das Séries A–D da mesma rodada, e a tela mostrava todos numa lista só | Corrigido: agrupado por série |
| Decisões técnicas sem tradução | As sugestões do intervalo mostravam a chave interna (`formation`, `sub`…) | Corrigido |
| Contratos com quatro botões e espaço vazio | Ações soltas, sem contexto nem motivo de indisponibilidade | Reconstruído em cards |
| Treino com seletor nativo | Foco escolhido por `<select>` e progresso em barras sem contexto | Reconstruído em cards |
| "Salvo no universo" repetitivo | Texto fixo a cada gravação, que ficava na tela | Confirmação discreta que some sozinha |
| 49 seletores nativos com estilos diferentes | Cada tela tinha o próprio estilo, ou nenhum | Visual único em todo o jogo |

## 3. Novos componentes (src/lib/ui/cards)

| Componente | Uso |
|---|---|
| **ActionCard** | Ação com ícone, descrição, situação ("Disponível", "Janela fechada"…) e resposta ao toque. Quando a ação está indisponível, o card mostra o motivo |
| **SelectCard** | Opção visual em grupo de rádio, navegável pelas setas do teclado, com marca de seleção animada |
| **StatCard** | Indicador com escala, variação real e leitura. A barra anima só quando o valor muda |
| **MatchCard** | Confronto com escudos, cores dos clubes, placar ou horário, competição e status ao vivo |
| **HeroCard** | Destaque principal com a luz das cores do clube |

Infraestrutura:

- tokens de duração, curva e superfície de card;
- campos nativos (select, input, progress) com o visual do jogo;
- ação `use:portal`;
- Sheet que vira painel inferior no celular e respeita as áreas seguras do iPhone.

## 4. Telas reformuladas

- **Central do Jogador**
  - Destaque com o personagem, o geral, o clube e as etiquetas da carreira.
  - **Visão geral:** disputa por posição com rivais e indicadores do vestiário.
  - **Desenvolvimento:** foco de treino em cards com os atributos treinados e evolução real do geral (atual, anterior, potencial, condição e variação). Sem histórico, a tela avisa e não estima nada.
  - **Contratos e mercado:**
    - painel do contrato;
    - cards para buscar transferência, buscar empréstimo, solicitar renovação e patrocínio;
    - propostas de clubes em cards com as cores de cada clube.
  - **Trajetória:** números, objetivos e linha do tempo de clubes e conquistas.
- **Partida ao vivo**
  - Placar de TV com escudos, cores, cronômetro e o placar animado quando há gol.
  - Barra compacta de visualização (Clássico, Pixel, Narração) e Rever trecho.
  - Controles de cenas (exibir, som, velocidade, pular).
  - Linha do tempo oficial traduzida e sem repetições.
  - Prontidão do intervalo com anel "X de Y".
  - Placar da rodada por série, com a sua aberta e as outras recolhidas.
- **Lobby multiplayer:** indicador central "X de Y prontos", com quem ainda falta confirmar. Participantes aparecem em cards com a cor do clube, a presença online no avatar e o destaque de quem está pronto.
- **Minhas ligas:** cards com clube, modalidade, temporada, participantes e vagas preenchidas.
- **Editor de personagem:**
  - palco com prévia ao vivo;
  - categorias de roupa, partes de cima e de baixo e calçados mostrados no próprio personagem, não só pelo nome.

## 5. Animações (Ultra Motion X)

Nenhuma segunda engine foi criada. As animações usam a camada que já existia (`motion.svelte.ts` e `actions.ts`):

- `pop` no placar quando sai gol e na marca de seleção;
- `count` nos números dos indicadores;
- `animate` com mola `gentle` nas barras, só quando o valor muda;
- `enter` nos lances novos e nas mensagens;
- painéis com entrada lateral no computador e de baixo para cima no celular.

Todas respeitam o modo de movimento reduzido: o estado final é aplicado na hora.

## 6. Desempenho medido

Build de produção comparado com a 0.9.1, no mesmo ambiente:

| Medida | 0.9.1 | 0.10.0 | Diferença |
|---|---|---|---|
| JavaScript do cliente | 1.499.172 B | 1.522.249 B | +23 KB (+1,5%) |
| CSS do cliente | 257.140 B | 285.980 B | +29 KB (+11%) |
| Total comprimido (gzip -9) | 475.744 B | 488.509 B | +12,8 KB (+2,7%) |

Nenhuma biblioteca nova foi adicionada e não há requisição de rede nova. O aumento vem dos estilos dos cards e dos componentes novos.

## 7. Testes

| Verificação | Resultado |
|---|---|
| svelte-check (tipos e acessibilidade, falha com avisos) | 687 arquivos, 0 erros, 0 avisos |
| vitest | 174 aprovados, 3 ignorados (exigem PostgreSQL real; rodam no CI) |
| Novos testes (tests/cards.test.ts) | 5 aprovados: tradução de todos os lances, cards de ação, seleção, confronto e indicador |
| Build de produção | Concluído |

Saves: nenhuma alteração no formato dos dados nem migração de banco. Carreiras e ligas anteriores continuam compatíveis.

## 8. Pendências reais

- Não houve validação visual por capturas nem teste manual nas larguras de 320 a 1440 px. A pedido, a auditoria foi feita só pelo código. Antes de considerar a reformulação aprovada, é preciso abrir as telas no celular, principalmente no Safari do iPhone.
- Telas ainda não reformuladas nesta etapa: elenco, escalação, treinos do treinador, mercado do treinador, finanças, calendário, competições, notícias, configurações e a criação de liga. A Central do Treinador já era montada em cards e foi mantida.
- O campo 2D (coordenadas e aglomeração de jogadores) e as cenas especiais de gol e cartão não foram alterados nesta entrega.
- Os novos cards estão prontos para reaproveitar nessas telas nas próximas etapas.
