# Economia, mercado e gestão (Dev 0.4)

Todos os valores são **estimativas do jogo** (ordem de grandeza do futebol brasileiro), nunca dados oficiais de clubes reais.

## Onde fica cada coisa
| Tema | Código | Persistência |
|---|---|---|
| Elencos, contratos, valor, evolução | `src/lib/domain/market.ts` | `careers.data.market` (alterações) |
| Clube: finanças, diretoria, patrocínios, estrutura, torcida | `src/lib/domain/club.ts`, `management.ts` | `careers.data.club` |
| Base e olheiros | `src/lib/domain/academy.ts` | `careers.data.club.academy/scouts/reports` |
| Carreira de jogador | `src/lib/domain/careerlife.ts` | `careers.data.playerCareer` |
| Históricos | `src/lib/server/repos/management.ts` | `career_ledger`, `career_transfers`, `career_history` |

O estado atual é protegido pela **versão otimista** da carreira (uma ação duplicada ou fora de ordem é recusada). Os históricos são gravados na mesma transação, com **chave de idempotência** (`op_key`).

## Elencos
Elenco = base determinística evoluída por temporada (idade, crescimento até o potencial, declínio após os 30, aposentadoria aos 37 ou aos 34 com nível baixo) + alterações persistidas. Clubes da IA repõem aposentados com jovens fictícios. Um atleta nunca está em dois clubes: o dono é a alteração, se existir; senão, a base.

## Valores
- Salário esperado: `base(nível) × e^(0,14 × (overall − ref))`. Referências: A 220 mil (74), B 50 mil (68), C 14 mil (64), D 4 mil (60).
- Valor: `30 mil × e^(0,19 × (overall − 50))`, ajustado por idade, potencial (jovens), contrato restante e forma.
- Preço pedido: valor × importância no elenco (até 1,45 para o melhor), mais barato se o clube estiver endividado.

## Finanças semanais
TV/comercial (anual/52), patrocínios, bilheteria (público × ingresso) nos jogos em casa, premiações (liga e Copa), salários, manutenção, base e olheiros. Preço do ingresso tem elasticidade; clássicos enchem mais o estádio.

## Diretoria
Perfis: ambiciosa, conservadora, financeiramente rígida, formadora, imediatista, projeto de longo prazo. Cada uma pesa resultados, dinheiro, base e paciência. Abaixo de 18% de confiança após a 10ª rodada vem a demissão; o treinador recebe propostas compatíveis com a reputação.

## Base e olheiros
Turma anual de 2 a 5 jovens conforme o nível da base; potencial médio cresce com a estrutura; craques (75+) são raros (≈1,5% × nível, um por turma). Olheiros enxergam faixas de nível e potencial; a margem cai com a estrutura de observação e com o julgamento do olheiro.
