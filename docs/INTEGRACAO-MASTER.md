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

#### Pendência de integração em 22/11/2026

No [PR #21](https://github.com/Andresilvadev-br/BRASFC/pull/21) em `ee26cf8`, o lobby e a tela de rodada leem a prontidão do snapshot do mundo. Com dois atletas prontos, fechar a sessão de um deles atualiza a presença via WebSocket. A lista de membros e a revisão do mundo permanecem iguais, então o resumo do lobby conserva **2 de 2 prontos e online**. Na temporada iniciada, o botão de simulação também continua habilitado com **Apto a iniciar a rodada**.

O endpoint `/world?readiness` devolve `readyCount: 2`, `readyOnlineCount: 1` e `canStart: false` para a mesma revisão. O servidor recusa `advance` com HTTP 409, sem gravação e sem rodada ativa. Na reconexão, `readyOnlineCount` volta a 2 e `canStart` volta a `true` se a temporada já tiver iniciado.

O ensaio no Chromium com PostgreSQL 16.16 isolado reproduziu a divergência no build conjunto dos PRs #20, #21 e #22. Os três testes de rodada em `tests/live-round.test.ts` passaram com PGlite e com PostgreSQL.

- **Equipe B.** No consumidor do estado, invalidar a prontidão quando `members[].online` mudar ou o cliente reconectar. Solicitar a leitura leve, aceitar o retorno com a mesma revisão e descartar respostas de presença anteriores à transição mais recente. Enquanto a confirmação estiver pendente, bloquear a simulação. Atividade na sala sem mudança de presença pode reaproveitar o estado atual.
- **Equipe A.** A cobertura em `tests/live-round.test.ts` verifica a queda e a recuperação da aptidão na mesma revisão, a rejeição do avanço e a ausência de rodada antes de reconectar.
- **Aceitação conjunta.** Em duas sessões reais, confirmar a prontidão no lobby, desconectar um participante e observar o contador cair de 2 para 1. Reconectar, iniciar a temporada e repetir em Dia de jogo. O contador e o botão devem acompanhar `readiness` em ambas as transições. Depois de reconectar, o proprietário deve conseguir abrir a rodada.

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
- No build conjunto dos PRs #20, #21 e #22, o Chromium validou a biblioteca offline em cinco resoluções. Após reiniciar o servidor local com o mesmo banco, a carreira de treinador renomeada carregou com a mesma versão de save e a carreira de jogador excluída permaneceu ausente. O ensaio rodou no Linux com PGlite. A atualização integrada do instalador ainda precisa ser exercitada no Windows.

## Entregas em revisão

- Equipe A no [PR #20](https://github.com/Andresilvadev-br/BRASFC/pull/20). Foram concluídos o contrato `readiness`, o catálogo v3, a versão 0.5.2 do motor, as barreiras de publicação e os ensaios atualizados. O [relatório de engenharia](RELATORIO-MASTER.md) reúne os resultados, os commits e as pendências.
- Equipe B no [PR #21](https://github.com/Andresilvadev-br/BRASFC/pull/21), aberto para revisão na branch de integração, com legibilidade, elenco, resultados recentes e indicadores de presença. O [PR #22](https://github.com/Andresilvadev-br/BRASFC/pull/22) parte da branch de experiência e reúne as alterações de partida ao vivo. A pendência de prontidão deve ser corrigida e revalidada antes da integração.
- A interseção de arquivos nas duas branches identificada até `e9e21c3` é este documento, criado por ambas. Na integração, preservar o contrato implementado e o registro da Equipe B. Não há necessidade de reaplicar separadamente o PR #19, pois seus dois commits já integram a base comum.

---

## Equipe B — Claude (experiência, interface e animações)

### Base e branches

| Item | Valor |
|---|---|
| `main` verificada | `770d876` — BRASFC 0.10.0 / Windows 1.4.8 (publicada) |
| PR anterior ainda aberto | **#19** (`dev-87mxsh`): `7351b9d` apresentação pré-jogo + `28f4fdc` Central de carreiras (0.10.1) |
| Branch desta etapa | `improvement/master-experience`, criada a partir de `28f4fdc` (= `770d876` + PR #19) |
| PR desta etapa | **#21**, com destino `improvement/master-integration`, como combinado pelo Codex |

Integrar a `improvement/master-experience` dispensa o #19, que pode ser fechado depois da integração.

### Arquivos fora da área da Equipe B (herdados do PR #19, criados antes da divisão de responsabilidades)

Peço revisão do Codex. A partir de agora não altero esses arquivos sem combinar antes.

| Arquivo | Alteração | Motivo |
|---|---|---|
| `migrations/0012_career_label.sql` | `ALTER TABLE careers ADD COLUMN label TEXT` (aditiva) | Nome do save sem tocar em `data`, `version` ou `id` |
| `src/lib/server/repos/careers.ts` | `renameCareer`, `cleanCareerLabel`, coluna `label`, divisão calculada em `listCareers(compact)` | Biblioteca de saves |
| `src/routes/api/careers/[id]/+server.ts` | `PATCH { action: 'rename', label }` | Renomear save |
| `src/routes/continuar/+page.server.ts` | Carrega carreiras e atalhos das ligas abertas | Biblioteca de saves |
| `src/lib/domain/career.ts` | Campos opcionais `label` e `division` em `Career` | Tipagem da listagem |
| `src/lib/domain/saves.ts` (novo) | `saveIssue`, `latestValidSave`, `sortSaves`, `saveTitle` | Regras da biblioteca. Se preferir, o Codex pode assumir o arquivo |
| `tests/saves.test.ts`, `tests/live-round.test.ts` | 12 cenários de saves e a lista de migrações com a 0012 | Testes |

### Contratos de API que a interface usa (sem mudança de formato nesta etapa)

- `PATCH /api/careers/:id` com `{ action: 'rename', label: string | null }` → `{ ok, label }`. Retorna 400 para nome com mais de 40 caracteres e 404 para carreira de outro perfil.
- `DELETE /api/careers/:id` → `{ ok }` ou 404.
- Sessão da rodada ao vivo: `phase`, `required`, `confirmed`, `waiting`, `loaded` e `fixtures[{ competition, home, away, score, phase, minute }]`. O placar da rodada agrupa por `competition`.
- Lobby (`ConnectedWorld` / realtime): `members[].online` e `assignment.ready`.

### Pendências entre equipes (Claude → Codex) — situação

1. **Estado "apto a iniciar" — ATENDIDO pelo Codex (`readiness`).** O lobby já consome o contrato: anel `readyOnlineCount / requiredCount`, status por `canStart` e desconectados por `participants[].online` dos obrigatórios. Sem o campo (branch isolada), mantém a dedução anterior. A pendência original era: O lobby hoje deduz a presença por `members[].online` e a prontidão por `assignment.ready`. A diretriz pede que o frontend não adivinhe. Proposta de contrato para o Codex, no estado do mundo e na sessão:
   ```ts
   readiness: {
     required: string[];   // perfis obrigatórios para a próxima rodada
     ready: string[];      // confirmaram preparação
     online: string[];     // conectados agora
     canStart: boolean;    // regra real da liga cumprida
     blockedBy?: Array<{ profileId: string; reason: 'offline' | 'not_ready' | 'loading' }>;
   }
   ```
   Assim que existir, o anel do lobby e o do intervalo passam a usar `canStart` e `blockedBy` em vez da dedução atual. Enquanto isso, o lobby já separa "prontos" de "desconectados" e não mostra mais "Todos prontos" com alguém offline.
2. **Campo 2D (A5) — RESPONDIDO pelo Codex** (metros em 105×68, `tick` em segundos, `px/py` posição anterior, interpolar só entre os dois últimos quadros oficiais). Fase 3 da Equipe B parte desse contrato. A pergunta original era: A interface vai interpolar só entre estados oficiais consecutivos (`tick`) e não vai mover jogadores para posições inventadas. Preciso que o Codex confirme se cada quadro enviado (`players[].x/y`) já está em metros do campo (`PITCH.length`/`PITCH.width`) e qual é o intervalo real entre ticks na transmissão.
3. **Formações (A4).** A interface mostra a formação de qualquer clube sem supor 4-3-3. Quando o catálogo mudar, nenhuma alteração visual é necessária.

### Entregas desta etapa

**Fase 1 — estabilização da interface**
- Auditoria de layout no navegador (`scripts/audit-layout.mjs`), só em texto, sem capturas:
  - 31 rotas, com carreira de treinador (rodadas jogadas) e carreira de jogador;
  - larguras 1920×1080, 1600×900, 1366×768, 390×844 e 320×640;
  - mede rolagem horizontal, elementos fora da viewport e erros de console.
- Corrigido:
  - estouro a 320 px em Nova carreira, Novidades, Finanças, Notícias, Gabinete e na tabela do Painel;
  - 33 regras com texto de 9 a 10,5 px subiram para o mínimo de 11 px.
- Resultado final: 0 telas com rolagem horizontal e 0 erros de console nas 5 larguras.

**Fase 2 — reformulação**
- **Elenco:** separação explícita entre Titulares, Banco (relacionados, até 9) e Fora da relação, nas três visões (campo, cartões e lista). Usa a mesma relação da Central de Táticas.
- **Central do Treinador:** nova faixa "Resultados recentes" com placares oficiais (V/E/D, competição e rodada).
- **Lobby e seção Rodada:** a prontidão diferencia "prontos" de "online" e usa o contrato `readiness` quando presente. Na seção Rodada, `canStart` libera "Simular rodada oficial" (o servidor revalida), e o novo `ReadinessRing` mostra `readyOnlineCount / requiredCount`.
- **Calendário:** placar e V/E/D nos jogos disputados, Copa × Liga, próximo jogo em destaque, resumo do mês e agenda em cards.
- **Criação de liga:** painel de configuração com prévia ao vivo. As vagas ficam num stepper, privacidade, calendário e competições em cards, e temporada e dificuldade em pílulas. Os campos e o envio são os mesmos.
- **Comissão técnica e criação de liga:** novo `Switch` acessível, com descrição fiel ao que o servidor faz.
- **Telas auditadas e mantidas** (já usam componentes de jogo adequados ao conteúdo): Treinos (planejador, previsão, sugestão e foco em cards), Mensagens (leitor em dois painéis com filtros e estados), Comissão (cards por cargo com efeito real), Mercado (`MarketWorkspace` da 0.8.5), Competições, Notícias e Estatísticas.

### Verificado no navegador (Playwright, dev server com PGlite)

- Elenco: 11 titulares, 9 no banco e 3 fora da relação, iguais nas visões campo e lista.
- Painel: 3 resultados oficiais após 3 rodadas ("Empate", "Vitória", "Derrota").
- Comissão: a chave de delegação desliga → liga e continua ligada depois de recarregar (gravada no servidor).
- `tests/multiplayer-browser.mjs` (fluxo completo de treinador e atleta, convites, recarga e 4 larguras) passou contra o build de produção, com a temporada inicial escolhida pelo novo controle.

### Ensaio de integração (local, sem push)

Mesclei `improvement/master-engineering` (`f1a8d48`) com esta branch numa branch local temporária, já apagada:
- único conflito: este documento (add/add). Resolvido mantendo este arquivo, que já contém o texto do Codex na íntegra;
- `npm run check`: 691 arquivos, 0 erros, 0 avisos; `vitest`: 187 aprovados, 3 ignorados;
- `tests/multiplayer-browser.mjs` (porta 3000) e `tests/career-browser.mjs` (offline, porta 3001) passaram contra o build mesclado;
- seção Rodada de uma liga real: o servidor enviou `requiredCount 1`, `readyOnlineCount 0`, `canStart false`, e a tela mostrou "0/1 · 0 de 1 obrigatórios prontos e online".

### Fase 3 — partida (branch `improvement/master-experience-match`, PR empilhado sobre o #21)

- **Campo ao vivo interpolado** (`frame-tween.ts`): anda do que está na tela até o último quadro oficial, no ritmo real de chegada. Corta direto para substituição, reposição (> 22 m), nova sessão e movimento reduzido. Placar e eventos seguem só o quadro oficial. Medido numa rodada ao vivo real em 4 s: **4 imagens distintas sem interpolação × 162 com**.
- **Intervalo e súmula:** `StatsCompare` com posse, finalizações, no alvo, xG, passes certos, escanteios, faltas, impedimentos e cartões, tudo de `match.stats.teams`.
- **Cenas de evento:** escudo do time do lance (pelo `side` do evento oficial), ao vivo e offline. Observadas 53 cenas, todas com o escudo.
- Validado até o intervalo numa liga real: 10 linhas de estatísticas, prontidão do 2º tempo "0/1", sem overflow e sem erros de página.

### Fase 5 — homologação visual

- `scripts/capturas-homologacao.mjs`: roteiro igual para `770d876` (0.10.0 publicada) e para esta branch. Gerou 28 capturas em `docs/homologacao/`: 10 telas a 1366 × 768 e 4 a 390 × 844, todas com status 200.
- O relatório final da Equipe B está em `docs/RELATORIO-EQUIPE-B.md` e `.pdf`, com as comparações, os testes, as pendências e os riscos.

### Próximas etapas da Equipe B

- **Fase 2:** Treinos, Mercado, Calendário, Competições, Notícias, Configurações, Criação de ligas e Comissão técnica.
- **Fase 4:** lobby e intervalo com o contrato `readiness`, que depende da pendência 1.
