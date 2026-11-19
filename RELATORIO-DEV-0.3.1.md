# BRASFC — Relatório da Dev 0.3.1

**Refinamento do motor, competições por edição e implantação** · 18/11/2026 · branch `dev`

## Em uma frase
O motor ficou mais rápido sem mudar nenhum resultado, parou de produzir gols demais entre times da IA, as formações com dois atacantes e três zagueiros passaram a criar jogo, as Séries C e D seguem as regras reais de cada ano e o site voltou a se atualizar sozinho.

## 1. Gols em excesso entre IAs — causa e correção
**O que acontecia:** em temporadas completas, quase 3 gols por jogo; na Série A, 3,66, com 31% dos jogos terminando com 5 gols ou mais.

**Por que:** a calibração da 0.2 usou só times médios, todos em 4-3-3 e sem técnico da IA. Na carreira jogam clubes reais de forças diferentes, com técnicos ofensivos e ajustes ao vivo. Além disso, o motor tratava atributos de forma absoluta: dois times fortes criavam chances demais.

**O que mudou (sempre na lógica, nunca cortando o placar):**
- Nível relativo da partida: os atributos valem em relação à média dos 22 titulares; a diferença entre os times é preservada.
- Goleiros mais eficientes e precisão do chute separada da qualidade da chance (mais chutes no alvo, conversão realista).
- Mentalidade ofensiva menos exposta atrás, pressão alta com linha menos adiantada, jogo vertical menos precipitado.

| Medição (um turno, técnicos da IA) | Antes | Depois |
|---|---|---|
| Série A — gols por jogo | 3,66 | 2,71 |
| Série A — jogos com 5+ gols | 31% | 15% |
| Série A — chutes por time | 15,9 | 14,6 |
| Série B — gols por jogo | — | 2,32 |
| Conversão dos chutes no alvo | 41% | 25–30% |
| Temporada completa (todas as séries) | 2,93 | 2,34–2,44 |

Sensibilidade à força (mesmo elenco, atributos deslocados): +4 pontos ≈ 61% de aproveitamento; +8 ≈ 67%. Times melhores ganham mais, sem ganhar sempre.

## 2. Equilíbrio das formações
Os esquemas sem pontas criavam pouco: o 5-3-2 finalizava 5 vezes por jogo, contra 14 do 4-3-3. Com três zagueiros, os alas agora sobem como pontas; sem pontas, um meia chega à área. O 4-3-3 não foi enfraquecido.

| Contra o 4-3-3 (mesma força, 60 jogos) | Pontos por jogo |
|---|---|
| 4-2-3-1 | 1,62 |
| 3-4-3 | 1,30 (antes 1,20) |
| 4-4-2 | 1,28 |
| 3-5-2 | 1,22 |
| 4-2-2-2 | 1,03 (antes 0,75) |
| 5-3-2 | 0,95 |
| 4-3-3 (espelho, mostra o ruído) | 1,55 |

**Limitação registrada:** o 5-3-2 continua abaixo da média num confronto neutro (é um esquema de bloco baixo).

## 3. Desempenho
- Partida no motor: **170 → 132 ms** com impressão digital idêntica (mesmos placares, eventos e estatísticas).
- Jogos fora da competição do usuário: modelo rápido calibrado pelo próprio motor (280 jogos). O jogo do usuário e os da divisão dele continuam no motor completo.
- Passo de domingo (todas as séries) no servidor de desenvolvimento: **≈1,9 s** (antes ≈10 s para 30 jogos); quarta de Copa sem o usuário: **≈27 ms**.
- Gravação das partidas em lote (uma instrução por até 100 jogos).

## 4. Competições por edição
- Série C: 20 (2026), 24 (2027) e 28 em dois grupos com três quedas por grupo (2028+). A 2ª fase de 2028 ainda não foi publicada pela CBF: o BRASFC usa dois quadrangulares, marcado como projeção.
- Série D 2026 real: 96 clubes, 16 grupos, mata-mata e playoffs de acesso; seis sobem.
- As contas fecham de 2026 a 2040 (teste automático). Ninguém que cai fica na divisão.
- Saves da 0.3 sem Série D: ganham a Série D na troca de temporada, com os acessos reais de 2026.

## 5. Implantação
O site estava parado na 0.1.0 porque a regra `data/` do `.gitignore` escondia a base de dados do Brasil 2026: o CI falhava e a VPS não montava a imagem. Corrigido. A VPS agora verifica a cada minuto, baixa a imagem pronta do GitHub (≈3–4 min entre envio e site no ar), não repete versões que falharam e registra o estado de cada implantação.

## 6. Testes
108 testes automáticos passam (eram 74), incluindo regras por edição, três temporadas seguidas com Série D e Copa, temporada inteira pelo servidor com conferência do saldo, e jornadas no navegador (44/44).

## 7. Limitações
- Elencos e técnicos reais: sem fonte verificável, continuam fictícios.
- Grupos A11–A16 da Série D vieram de resumo da Wikipédia (marcados para conferência).
- 5-3-2 abaixo da média em confronto neutro.
