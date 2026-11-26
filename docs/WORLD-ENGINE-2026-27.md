# World Database 2026/27 | Engenharia

Base de trabalho [PR #32](https://github.com/Andresilvadev-br/BRASFC/pull/32) e [Windows 1.6.1](https://github.com/Andresilvadev-br/BRASFC/releases/tag/v1.6.1).

## Carreira offline

- `POST /api/careers` aceita `worldSelection: { countries: ['bra'] }`. A seleção pertence ao save e ativa Séries A, B, C e D e Copa do Brasil para todos os treinadores. Na abertura de 2026 há 156 clubes elegíveis nas quatro séries. Clubes de países inativos seguem consultáveis no mercado com o catálogo local instalado.
- Nas carreiras por país, os jogos humanos e as divisões nacionais dos seus clubes usam o motor completo. As demais partidas usam o modelo rápido. Os saves com seleção de divisões continuam com a política anterior.
- A Copa do Brasil prepara a fase ao calcular o calendário. Na 1.6.1, a data da estreia do Sport aparecia como folga, porque o confronto era sorteado só ao avançar. Agora a tela e o servidor recebem o mesmo confronto, e a gravação inclui o placar e a chave. A reabertura consegue reconstruir uma chave ausente quando os resultados confirmam todos os confrontos e participantes da fase. Empates novos têm os pênaltis gravados para manter o vencedor após mudanças de elenco. [Estreia oficial do Sport em 2026](https://www.cbf.com.br/futebol-brasileiro/jogos/copa-do-brasil/profissional/2026/desportiva-ferroviaria-x-sport-recife/832882)
- Ao fechar 2026, o modo por país registra as vagas brasileiras para Libertadores e Sul-Americana de 2027. A engine distingue preliminares, grupos e redistribuição por vaga duplicada. São calculadas as vagas domésticas da carreira. As competições continentais ainda não têm calendário ou partidas, e seus campeões não entram no cálculo enquanto não houver competições que os determinem. [REC da Série A 2026, artigos 6 e 7](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Brasileiro_Serie_A_2026_c984f8cf05.pdf)

## Catálogo de inscrições

A base de outubro do Brasfoot Next tem 1.236 clubes de 132 países, 34.889 atletas, 45 divisões nacionais e 108 estaduais definidas. A versão distribuída tinha 0 inscrições no SQLite. O CSV desta branch vincula 74 clubes do catálogo às listas oficiais. Cada linha guarda edição e fonte, e o importador valida território, identidade e exclusividade entre divisões nacionais. A inscrição por si só não habilita uma competição.

| País | Divisão | Vínculos da edição 2026/27 | Clubes ausentes no catálogo original |
| --- | --- | ---: | --- |
| Espanha | Primera División | 20/20 | — |
| Espanha | Segunda División | 18/22 | CD Tenerife, CE Sabadell, CD Eldense, Celta Fortuna |
| Itália | Serie A | 20/20 | — |
| Itália | Serie B | 16/20 | Ascoli, Benevento, Arezzo, Vicenza |

Fontes da temporada [Primera](https://www.laliga.com/laliga-easports/clasificacion), [Segunda](https://www.laliga.com/en-GB/laliga-hypermotion/standing), [Serie A italiana](https://en.legaseriea.it/serie-a/standings) e [Serie B italiana](https://www.legab.it/seriebkt/classifica).

```sh
python3 scripts/import-world-db.py /caminho/brasfoot-next-database \
  --revision 13fc36281bef66c1b03f3497871ef2e0a953f935 \
  --memberships src/lib/data/world/2026/memberships-2026-27.csv \
  --output world.sqlite --report world-report.json
```

O catálogo original referencia 39 escudos brasileiros de 40 clubes e 1.083 internacionais de 1.196. São referências de origem, sem arquivos distribuídos pela branch de engine. A cobertura no jogo depende dos escudos utilizáveis importados pela branch de experiência. [Banco e termos do Brasfoot Next](https://github.com/Brasfoot-Next/database)

## Validação e pendências

- Simulação rápida brasileira de 2026 e 2027 completou 1.741 e 1.827 partidas, respectivamente. A Copa fechou nove fases e 155 partidas em cada temporada; a edição de 2027 ainda é a projeção anterior do BRASFC. Foram conferidos acessos de 4, 4 e 6 clubes para A, B e C e os tamanhos de C em 2027 e 2028.
- Seguem pendentes as inscrições restantes, os regulamentos e calendários jogáveis dos países estrangeiros, as competições estaduais e regionais, a edição de 128 clubes da Copa do Brasil de 2027 e as partidas continentais. Os números da simulação brasileira não medem o desempenho com vários países ativos. [Calendário CBF de 2027](https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro/a/cbf-oficializa-calendario-do-futebol-profissional-masculino-de-2027)
