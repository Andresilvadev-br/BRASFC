# Progresso — Dev 0.2 (final) + Dev 0.3

Arquivo de retomada. Atualizado a cada checkpoint (commit na branch `dev`).

## Estado

| Item | Situação |
|---|---|
| A1 Auditoria/calibração do motor | Concluído (impedimentos, faltas, cartões, gols, notas, desempenho) |
| A2 Equilíbrio tático | Concluído para mentalidades e estilos; formações melhoradas, com diferença residual documentada |
| A3 Modo Pixel completo | Concluído |
| A4 Estatísticas acumuladas (jogador) | Concluído (página Estatísticas, por temporada e jogo a jogo) |
| A5 Base Brasil 2026 | Parcial — cidades/UF/estádios conferidos; técnicos, elencos, nomes oficiais e 23 cores pendentes (bloqueio de fonte) |
| B2 Editor tático (simples/avançado) | Concluído |
| B3 Familiaridade progressiva | Concluído |
| B4 Funções individuais | Concluído |
| B5 IA adversária/counters | Concluído |
| B6 Inteligência em campo | Concluído (desmarcação temporizada, apoio, coberturas por formação, sem tabela infinita) |
| B7 Treino tático | Concluído |
| B8 Auxiliar técnico | Concluído |
| B9/B10 Integração nas carreiras | Concluído |
| B11 Clubes reais, Séries A/B/C, temporadas | Concluído (regras de A/B a confirmar na CBF; Série D não simulada) |
| C Testes, PDF, versão 0.3.0 | Testes (74) e versão concluídos; relatório em produção |

## Como retomar

1. `git log --oneline -15` para ver os checkpoints.
2. Medições: `node scripts/engine-stats.ts 200 --taticas`, `engine-balance.ts`, `engine-formations.ts`, `engine-mastery.ts`, `season-sim.ts`.
3. Capturas: `node scripts/capturas.mjs http://localhost:5173 docs/capturas` (servidor de desenvolvimento rodando).
4. Pendências de dados: ver `docs/DADOS.md` → "Situação atual".
