# BRASFC 0.10 — Visual Premium e Central de Carreiras

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

## 9. Central de carreiras (0.10.1)

### Auditoria da persistência

| Ponto verificado | Resultado |
|---|---|
| Identificadores | Cada carreira tem UUID próprio, gerado no servidor |
| Associação ao jogador | Todas as leituras, gravações, renomeações e exclusões filtram por `profile_id` |
| Coexistência | Até 12 carreiras por perfil, cada uma numa linha separada da tabela `careers` |
| Gravação | Gravações com controle otimista de versão: uma aba desatualizada recebe conflito em vez de sobrescrever |
| Exclusão | Mensagens, partidas, histórico, transferências e finanças da carreira saem juntos (ON DELETE CASCADE) |
| Multiplayer | As ligas ficam em tabelas próprias (`rooms`, `room_worlds`…) e nenhuma referência a uma carreira individual |
| Offline | O app usa o mesmo servidor com PGlite em disco, com as mesmas regras |

### O que foi implementado

- **Menu principal:**
  - Continuar abre o último save válido e fica desabilitado quando não há nenhum.
  - Também estão no menu Nova carreira, Carregar carreira e Carreiras compartilhadas.
- **Biblioteca (/continuar):**
  - card de destaque para continuar;
  - cards de save com personagem, escudo (ou marcador quando o clube não existe), modalidade, temporada, data no jogo, competição real (lida da liga salva), última atividade e o selo "Mais recente";
  - detalhes ao tocar no card;
  - carregamento incremental de 6 em 6;
  - organização por data, tipo e clube ou nome;
  - estados vazio, save incompatível e falha de conexão.
- **Renomear:**
  - o nome fica numa coluna própria (migração aditiva 0012);
  - não altera o identificador, a versão nem o progresso, então uma aba aberta continua salvando;
  - até 40 caracteres, e o campo vazio volta ao nome padrão.
- **Exclusão segura:**
  - o modal identifica a carreira e lista o que será apagado;
  - avisa que as outras carreiras e as ligas não são afetadas;
  - o botão só é liberado depois de marcar "Entendo que esta exclusão é permanente";
  - a biblioteca só é atualizada depois da confirmação do servidor.
- **Saves incompatíveis** (clube inexistente, dados de atleta incompletos, data corrompida): continuam guardados e podem ser excluídos, mas não são carregados nem oferecidos em Continuar.
- **Carreiras compartilhadas:** aparecem só como atalhos. A exclusão de um universo continua restrita ao anfitrião, no multiplayer.

### Testes (tests/saves.test.ts, 12 cenários em banco real PGlite)

| Cenário | Resultado |
|---|---|
| Duas carreiras independentes com progresso diferente, alternando leituras | Aprovado |
| Fechar e reabrir o banco em disco (modo offline) e continuar a carreira correta | Aprovado |
| Continuar abre a carreira usada por último | Aprovado |
| Excluir uma carreira sem afetar outra, nem as ligas | Aprovado |
| Outro perfil não exclui nem renomeia a carreira | Aprovado |
| Renomear mantém ID, versão e progresso (aba antiga continua salvando) | Aprovado |
| Validação do nome | Aprovado |
| Falha de salvamento: versão antiga é recusada sem sobrescrever | Aprovado |
| Save incompatível identificado e fora de Continuar | Aprovado |
| Saves antigos sem nome e competição real do clube | Aprovado |
| Ordenação | Aprovado |
| Participante que sai da liga não apaga o universo; excluir a carreira individual não mexe na liga | Aprovado |

Suíte completa: 186 testes aprovados e 3 ignorados (exigem PostgreSQL real; rodam no CI). O teste de migração confirma que ligas e membros de uma base antiga permanecem intactos depois de aplicar as migrações até a 0012.

Não houve teste de falha de rede no navegador. Na tela, um erro de conexão ao renomear ou excluir mostra "Sem conexão com o servidor. Nada foi alterado" e mantém o modal aberto para tentar de novo.
