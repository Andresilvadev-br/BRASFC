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

Adicionar `readiness` ao snapshot de `GET /api/rooms/:code/world` e disponibilizar a leitura leve `GET /api/rooms/:code/world?readiness` para mudanças de presença, com `revision` e o mesmo objeto de prontidão. Continuar usando o evento de sala do WebSocket para detectar entrada, saída e reconexão, e o evento de revisão para detectar comandos confirmados. A resposta HTTP é a autoridade para determinar a aptidão.

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

- As coordenadas, a bola e os eventos seguem o estado oficial. Interpolar movimentos visualmente dentro dos limites do campo. Gol anulado usa `goal_disallowed`, que tem efeito de apresentação sem incremento no placar.
- O payload de elenco preservará `formation`, `starters`, `bench`, `reserves` e `opening.modeledTactics`. O material acompanhado só pela súmula deve continuar identificado como tática do jogo.
- Saves antigos, dados de contratos e permissões continuam sendo lidos pelo servidor. Usar o retorno real das operações e tratar conflito de versão sem repetir automaticamente uma mutação.

## Decisões e verificação

- Base 0.10.1 escolhida por conter dois commits além da main, revisados no PR #19. Esse trabalho não deve retornar como alteração nova nos PRs Master.
- Conservar o Ultra Motion X fixado na versão da base e reaproveitar os componentes aprovados.
- Evidências e limitações ficam em `AUDITORIA-MASTER.md` e no relatório de engenharia. A revisão integrada depende do segundo PR e dos resultados de CI, navegador e Windows.
