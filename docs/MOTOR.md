# BRASFC Football Engine (Dev 0.2)

Motor próprio, em TypeScript puro (`src/lib/engine`), sem dependência da Ultra Motion X (que continua responsável só por animação de interface). Roda igual no navegador e no servidor.

## Princípios

- **Determinístico**: mesma semente + mesmas decisões ⇒ mesma partida, evento por evento (RNG `mulberry32`, sementes derivadas por hash FNV).
- **Estado e eventos**: o estado (posições, bola, cansaço, cartões) evolui por *ticks* de 1 segundo; tudo o que acontece vira um `MatchEvent`.
- **Estatísticas só a partir dos eventos** (`stats.ts`): se não houve evento, não existe número.
- **A apresentação não altera a simulação**: velocidade 1×–8×, pausa e "pular para o resultado" só mudam quantos ticks são processados por quadro.

## Campo e coordenadas

Campo de 105 × 68 m. Coordenadas absolutas com o mandante atacando +x; cada time raciocina em coordenadas **relativas** (`toRel`), sempre atacando para a direita.

## Ciclo de um tick (`Match.step`)

1. Aplica decisões (treinador humano na fila; treinador automático da IA).
2. Bola parada → cobra no tempo certo; bola em jogo → portador decide ou sofre pressão; bola no ar → chega ao destino.
3. Movimenta os 22 atletas (forma tática, bloco, pressão, marcação, linha de impedimento).
4. Cansaço, posse, relógio (acréscimos calculados das paradas reais).

## Decisão do portador

Cada opção recebe uma utilidade: finalizar, passar para cada companheiro visível (alcance pela *visão*), passe em profundidade, cruzamento, drible, condução ou afastar. A escolha é um *softmax* cuja temperatura cai com o atributo **decisões** — bons jogadores escolhem melhor, mas nunca de forma robótica.

- **Passe**: chance pela distância, atributos (passe, técnica, visão), condição física e adversários na linha (interceptação ponderada por antecipação).
- **Impedimento**: julgado pela posição do recebedor **no momento do passe** contra o penúltimo defensor.
- **Finalização**: xG por curva logística de distância × ângulo, reduzido por pressão e pela densidade defensiva; resultado depende de finalização/cabeceio, compostura e do goleiro (reflexos, posicionamento, defesa).
- **Desarme e falta**: duelo desarme × drible; chance de falta cresce com desarme baixo, cansaço e entrada de dribles; cautela dentro da área e com amarelo.
- **Jogo aéreo**: cabeceio, impulsão, força e posicionamento; o goleiro pode sair (saídas, jogo aéreo).

## Táticas (`tactics.ts`)

| Parâmetro | O que muda |
|---|---|
| `defLine`, `blockLength` | altura da linha e compactação do bloco |
| `pressDistance`, `pressers` | quando e quantos pressionam |
| `progressWeight`, `safetyWeight` | arriscar para frente × manter a posse |
| `shortBias`, `longBias`, `wideBias` | passes curtos, lançamentos, jogo pelos lados |
| `tempo` | rapidez na decisão |
| `counterBoost` | aceleração nas transições |
| `passAccuracy` | precisão de passes (estilos arriscados erram mais) |
| `boxDefense` | densidade na própria área (bloqueios, marcação na recepção, pressão no chute) |
| `fatigueCost` | custo físico (pressão alta cansa) |

Equilíbrio medido (`node scripts/engine-stats.ts 160 --taticas`, adversário em Equilibrada/Posse): nenhuma mentalidade ou estilo vence todas; a Defensiva sofre menos e marca menos; a Pressão alta marca mais e sofre mais.

## Calibração atual (160 partidas, times de força média)

| Métrica | Motor | Referência profissional |
|---|---|---|
| Gols por jogo | ~2,3 | 2,3–2,7 |
| Finalizações por time | ~12,5 | 11–14 |
| Precisão de passe | ~78% | 78–84% |
| Faltas por jogo | ~18 | 20–28 |
| Escanteios por jogo | ~10,7 | 9–11 |
| Vitórias do mandante | ~44% | 45–50% |
| Tempo por partida | ~110 ms | — |

Limitações conhecidas: impedimentos um pouco acima do real (~6,8/jogo); o time muito mais forte vence ~90% contra o mais fraco (ajustável pela base de dados); a "forma do dia" (±7%) é a principal fonte de zebras.

## Treinador automático

Substitui lesionados e cansados (respeitando 5 trocas em 3 paradas), parte para o ataque quando perde no fim e recua quando vence. Na reprodução do servidor ele roda de novo — é determinístico.

## Reprodução autoritativa

O cliente envia apenas as **decisões do lado humano** (com o tick). O servidor monta a mesma partida (semente derivada da carreira + rodada), reproduz e grava o placar que ele mesmo calculou. Teste: `tests/engine.test.ts` e `tests/db.test.ts`.

## Notas (`rate`)

Partem de 6,0; somam e subtraem pelo que o atleta fez, com pesos por função (desarme vale mais para zagueiro, defesa difícil para goleiro). Não há bônus por vitória. Faixa 3,0–10,0.

## Arquivos

- `attributes.ts` — atributos, rótulos, pesos do overall, arquétipos e geração.
- `types.ts` — tipos públicos e `ENGINE_VERSION`.
- `match.ts` — a simulação.
- `stats.ts` — estatísticas e notas a partir dos eventos.
- `narration.ts` — frases de narração geradas dos eventos.
- `teams.ts` — conversão de elencos em `TeamSetup`.
- `scripts/engine-stats.ts`, `scripts/engine-diag.ts` — calibração.
