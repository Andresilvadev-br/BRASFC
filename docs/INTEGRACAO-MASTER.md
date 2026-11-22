# BRASFC | Integração Master

Base comum: `28f4fdca57bb5f1b27ba58c703a4bf9628ebe221` (0.10.1, [PR #19](https://github.com/Andresilvadev-br/BRASFC/pull/19)). As alterações anteriores da Central de Carreiras já constam dessa base.

| Branch | Responsável | Entrega e destino |
| --- | --- | --- |
| `improvement/master-engineering` | Codex/Work | PR de engenharia para `improvement/master-integration`. |
| `improvement/master-experience` | Claude | PR de interface para `improvement/master-integration`. |
| `improvement/master-integration` | Codex/Work | Recebe as entregas revisadas. Homologação conjunta antes de preparar um PR de publicação. |

Os três ramos começam no mesmo commit. O CI de integração é independente de implantação. A aprovação da produção é uma etapa posterior e explícita. O PR #19 preexistente continua aberto para revisão.

## Propriedade

- Codex/Work: domínio, motor, banco e migrações, carregamento de dados no servidor, rotas de API, testes de engenharia, protocolos, Electron, CI e implantação.
- Claude: páginas e componentes Svelte, estilos, mídia, navegação, consumo do Ultra Motion X e testes de experiência. A Equipe B usa a Central de Carreiras da base comum.
- A API de prontidão e os tipos de eventos ficam com Codex/Work. As telas de lobby, partida e táticas ficam com Claude. Alterações de contrato devem ser registradas aqui com compatibilidade para os clientes atuais.

## Contratos para a Equipe B

### Prontidão da rodada

O servidor já envia `readiness` no snapshot de `GET /api/rooms/:code/world` e disponibiliza a leitura leve `GET /api/rooms/:code/world?readiness` para mudanças de presença, com `revision` e o mesmo objeto de prontidão. Continuar usando o evento de sala do WebSocket para detectar entrada, saída e reconexão, e o evento de revisão para detectar comandos confirmados. A resposta HTTP é a autoridade para determinar a aptidão.

| Campo de `readiness` | Significado |
| --- | --- |
| `participants` | Lista de `{ profileId, required, ready, online }` com as funções já assumidas na liga. |
| `requiredCount` | Participantes exigidos pela regra da liga. Exclui auxiliares quando sua prontidão é opcional. |
| `readyCount` | Prontos entre os obrigatórios. Uma confirmação pode persistir durante uma desconexão. |
| `onlineCount` | Conectados entre os obrigatórios. |
| `readyOnlineCount` | Obrigatórios que estão simultaneamente prontos e conectados. |
| `canStart` | Temporada iniciada, sem rodada ativa, com pelo menos um participante exigido e todos os exigidos prontos e conectados. Na virada da temporada, a mesma condição permite o avanço. |

A ação `start` no lobby inicia a temporada. A ação `advance` inicia a rodada ou fecha a temporada e depende também da permissão de administrador. O servidor revalida presença e prontidão no momento do comando. Para o indicador de aptidão, usar `canStart`. Para o contador, usar `readyOnlineCount / requiredCount`. A confirmação do participante continua em `ready`. Em caso de desconexão, tratar a aptidão local como indisponível até obter estado do servidor. Se dois eventos dispararem a mesma consulta, reaproveitar a solicitação em curso ou cancelar a versão obsoleta.

### Partida e elenco

- `session.relevant.match.players[].x/y` e `ball.x/y` usam metros absolutos no campo de 105 × 68. O mandante ataca no sentido de x crescente e o visitante no sentido inverso. O motor publica `tick` em segundos de jogo e `px/py` como posição anterior do atleta. Um quadro recebido pode saltar vários ticks. A transmissão avança em lotes e suspende o relógio nas fases de espera. A visualização pode interpolar entre os dois últimos quadros oficiais da mesma sessão usando o tempo de chegada. O placar e os eventos sempre vêm do quadro oficial.
- Na sessão de partida, usar `required`, `waiting`, `loaded` e `confirmed` para mostrar as fases de carregamento e intervalo. O campo `readiness.canStart` do mundo descreve a abertura de uma rodada nova.
- Gol anulado usa `goal_disallowed`, que tem efeito de apresentação sem incremento no placar. A versão do motor vem em `replay.version`. A candidata usa 0.5.2 e reproduz 0.5.0 e 0.5.1.
- O payload de elenco preservará `formation`, `starters`, `bench`, `reserves` e `opening.modeledTactics`. O material acompanhado só pela súmula deve continuar identificado como tática do jogo.
- Saves antigos, dados de contratos e permissões continuam sendo lidos pelo servidor. Usar o retorno real das operações e tratar conflito de versão sem repetir automaticamente uma mutação.

## Decisões e verificação

- Base 0.10.1 escolhida por conter dois commits além da main, revisados no PR #19. Esse trabalho não deve retornar como alteração nova nos PRs Master.
- Conservar o Ultra Motion X fixado na versão da base e reaproveitar os componentes aprovados.
- Evidências e limitações ficam em `AUDITORIA-MASTER.md` e no relatório de engenharia. A revisão integrada depende do segundo PR e dos resultados de CI, navegador e Windows.

## Entregas em revisão

- Equipe A no [PR #20](https://github.com/Andresilvadev-br/BRASFC/pull/20). Foram concluídos o contrato `readiness`, o catálogo v3, a versão 0.5.2 do motor, as barreiras de publicação e os ensaios atualizados. O [relatório de engenharia](RELATORIO-MASTER.md) reúne os resultados, os commits e as pendências.
- Equipe B no [PR #21](https://github.com/Andresilvadev-br/BRASFC/pull/21), em rascunho. Ela registrou as entregas de legibilidade, elenco, resultados recentes e indicadores de presença. Seu rascunho aponta inicialmente para a main e inclui a base anterior por ancestralidade. Na entrega, apontar para a branch de integração após o CI desta recebê-la.
- A interseção de arquivos nas duas branches identificada até `e9e21c3` é este documento, criado por ambas. Na integração, preservar o contrato implementado e o registro da Equipe B. Não há necessidade de reaplicar separadamente o PR #19, pois seus dois commits já integram a base comum.
