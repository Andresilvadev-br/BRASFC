# World Database | Competições offline

O trabalho parte do PR #38, que já habilita LaLiga, Serie A italiana, Premier League, Bundesliga, 2. Bundesliga e Ligue 1. A expansão abaixo usa o instalador offline e os mesmos saves locais.

## Competições acrescentadas

| Competição | Edição | Clubes | Partidas |
| --- | --- | ---: | ---: |
| LaLiga Hypermotion | 2026/27 e temporadas simuladas seguintes | 22 | 462 na fase regular e 6 no playoff |
| Serie B italiana | 2026/27 e temporadas simuladas seguintes | 20 | 380 na fase regular e até 10 no pós-temporada |
| 3. Liga alemã | 2026/27 e temporadas simuladas seguintes | 20 | 380 na fase regular |
| Playoffs de acesso e permanência da Alemanha | mesmas edições | 4 | 4 entre as três divisões |
| Copa do Nordeste | 2026 | 20 | 60 |
| Copa Verde | 2026 | 24 | 70 |
| Copa Sul-Sudeste | 2026 | 12 | 42 |
| Supercopa Rei | 2026 e temporadas simuladas seguintes | 2 | 1 |
| FA Community Shield, Trophée des Champions, Franz Beckenbauer Supercup e Supercoppa Italiana | 2026/27 | 2 em cada | 1 em cada |
| Supercopa de España | temporada 2026/27, disputada em fevereiro de 2027 | 4 | 3 |
| Supercopa da UEFA | 2026 | 2 | 1 |
| Recopa Sul-Americana | 2026 | 2 | 2 |

O seletor ativa as duas divisões espanholas juntas. Os 22 clubes da segunda divisão podem iniciar carreira. O playoff inclui semifinais e final em ida e volta. Uma igualdade no agregado aciona 30 minutos no modelo rápido e, persistindo o empate, sobe o clube de melhor campanha. A decisão fica no save. Os clubes filiais ficam fora do acesso. A terceira divisão espanhola é representada por uma reserva parcial de quatro inscritos confirmados e tem movimentação simplificada.

O seletor ativa a Serie A e a Serie B juntas. A Serie B disputa a terceira vaga de acesso quando o terceiro colocado tem até 14 pontos de vantagem sobre o quarto. O play-out ocorre quando o 16º e o 17º estão separados por até quatro pontos. As partidas de prorrogação e os pênaltis decisivos usam o modelo rápido, com placares persistidos. Quatro clubes verificados da Serie C formam a reserva parcial de acesso.

Selecionar Alemanha ativa Bundesliga, 2. Bundesliga e 3. Liga. Cada par de divisões tem dois acessos e rebaixamentos diretos e dois jogos extras para a vaga entre o 16º da divisão superior e o terceiro clube elegível da inferior. As equipes B ficam fora do acesso. Gols da prorrogação e pênaltis ficam gravados. A Regionalliga ainda roda como uma reserva parcial de quatro clubes confirmados. As rodadas seguem o calendário unificado europeu do jogo e os playoffs ocupam as duas datas finais da programação alemã. Os quatro elencos complementares usam idades e posições amplas do DFB, com nacionalidade em branco quando a fonte não a informa.

As supercopas nacionais europeias e as duas continentais usam os inscritos oficiais da edição inicial. A Supercopa da UEFA entra quando França ou Inglaterra está ativa. Na carreira brasileira, a Recopa entra quando o catálogo instalado contém o Lanús com elenco suficiente. O jogo copia o elenco visitante para o save sem ativar a liga estrangeira. As datas-base seguem as edições oficiais e podem mudar de dia quando outra partida já ocupa o passo. A Supercoppa Italiana e a Recopa incluem prorrogação antes dos pênaltis. Edições seguintes dependem da implementação das respectivas copas classificatórias.

As três copas regionais usam os grupos e as fases de 2026. O calendário preserva a tabela semanal do BRASFC e desloca uma data-base quando outra etapa já ocupa o mesmo dia. As chaves, placares e pênaltis funcionam no calendário de todos os treinadores. Para 2027, os quatro campeões regionais (Nordeste, Norte, Centro-Oeste e Sul-Sudeste) e os campeões das Séries C e D alimentam as seis entradas na terceira fase da Copa do Brasil. Quando um clube já está inscrito, a vaga segue a classificação da mesma competição. A composição restante da Copa permanece uma projeção do BRASFC. Com seis entradas na terceira fase, 36 entradas na primeira e 66 na segunda mantêm a chave de 128 inscritos. A Supercopa seguinte recebe os campeões simulados da Série A e da Copa do Brasil, com o vice da Série A quando o mesmo clube vence as duas.

Carreiras criadas antes desta mudança conservam o calendário salvo. As copas regionais de 2027 e seguintes dependem da classificação pelas federações estaduais. O desempate regional usa pontos, vitórias, saldo e gols, seguido de sorteio determinístico. O critério de cartões nas tabelas e a premiação específica ainda dependem da cobertura do modelo rápido. Os oito elencos acrescentados têm notas estimadas pelo jogo, idades sinalizadas como pendentes e posições conforme a função ampla informada pelas fontes.

## Validação offline

- Espanha 2026/27 e 2027/28 com 46 passos de liga por temporada, 380 partidas na primeira divisão, 468 na segunda e três trocas entre as divisões. A Supercopa acrescenta três passos na primeira edição. A carreira local com Tenerife e Real Madrid passou pela primeira rodada com os dois treinadores.
- Itália 2026/27 e 2027/28 com 43 passos e 770 partidas por temporada no cenário simulado com playoff e play-out. O banco PGlite em disco foi fechado e reaberto nas duas viradas.
- Brasil 2026 com 84 passos e 1.918 partidas, incluindo as 173 partidas regionais e da Supercopa. Em 2027 foram 54 passos e 1.834 partidas, com 157 partidas da Copa do Brasil. O mesmo save foi reaberto em disco após cada virada.
- A estreia do Sport na Copa do Brasil e na Copa do Nordeste foi conferida. O teste da API também confere a Supercopa e o reenvio de uma rodada já gravada.
- Carreira com o SV Meppen e virada alemã com 996 partidas de liga e playoffs, incluindo resultado e movimentação entre divisões após reler o save.
- Supercopa da UEFA disputada com PSG e Aston Villa em uma carreira com a França ativa. Estreia de Lanús e Flamengo na Recopa em uma carreira brasileira.

## Desempenho

Amostra local em PGlite com um treinador no Real Madrid e cinco rodadas medidas em cada configuração, após uma rodada de aquecimento e antes da inclusão da 3. Liga e das supercopas europeias. A duração inclui a partida e a gravação da rodada.

| Países ativos | Jogos por rodada | Mediana |
| ---: | ---: | ---: |
| 1 | 21 | 1,90 s |
| 2 | 41 | 1,94 s |
| 5 | 78 | 1,92 s |

Os jogos fora da divisão do treinador usam a simulação rápida. As medições são desta máquina e variam com a divisão do treinador, os elencos e a quantidade de partidas que passam pelo motor completo.

## Fontes

- [LaLiga Hypermotion 2026/27](https://www.laliga.com/es-GB/laliga-hypermotion/clasificacion), [RFEF, Circular 84](https://rfef.es/sites/default/files/pdf/circulares/1._Circular_84_-_CNL_Primera_y_Segunda_Division___Anexo.pdf) e [grupos da Primera Federación 2026/27](https://rfef.es/es/noticias/aprobados-los-grupos-de-primera-federacion-para-la-temporada-202627).
- Os elencos suplementares usam os fatos de inscrição divulgados em [CD Tenerife](https://en.wikipedia.org/wiki/CD_Tenerife), [CE Sabadell](https://en.wikipedia.org/wiki/2026%E2%80%9327_CE_Sabadell_FC_season), [CD Eldense](https://en.wikipedia.org/wiki/CD_Eldense) e [Celta Fortuna](https://en.wikipedia.org/wiki/RC_Celta_Fortuna), com atribuição e termos [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Os registros foram transcritos para o formato de elenco do jogo.
- [Classificação da Serie B 2026/27](https://www.legab.it/seriebkt/classifica), [regulamento de acesso e descenso](https://www.seriec.com/storage/app/media/comunicati/2026-2027/Lega/2627-26L.pdf) e [grupos da Serie C](https://www.juventus.com/it/news/articoli/serie-c-2026-2027-juventus-next-gen-inserita-nel-girone-a). Os elencos suplementares foram transcritos de [Ascoli](https://en.wikipedia.org/wiki/Ascoli_Calcio_1898_FC), [Arezzo](https://en.wikipedia.org/wiki/SS_Arezzo), [Benevento](https://en.wikipedia.org/wiki/Benevento_Calcio) e [Vicenza](https://en.wikipedia.org/wiki/L.R._Vicenza) sob [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [Regulamento da Copa do Nordeste](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Copa_do_Nordeste_2026_25c8b8939c.pdf), [regulamento da Copa Verde](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_COPA_VERDE_2026_733ec5eed1.pdf) e [grupos da Copa Sul-Sudeste](https://www.cbf.com.br/futebol-brasileiro/noticias/selecao-masculina/cbf-participa-de-seminario-operacional-da-copa-do-mundo-fifa-qatar-202/cbf-divulga-tabela-detalhada-da-primeira-edicao-da-copa-sul-sudeste).
- [Regulamento da Supercopa Rei](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_SUPERCOPA_DO_BRASIL_2026_8634b6b9ec.pdf), [regulamento da Copa do Brasil e classificação de 2027](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Copa_do_Brasil_2026_66989a5426.pdf) e [calendário CBF de 2027](https://www.cbf.com.br/futebol-brasileiro/noticias/noticias/campeonato-brasileiro/a/cbf-oficializa-calendario-do-futebol-profissional-masculino-de-2027).
- Alemanha. [Inscritos da 3. Liga (DFB)](https://www.dfb.de/news/teilnehmerfeld-der-3-liga-steht-fest-havelse-rueckt-fuer-1860-nach/), [regulamento da DFL](https://media.dfl.de/sites/2/2026/06/Spielordnung-SpOL-2026-06-11-Stand.pdf), [elencos](https://datencenter.dfb.de/competitions/4/seasons/current) e [inscritos da Regionalliga](https://www.fussballtransfers.com/deutschland/regionalliga/2026-2027/verein).
- Supercopas. [The FA](https://www.thefa.com/news/2026/jun/04/2026-fa-community-shield), [LFP](https://www.lfp.fr/article/le-rc-lens-accueillera-le-trophee-des-champions-en-ouverture-de-la-saison-2026-2027), [DFL](https://www.bundesliga.com/en/bundesliga/news/dfl-confirm-details-2026-franz-beckenbauer-supercup-bayern-munich-borussia-dortmund-37584), [Lega Serie A](https://www.legaseriea.it/supercoppa/news/la-ea-sports-fc-supercup-2026-2027) e [RFEF](https://rfef.es/es/noticias/la-rfef-presenta-en-estambul-la-supercopa-de-espana-2027).
- Continentais. [Supercopa da UEFA](https://www.uefa.com/uefasupercup/match/2048319--paris-vs-aston-villa/matchinfo/), [regulamento da UEFA](https://documents.uefa.com/r/Regulations-of-the-UEFA-Super-Cup-2026-Online) e [regulamento da Recopa 2026](https://cdn.conmebol.com/wp-content/uploads/2026/02/Reglamento-CONMEBOL-Recopa-2026.pdf).

Continuam pendentes 34 divisões estrangeiras do catálogo, as ligas estaduais, as copas nacionais estrangeiras classificatórias, Champions League, Europa League, Conference League, Libertadores e Sul-Americana, além do calendário combinado de Brasil e Europa. Os links oficiais do Megapatch 3.0 e do pacote de 44 ligas devolveram HTTP 403 no download.
