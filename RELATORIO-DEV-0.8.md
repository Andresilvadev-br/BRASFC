# BRASFC Dev 0.8.0
## Relatório técnico | Ultimate Football Experience

**Estado.** Entrega registrada em branch de desenvolvimento. O [PR #5](https://github.com/Andresilvadev-br/BRASFC/pull/5) está em rascunho. O jogo usa a versão 0.8.0 e o candidato Windows usa 1.4.0.

### Rodadas e persistência

- O servidor valida presença, prontidão e carregamento antes da apresentação. O intervalo congela todos os confrontos até a confirmação dos participantes. A desconexão suspende a progressão.
- A migração 0007 separa os dados imutáveis da rodada dos checkpoints de relógio, decisões e confirmações. A recuperação reconstrói a simulação pelo motor e pelo registro de comandos. A gravação oficial usa a transação de conclusão já existente.
- O treinador comanda a equipe. O auxiliar pode sugerir e só pode comandar com delegação própria. A permissão de treino continua independente. Mudanças relevantes na preparação revogam a prontidão.

### Interface e transmissão

- A Central da Rodada e a Dynamic Island mostram presença, atividade geral e prontidão. A ilha sai ao começar a apresentação. Avisos comuns ficam em toasts.
- A transmissão oferece apresentação pulável por participante, escalações e reservas, campo sincronizado em modos clássico e pixel, narração, placares dos jogos da rodada, lances e painel de intervalo.
- Substituições, formação, mentalidade, estilo e pressão usam comandos reais do motor. O replay oficial conserva as decisões aplicadas.

### Validação

- O comando `npm run verify` passou com PostgreSQL real e PGlite. Foram 138 testes aprovados, além da verificação de tipos e do build de produção.
- O teste cooperativo usa três perfis, vários confrontos, duas substituições oficiais, sugestões do auxiliar, bloqueio por desconexão, restauração do motor pelo registro persistido e conclusão idempotente.
- A migração foi aplicada em banco descartável com um registro de universo 0.7 e seus membros. A segunda execução foi idempotente.
- No Chromium, três clientes confirmaram a prontidão, viram as atividades e iniciaram a abertura com a ilha oculta. O ensaio inicial mostrou que três clientes no mesmo IP atingiam o limite geral de requisições e atrasavam a rodada. A correção separou e limitou o tráfego do relógio e as ações do jogo, com validação do comando no endpoint. Após a correção, o Chromium aprovou o canvas, o intervalo coletivo, a reconexão após reinício do processo e as três larguras testadas (390, 950 e 1245 px).

### Desempenho

Doze comandos leves de prontidão no servidor local foram medidos no teste de navegador. Na repetição após a correção, P50 de 6,4 ms e P95 de 10,4 ms. A amostra local anterior da Dev 0.7 registrou P95 de 8,3 ms em 20 comandos leves. As amostras foram obtidas em sessões diferentes. O resultado não mede a VPS, o tempo de propagação entre todos os clientes ou a carga de vários universos ativos.

### Windows, staging e pendências

- A primeira execução Windows do PR passou no autoteste e gerou o candidato Electron/NSIS no GitHub Actions. A atualização real do 1.3.0 para o 1.4.0, incluindo a interrupção do download e a preservação de saves instalados, precisa de teste na plataforma.
- Faltam sequências cinematográficas completas por tipo de lance, escolha de capitão, instruções individuais no jogo, cobertura da temporada inteira pelo modo ao vivo e medições de carga da VPS. O painel atual aplica mudanças de equipe e usa os eventos oficiais.
- O staging e a publicação estável requerem integração e validação do ambiente. A Dev 0.8 ainda não atende todos os critérios de aceitação.

**Commit da implementação.** [`d6e756234557`](https://github.com/Andresilvadev-br/BRASFC/commit/d6e756234557686884bc311fbc306858d97d4dbc).
