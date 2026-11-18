# Carreira de treinador — sistemas da Dev 0.5

Todos os estados ficam em `careers.data` (JSONB) e são gravados na mesma transação da rodada,
com a versão otimista da carreira impedindo ações duplicadas.

## Universo (`src/lib/domain/universe.ts` → `data.universe`)
- `clubs[id]`: filosofia, perfil da diretoria, projeto, técnico, formação, domínio por formação, confiança, forma recente.
- `coaches[id]`: técnicos fictícios (nomes gerados), estilo, reputação, idade, títulos, histórico por temporada.
- `news`, `records`, `log` (resumo por temporada).
- Rodada (`universeAfterRound`): forma, aprendizado tático, confiança pelo resultado e pela tabela (perfil da diretoria), pressão de sequência negativa, demissão com carência de 6 rodadas, contratação do melhor técnico livre compatível com o porte.
- Temporada (`universeSeasonEnd`): projetos (acesso → crescimento, queda → reconstrução/crise, título → título), reputações pelo desempenho contra a expectativa, saída após queda, mercado de técnicos, clubes vindos dos estaduais, aposentadoria e renovação dos técnicos livres.
- Partidas: `aiTeam`/`aiTeamPlan` usam técnico, formação e domínio do universo (`universeCoach`).
- Invariantes: `universeIssues` (um técnico por clube e vice-versa, confiança e reputação finitas, limite de notícias).

## Gabinete (`src/lib/domain/office.ts` → `data.office`)
Contrato, reputação, totais, marcos, decisões, reunião e coletiva pendentes, ultimato e treino delegado.
Reuniões e coletivas expiram (5 e 3 rodadas) com efeito registrado. Propostas de emprego (`coachOffers`) vêm de clubes com vaga ou com confiança abaixo de 40, filtradas pela reputação.

## Comissão técnica (`src/lib/domain/staff.ts` → `data.club.staff`)
`staffEffects` concentra os fatores usados no servidor: aprendizado tático (auxiliar), recuperação (preparador, fisioterapeuta), preparação para o adversário (analista), evolução da base (coordenador) e julgamento dos olheiros (chefe de observação). Cargo vago = interino de competência 28.

## Ações (POST `/api/careers/:id/club`)
`reuniao`, `coletiva`, `comissao-contratar`, `comissao-dispensar`, `treino-delegar`, `base-plano`, `olheiro-missao` (com `weeks`), além das ações da 0.4.

## Testes
`tests/universe.test.ts` (dez temporadas com invariantes, efeitos medidos da comissão e dos treinos, gabinete) e a temporada completa pelo servidor em `tests/db.test.ts`.
