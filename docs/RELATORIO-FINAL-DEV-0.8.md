# BRASFC Dev 0.8.0
## Relatório de encerramento | 19 de novembro de 2026

**Veredito · NÃO APROVADA para encerramento.** A temporada cooperativa e a atualização Windows com save anterior foram demonstradas. A cena de gol anulado, o rollback após falha de instalação e a carga de produção ainda têm critérios abertos. O [PR #5](https://github.com/Andresilvadev-br/BRASFC/pull/5) permanece em revisão, sem promoção à produção.

### Funcionalidades entregues

- Capitão, vice e sucessores na tática. O motor passa a braçadeira ao próximo atleta elegível. As preferências válidas sobrevivem a mudanças de elenco, reconexões e à virada de temporada.
- Instruções individuais por posição e função, com influência real no posicionamento 2D. O servidor valida permissões e compatibilidade. Treinador e auxiliar usam as regras existentes no intervalo.
- Entrada das equipes, escalações, lances oficiais, placar, acréscimos, áudio opcional, resumo pós-jogo e cobranças reais da disputa de pênaltis. As cenas podem ser aceleradas, ocultadas ou puladas localmente.
- Arquivos centrais. Motor e comandos em `engine/match.ts` e `domain/player-orders.ts`. Rodadas em `server/live-round.ts` e `connected-world.ts`. Interface em `BroadcastMoments.svelte`, `LiveMatch.svelte` e `PlayerOrders.svelte`.

### Evidências da temporada e da regressão

- Servidor Node e PostgreSQL 18.6, quatro clientes com HTTP e WebSocket, dois clubes humanos, treinador e auxiliar no mesmo clube e atleta humano. O teste percorreu **51 etapas**, registrou **1.741 partidas** e avançou de **2026 para 2027** em **5min54s**. Até 78 confrontos por etapa. O relógio do servidor foi acelerado para comprimir as esperas.
- Foram **4.248 chamadas HTTP** sem erros. Uma leitura posterior do banco conferiu **4.833 gols**, todos com evento correspondente, registro dos campeões, carreira preservada e nenhuma rodada aberta.
- Chromium em três clientes e três tamanhos de tela. Conferi a Dynamic Island, o intervalo, as cenas opcionais e a restauração do capitão e da instrução após reiniciar o servidor.
- Regressão executada com `npm run verify` em PostgreSQL e PGlite. **140 testes**, tipos e build de produção passaram.

### Desempenho e limite da evidência

- Prontidão P50/P95/P99 de **24,6 / 242,4 / 347,3 ms**. Pulsos da partida **76,3 / 241,6 / 319,2 ms**. Confirmação de intervalo **7,4 / 13,4 / 18,2 ms**. Pico do servidor **405 MiB de RSS** e **156% de CPU** na escala Linux.
- O ensaio exige avanço correto, ausência de duplicação e zero erros HTTP. Na carga progressiva, os pulsos tiveram P95 de 432,7 ms com quatro clientes e de 739,1 a 876,4 ms com oito clientes em duas salas. As duas salas concluíram a rodada sem erros. O cenário acelerado de oito clientes superou o alvo local de 500 ms, escolhido para deixar folga no intervalo normal de consulta de 950 ms. A capacidade da VPS segue sem medição.

### Atualização Windows e pendências

- O ensaio real passou no Windows. A versão 1.3.0 gravou conta, preferência e a primeira rodada. O atualizador exibiu a falha de download, aceitou nova tentativa e instalou o 1.4.0 via NSIS. Após a abertura automática, conferi conta, preferência e placar antigos e avancei a segunda rodada. O ensaio passou após liberar o depurador que mantinha aberta a instância antiga. [Execução e evidência](https://github.com/Andresilvadev-br/BRASFC/actions/runs/44533969249).
- O motor interrompe ataques em impedimento antes de finalizar. Falta um evento oficial de gol anulado para a transmissão exibir esse lance fielmente. Também faltam evidência de rollback após falha de instalação e cobertura da capacidade real da VPS.

**Rastreabilidade.** [Procedimento reproduzível](https://github.com/Andresilvadev-br/BRASFC/blob/dev-0.8-live-match/docs/VALIDACAO-0.8.md) · [Métricas e rodadas](https://github.com/Andresilvadev-br/BRASFC/blob/dev-0.8-live-match/docs/evidencias/dev-0.8-temporada.json) · [Carga progressiva](https://github.com/Andresilvadev-br/BRASFC/blob/dev-0.8-live-match/docs/evidencias/dev-0.8-carga-progressiva.json) · [Auditoria do banco](https://github.com/Andresilvadev-br/BRASFC/blob/dev-0.8-live-match/docs/evidencias/dev-0.8-auditoria-banco.json).
