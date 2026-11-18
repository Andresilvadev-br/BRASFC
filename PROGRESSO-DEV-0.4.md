# Progresso — Dev 0.3.1 + Dev 0.4 (Evolution Update)

Arquivo de retomada. Atualizado a cada checkpoint (commit na branch `dev`).

## Arquitetura decidida

- **Regras por edição** — `src/lib/domain/rules.ts`: Série A/B (20), C (20 → 24 em 2027 → 28 em 2028, dois grupos de 14),
  D (96 em 16 grupos + mata-mata, 6 acessos). `checkTransition` garante que as contas fecham ano a ano.
  2026 = oficial; 2027 = oficial (DOL/CBF); 2028 = anunciado (2ª fase projetada); depois = projetado.
- **Série D e estaduais** — `src/lib/data/brasil/2026/serie-d.json` (96, grupos A1–A16), `copa-do-brasil.json` (126, fase de entrada),
  14 clubes "E" (estaduais, só na Copa). Cores provisórias geradas e marcadas (`colorsProvisional`). Elencos fictícios.
- **Calendário por datas** — domingo = rodada das ligas; quarta = Copa do Brasil (datas do BRASFC, compactadas).
  Resultados continuam com `round` = rodada da competição + `competition`, o que mantém os saves da 0.3 compatíveis.
- **Simulação em dois níveis** — jogos da competição do usuário e o jogo dele no motor completo; os demais em modelo rápido
  calibrado pelo próprio motor (`scripts/quick-calibrate.ts`). É assim que jogos de gerenciamento lidam com centenas de partidas por rodada.
- **Mercado/contratos/finanças** — estado autoritativo em `careers.data` (versão otimista impede duplicação) + histórico em tabelas
  (`career_transfers`, `career_ledger`, `career_history`) gravado na mesma transação.

## Estado

| Item | Situação |
|---|---|
| Motor: otimização sem mudar resultados (impressão digital idêntica) | Feito — 170 → 132 ms/partida |
| Motor: excesso de gols (causa: calibração só com times médios em 4-3-3; nível absoluto; estilos ofensivos) | Feito — nível relativo, goleiros, ofensiva/pressão/vertical |
| Base: Série D 2026 + Copa 2026 + estaduais | Feito (dados) |
| Regras por edição | Feito (módulo); integração pendente |
| Calendário com D + Copa | Em andamento |
| Equilíbrio de formações | Pendente |
| Copa do Brasil (motor + UI) | Pendente |
| Mercado, contratos, finanças, diretoria, patrocínios | Pendente |
| Olheiros, base, infraestrutura, história | Pendente |
| Redesign + Ultra Motion X | Pendente |
| PWA + Central de Atualizações | Pendente |
| Relatórios 0.3.1 e 0.4 | Pendente |

## Medições (antes → depois)

- Partida: 170 → 132 ms (mesmos resultados).
- Série A (1 turno, IA): 3,66 → 2,71 gols/jogo; 5+ gols 31% → 15%; chutes 15,9 → 14,6/time.
- Série B: 2,32 gols/jogo; Série C: 2,60.

## Como retomar

1. `git log --oneline -20`.
2. Medições: `node scripts/engine-calibrate.ts <semente> serie-a ia`, `engine-gap.ts`, `engine-mentality.ts`, `engine-fingerprint.ts`.
