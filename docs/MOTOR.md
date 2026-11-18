# BRASFC Football Engine (versão 0.3.0)

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


---

# Dev 0.3 — Inteligência tática

## Instruções avançadas (`instructions.ts`)

18 instruções em três grupos (com a bola, sem a bola, transições). Toda tática tem um **preset** derivado de mentalidade + estilo (modo simples). O motor parte dos parâmetros calibrados do preset e aplica apenas a **diferença** de cada instrução — por isso o modo simples continua exatamente como calibrado.

| Instrução | Efeito no motor | Contrapartida |
|---|---|---|
| Saída de bola | chance de reposição/primeira fase longa | bola longa devolve mais posses |
| Ritmo | tempo de decisão | mais rápido erra mais passes |
| Distância | espaçamento em posse, passes curtos | espaçado alonga os passes |
| Amplitude | largura em posse | menos gente por dentro |
| Corredor | preferência por jogo pelos lados | — |
| Laterais | apoio dos laterais | espaço nas costas |
| Tipo de passe | curtos × longos | longos erram mais |
| Abordagem | avanço × segurança | perde mais a bola |
| Profundidade | corridas às costas e passes em profundidade | impedimentos, inútil contra linha baixa |
| Presença na área | meias que atacam a área | exposição na perda |
| Linha / Bloco | altura da defesa | espaço às costas |
| Pressão | distância e número de pressionadores | cansaço |
| Compactação | comprimento do bloco, densidade na área | lados livres |
| Marcação individual | acompanha mais de perto e mais longe | é arrastada, abre espaços |
| Agressividade | vence mais disputas | mais faltas e cartões |
| Ao recuperar | contra-ataque × reter | — |
| Ao perder | pressão pós-perda (6 s) × recompor | cansaço × cede terreno |

Trocar mentalidade/estilo troca o preset e **mantém** os ajustes avançados (`overridesOf`).

## Funções individuais (`roles.ts`)

20 funções (goleiro tradicional/líbero, zagueiro tradicional/construtor, lateral defensivo/ofensivo, ala, volante marcador, organizador recuado, construtor, área a área, meia infiltrador, armador avançado, meia-atacante infiltrador, ponta clássico/invertido, atacante interior, centroavante de referência, atacante móvel, falso 9). Cada função tem: atributos exigidos, deslocamento espacial (com e sem bola, aproximação do centro), inclinações de decisão (chutar, driblar, cruzar, progredir, jogar seguro, atacar o espaço) e um texto de risco.

- O efeito é **relativo à função padrão da posição**: o time padrão continua calibrado.
- `roleCompatibility` (0–100) compara os atributos-chave com o nível geral do atleta; fora das posições previstas perde 25 pontos.
- A qualidade de escolha do atleta (temperatura da decisão) piora quando a função não combina com ele ou ele ainda não a domina.

## Domínio tático (`domain/tactical.ts`)

Cinco dimensões de 0 a 100, persistidas em `careers.data.tactical`: formação, estilo, compreensão das instruções, entrosamento de cada atleta e domínio de cada atleta em cada função.

- Ganho por partida com retorno decrescente (`k · (1 − v/100)^1,3`), ponderado pela capacidade de aprendizagem (decisões, posicionamento, trabalho em equipe, concentração, antecipação) e pelos minutos.
- Formações e estilos parecidos aprendem juntos (4-3-3 → 4-2-3-1); os demais esquecem devagar (−0,25/jogo acima de 30).
- Mudar instruções derruba 4 pontos por instrução alterada (máx. 30) e volta com o tempo.
- Novos atletas começam com entrosamento 15; quem sai deixa de contar.
- **Execução coletiva** = 35% formação + 25% estilo + 15% instruções + 25% entrosamento dos titulares. No motor: sem a bola, times abaixo de 60 deixam linhas desalinhadas; com a bola, decidem e passam um pouco melhor ou pior. **Não há bônus de gol.**

Medição (`node scripts/engine-mastery.ts 160`, mesmo time contra rival com 60):

| Execução | V | E | D | Gols | Passes certos |
|---|---|---|---|---|---|
| 35 | 44 | 47 | 69 | 1,39–1,68 | 77,8% |
| 60 | 48 | 62 | 50 | 1,45–1,48 | 78,8% |
| 85 | 58 | 56 | 46 | 1,57–1,51 | 79,6% |

## Treinador da IA (`ai-coach.ts`, `domain/coaches.ts`)

- 7 perfis (pragmático, ofensivo, reativo, posse, pressão alta, retranqueiro, equilibrado) com formações preferidas, adaptabilidade e disposição a arriscar. Cada clube recebe um perfil determinístico; há 30% de chance de troca de comando por temporada (domínio do novo técnico começa menor).
- **Plano pré-jogo** contra o usuário a partir do que foi *observado* nos últimos 3 jogos dele (formação, instruções, funções e posse): pressão alta → saída direta; bloco baixo → amplitude e paciência; laterais ofensivos → transição pelos lados; linha alta + atacantes rápidos → profundidade; jogo central → fechar o meio.
- **Durante o jogo**, a cada 5 minutos, com dados visíveis (placar, minuto, finalizações, posse, cansaço médio, expulsões, altura da linha rival quando ela defende): compactar com um a menos, buscar o empate, segurar a vitória, proteger a área, poupar energia, atacar as costas, abrir o campo. Treinadores pouco adaptáveis às vezes mantêm o plano.
- Todas as decisões viram `Decision` reproduzíveis — o servidor as recalcula ao validar a partida.

## Correções e calibração da Dev 0.2

- **Impedimentos** (6,8 → ~2,9/jogo) corrigidos pela lógica: desmarcação temporizada (o atacante só estica quando o passe vai sair), leitura da linha que está subindo (antecipação), posicionamento legal também durante as bolas paradas e leitura do impedimento pelo passador (visão/decisões; impedimentos claros quase nunca são servidos).
- **Formações** além do 4-3-3: meias abertos sobem em posse, alas formam linha de 5 sem a bola, zagueiros guardam o corredor central, o segundo atacante é móvel por padrão, sem troca infinita de passes entre os atacantes, e o finalizador marcado arrisca o chute dentro da área.
- **Notas** recalibradas (média ~6,5; 90% abaixo de 7,6).
- **Desempenho**: `Math.hypot` substituído no laço quente e marcação sem cálculo duplicado.

## Calibração final (200 partidas, times iguais, IA ligada)

| Métrica | Dev 0.2 | Dev 0.3 | Referência |
|---|---|---|---|
| Gols por jogo | 2,26 | 2,52 | 2,49 (Brasileirão 2025, Centauro) |
| Finalizações por time | 12,5 | 12,6 | 11–14 |
| Precisão de passe | 78,1% | 78,8% | 78–84% |
| Faltas por jogo | 17,7 | 24,4 | 24,6 (CIES via Soccerway) |
| Amarelos por jogo | 2,3 | 4,7 | ~5–6 (Brasileirão 2024, netvasco) |
| Escanteios | 10,7 | 11,7 | 9,8 (estudo UFU) |
| Impedimentos | 6,84 | 2,85 | ~3 (sem fonte nacional encontrada) |
| Empates (times iguais) | 32,5% | 30,5% | ~27% (liga, com times desiguais) |
| Vitórias do mandante | 44,4% | 46,5% | 45–50% |

Fontes consultadas em 17/11/2026: Centauro (resumo do Brasileirão 2025), Soccerway (ranking CIES de faltas), netvasco (cartões 2024), repositório UFU (escanteios). Vitórias do mandante e empates: referência geral, sem fonte nacional verificada.

## Limitações conhecidas (medidas)

- Formações contra o 4-3-3 (`node scripts/engine-formations.ts 40`): o 4-3-3 — base da calibração — ainda leva vantagem (1,45 ponto/jogo contra 0,90–1,18 das demais). Esquemas com dupla de ataque finalizam um pouco menos (~9 chutes) e os de três zagueiros cedem mais finalizações (~17). A diferença caiu bastante (antes: 0,38–0,55 ponto/jogo para 3-5-2/5-3-2 e ~5 chutes para quem jogava com dois atacantes), mas não foi eliminada.

## Equilíbrio de estilos (`node scripts/engine-balance.ts 30`, pontos por jogo contra todos)

| Estilo | Dev 0.2 | Dev 0.3 |
|---|---|---|
| Posse de bola | 1,13 | 1,44 |
| Pressão alta | 1,33 | 1,39 |
| Bola longa | 1,49 | 1,34 |
| Jogo pelos laterais | 1,33 | 1,34 |
| Construção vertical | 1,53 | 1,33 |
| Contra-ataque | 1,84 | 1,32 |
| Tiki-taka | 1,51 | 1,26 |

Amplitude: 0,71 → 0,18. Todo estilo tem pelo menos um confronto desfavorável (ex.: pressão alta perde para construção vertical; tiki-taka sofre contra pressão alta; contra-ataque sofre contra pressão alta e vertical).
- Uma rodada da carreira simula 30 partidas (três séries): ~3,8 s em Node (medido em `scripts/season-sim.ts`), ~10 s no servidor de desenvolvimento.
- Jogos IA × IA entre clubes reais têm média de ~3 gols (as diferenças de força entre os clubes aumentam o placar).


## Dev 0.3.1 — recalibração e desempenho

**Causa do excesso de gols:** a calibração da 0.2 usava só times médios em 4-3-3, sem técnicos da IA. Na carreira jogam clubes reais de forças diferentes, com perfis ofensivos e ajustes ao vivo. Medido com `scripts/engine-calibrate.ts` (um turno real, técnicos da IA):

| | Antes | Depois |
|---|---|---|
| Série A gols/jogo | 3,66 | 2,71 |
| Série A jogos com 5+ gols | 31% | 15% |
| Série A chutes por time | 15,9 | 14,6 |
| Série B gols/jogo | — | 2,32 |
| Conversão dos chutes no alvo | 41% | 25–30% |

Mudanças (lógica, nunca multiplicador no placar): **nível relativo da partida** (atributos valem em relação à média dos 22 titulares, preservando a diferença entre os times), goleiros mais eficientes, precisão dos chutes separada da qualidade da chance, mentalidade ofensiva menos exposta, pressão alta com linha menos adiantada e jogo vertical menos precipitado. A sensibilidade à força foi medida (`engine-gap.ts`): +4 nos atributos ≈ 61% de aproveitamento; +8 ≈ 67%.

**Desempenho:** cache de quem está em campo, posições-alvo calculadas uma vez por segundo de jogo e laço de marcação otimizado: 170 → 132 ms por partida, com impressão digital idêntica (`engine-fingerprint.ts`).

**Modelo rápido:** jogos fora da competição do usuário usam Poisson calibrado pelo próprio motor (`quick-calibrate.ts`, 280 jogos: mandante 1,37, visitante 0,98, β 0,088 por ponto de força). A divisão do usuário e o jogo dele continuam no motor completo.

**Formações:** alas sobem como pontas em esquemas com três zagueiros e um meia chega à área quando não há pontas. Contra o 4-3-3 (mesma força, 60 jogos): 4-2-3-1 1,62 · 3-4-3 1,30 · 4-4-2 1,28 · 3-5-2 1,22 · 4-2-2-2 1,03 · 5-3-2 0,95 (espelho 4-3-3: 1,55 — mostra o ruído da amostra).
