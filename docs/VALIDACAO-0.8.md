# Validação de encerramento da Dev 0.8.0

## Temporada integrada

Execute somente com um PostgreSQL descartável e o servidor escutando em loopback. O cliente inscreve quatro contas por HTTP e WebSocket, percorre os passos reais do calendário e encerra a temporada usando a API oficial. Use o mesmo arquivo de evidência para comparar percentis em ambientes equivalentes.

```sh
npm ci
npm run build
cat > /tmp/brasfc-validation-clock.mjs <<'JS'
const realNow = Date.now.bind(Date);
const start = realNow();
Date.now = () => start + (realNow() - start) * 300;
JS
export DATABASE_URL=postgres://brasfc:brasfc@127.0.0.1:5432/brasfc_validation
export HOST=127.0.0.1 PORT=4151 ORIGIN=http://127.0.0.1:4151
node --import /tmp/brasfc-validation-clock.mjs server/index.js &
game_pid=$!
BRASFC_TEST_PID="$game_pid" node scripts/validate-live-season.mjs /tmp/brasfc-season.json
kill "$game_pid"
```

A aceleração só altera os prazos de apresentação e o ritmo solicitado de simulação no processo de teste. O motor, os limites de ticks por chamada, as rotas, o banco e as transações permanecem ativos. Os percentis usam tempo real medido pelo cliente. As métricas CPU e RSS cobrem o processo Node em Linux. O programa considera uma etapa concluída quando o servidor grava os confrontos sem duplicação e confirma o avanço. A passagem anual exige o incremento do ano e a preservação da carreira do atleta.

Para comparar carga, defina `BRASFC_TEST_ROUNDS=1` e execute primeiro uma instância do cliente, depois duas instâncias em paralelo com arquivos de saída diferentes. Use a mesma instância do servidor e do banco. O cenário de duas salas ocupa oito conexões WebSocket. O alvo local de P95 de 500 ms para o relógio deixa folga antes da próxima consulta normal de 950 ms. As chamadas aceleradas geram carga mais concentrada que a cadência da interface.

## Atualizador Windows

O workflow **App Windows** do PR faz o teste em runner descartável. Ele baixa o instalador estável 1.3.0, instala, cria um perfil offline, salva uma carreira e disputa a primeira rodada pelo aplicativo. O pacote candidato da execução é oferecido em um servidor HTTP de loopback, com o hash produzido pelo NSIS e lido pelo atualizador existente. O fluxo testa uma resposta de erro do servidor de download, a tentativa seguinte, a instalação pelo aplicativo e a continuidade da carreira depois de atualizar. O JSON de evidência é guardado como artefato, inclusive em falhas.

A configuração temporária do feed e a depuração Chromium só são usadas pelo teste. O workflow de release continua usando o provedor normal do aplicativo.

## Cinematográficas

Use a sala cooperativa para abrir a apresentação, mudar a velocidade ou pular cenas, verificar escalações e braçadeiras, e acompanhar dados de lances e placares. Na Copa, confira a sequência de cobranças contra a decisão oficial. Dentro do intervalo, altere a instrução de um titular e a hierarquia, e compare os estados vistos por dois participantes após a reconexão. Nas partidas locais, o painel de lances consome a mesma sequência de eventos, ajustada ao relógio da partida.
