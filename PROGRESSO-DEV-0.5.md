# Progresso — Dev 0.4.1 + Dev 0.5 (Manager Update)

Arquivo de retomada. Atualizado a cada checkpoint (commit na branch `dev`).

| Item | Situação | Evidência |
|---|---|---|
| App Windows: janela centralizada, tela cheia, barra integrada, offline, autoatualização, instalador | Feito | `desktop/`, autoteste `--selftest`, instalador gerado localmente (116 MB), workflow `desktop.yml` |
| Botão de download (só com instalador publicado) | Feito | `/api/desktop`, testes em `tests/updates.test.ts` |
| 5-3-2 | Investigado (400 jogos/config.), sem mudança no motor; recomendação medida no auxiliar | `scripts/engine-against.ts`, `engine-formations.ts` (STYLE/MENT/OPP) |
| Grupos A11–A16 Série D | Conferidos (TNH1/CBF) | `fontes.json`, `serie-d.json` |
| Universo vivo (clubes, técnicos, demissões, projetos, notícias, recordes) | Feito | `universe.ts`, 10 temporadas em `tests/universe.test.ts` |
| Gabinete (reuniões, coletivas, contrato, marcos, propostas) | Feito | `office.ts`, `/gabinete` |
| Comissão técnica (7 cargos, efeitos medidos) | Feito | `staff.ts`, `/comissao` |
| Treinos (preparação para o adversário, delegar) | Feito | `drills.ts` |
| Base e olheiros avançados | Feito | `academy.ts`, `/base` |
| Legado e notícias | Feito | `/historia`, `/mundo` |
| Elencos e técnicos reais | Bloqueado (sem fonte verificável e licenciada) | — |

Como retomar: `git log --oneline -15`; `npx vitest run tests/universe.test.ts`; `node scripts/e2e.mjs`.
