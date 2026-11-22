# BRASFC | Auditoria Master

Data em Recife: 21/11/2026. Escopo: Equipe A, Engenharia. A referência publicada no GitHub é BRASFC 0.10.0 e Windows 1.4.8. O desenvolvimento parte de BRASFC 0.10.1, commit `28f4fdca57bb5f1b27ba58c703a4bf9628ebe221`, que inclui a Central de Carreiras e a apresentação pré-jogo do [PR #19](https://github.com/Andresilvadev-br/BRASFC/pull/19). A `main` e a `dev` apontavam para `770d876f5a9e937307fc852141035b6a564d3560` na auditoria.

## Confirmados no código

| Área | Evidência da base | Situação inicial |
| --- | --- | --- |
| Publicação web | `.github/workflows/deploy.yml` publica a imagem e termina com sucesso quando as etapas de VPS são ignoradas. A consulta pública, quando executada, aceita qualquer versão saudável. | Separar o resultado do registro, da instalação e do commit confirmado. |
| Navegador | O job multiplayer em `.github/workflows/ci.yml` roda apenas em eventos de PR, enquanto Deploy reutiliza o CI em push. | Incluir a jornada no CI reutilizável. |
| Windows | `.github/workflows/desktop.yml` gera e publica em push na main, mas restringe atualização com save e injeção de falhas a PR para dev com alteração desktop. | Exigir o ensaio no caminho que publica. |
| Escalação inicial | Arquivos v2 registram 154 clubes em 4-3-3 e dois em 4-2-3-1. A maioria das súmulas só documenta a convocação. O jogo usa a estimativa de catálogo na primeira rodada, na escalação inicial e no universo da IA. | Preservar a fonte e os titulares. Diferenciar a estimativa tática da referência documentada. |
| Prontidão | `connected-world.ts` valida a prontidão com a presença do hub no momento do comando. A contagem no lobby usa o conjunto visual de inscritos e tem caminho para mostrar “Todos prontos” com pessoas desconectadas. | Expor o estado autoritativo para a Equipe B. |
| Documentação | O README indica Dev 0.3. Relatórios históricos e instruções atuais convivem com datas e conclusões diferentes. | Atualizar os pontos de entrada. Conservar relatórios datados como histórico. |

## Confirmados por evidência de execução

- Deploy da main em [44964815683](https://github.com/Andresilvadev-br/BRASFC/actions/runs/44964815683). Tipos, banco e build aprovados. Publicação de imagem aprovada. SSH, instalação e URL pública ignorados. O job de navegador foi ignorado.
- Windows em [44964815665](https://github.com/Andresilvadev-br/BRASFC/actions/runs/44964815665). Autoteste e instalador aprovados. Atualização com save e cenários de recuperação ignorados. A [release 1.4.8](https://github.com/Andresilvadev-br/BRASFC/releases/tag/v1.4.8) existe.
- A execução 44968239194 do PR #19 já concluiu o job multiplayer de navegador. Seu cenário exercita a criação e o lobby de treinador e atleta. A biblioteca de saves requer uma jornada própria.
- A URL usada pelo aplicativo para o modo online é `https://aldetes.vps-kinghost.net`. A leitura de `/api/health` recebeu HTTP 403 do proxy do ambiente. O commit público ficou sem comprovação. A implantação automática da VPS pode operar independentemente do SSH do Actions.

## Identificados visualmente

As capturas do [ensaio do PR #20](https://github.com/Andresilvadev-br/BRASFC/actions/runs/44969738667/artifacts/14733051997) confirmam a biblioteca em 1920 × 1080 e 390 px, e o lobby de atleta em desktop. A checagem automatizada da biblioteca também passou nas larguras 1366, 1600 e 2560. No campo, o diagnóstico do motor confirmou a convergência de vários marcadores ao mesmo ponto. O relatório registra a redução medida após a correção, com renderização final sob responsabilidade da Equipe B.

## Riscos técnicos

- O motor autoritativo e os replays compartilham código. Qualquer alteração de movimentação deve manter a versão e a reprodução de sessões iniciadas anteriormente. O cache de partidas deve reconstruir a partir do checkpoint persistido.
- A homologação da Dev 0.8 registrou P95 de 739–876 ms para o relógio em oito clientes locais com tempo acelerado. O ensaio datado não comprova a situação da VPS nem o desempenho desta candidata.
- O deploy atual continua mesmo se o backup falhar. A produção requer validação do backup e do commit, além de aprovação da publicação.
- A alternância de mando, a tabela de competições, o mercado, os contratos e as permissões já têm testes. A cobertura de testes de componentes e a duração da temporada devem ser medidas separadamente do desempenho do servidor. O simulador offline usa PGlite e a VPS usa PostgreSQL.

## Já corrigidos em versões recentes

- Criação de liga idempotente e etapas de seleção, participação, lobby e convites no PR #17. A publicação em main veio pelo PR #18.
- Gol anulado oficial, visível no protocolo de eventos do motor e coberto por `tests/disallowed-goal.test.ts`. A compatibilidade de replay admite versões 0.5.0 e 0.5.1.
- A 0.10.0 reformulou a Central do Jogador, partes do multiplayer e a transmissão ao vivo. Os três modos de transmissão e o Ultra Motion X integrado continuam presentes. A dependência está fixada em `25344fb5d525613860402e2a13ee22f782333eaa`.
- O PR #19 já traz a Central de Carreiras, listagem e exclusão isoladas, renovação do menu Continuar e migração aditiva `0012`. O fluxo real no navegador complementa a regressão de banco.
- Existe ensaio real de recuperação Windows e há mecanismos de rollback. A lacuna demonstrada está no gatilho da publicação recente.

## Melhorias recomendadas

- Dar prioridade a integridade dos saves, prontidão autoritativa, proteção da publicação, escalações iniciais e medição de concorrência. Usar fixtures e instâncias descartáveis para todas as gravações do ensaio.
- Medir aglomeração, distribuição por função e continuidade temporal antes de calibrar o campo. Manter o consumidor visual sobre o estado oficial.
- Homologar a candidata em ambiente equivalente à VPS e no Windows, com evidências do jogo, da gravação e da atualização interna.
