# BRASFC | Relatório Master de Engenharia

**Equipe A · Codex/Work · 21/11/2026, Recife**

**Candidata de engenharia em revisão.** A homologação de publicação depende da integração com a branch de experiência, da comprovação na VPS e da autorização para produção. A branch de integração parte da 0.10.1 do [PR #19](https://github.com/Andresilvadev-br/BRASFC/pull/19). O trabalho da Equipe A está no [PR #20](https://github.com/Andresilvadev-br/BRASFC/pull/20).

## O que mudou e como foi verificado

| Etapa | Problema e causa | Solução e evidência |
| --- | --- | --- |
| Auditoria | A main trazia 0.10.0 e a branch de desenvolvimento já tinha saves e pré-jogo da 0.10.1. Duas etapas de deploy terminavam sem comprovação da VPS. | Base comum `28f4fdc`, com auditoria, responsáveis e contratos registrados. A tag pública do Windows anterior é `v1.4.8`. |
| Estabilização | O pipeline pulava navegador em push. O instalador podia ser publicado antes do ensaio de atualização interna. O deploy podia prosseguir mesmo se o backup falhasse. | Navegador passa a validar CI reutilizável. O job que publica Windows depende do pacote validado no Windows. O deploy verifica backup, saúde e commit. A automação de produção aguarda a imagem aprovada no GitHub. |
| Contratos de interface | Prontidão e presença vinham de sinais diferentes. A contagem local também podia incluir auxiliares opcionais. | O servidor entrega o objeto `readiness` no snapshot e na leitura leve. Um participante desconectado pode manter seu pronto, mas não libera a rodada. O consumo visual pertence ao PR de experiência. |
| Futebol | 154 dos 156 clubes tinham 4-3-3 registrado como abertura. Pressionadores miravam o mesmo ponto atrás da bola. | O catálogo v3 usa o elenco e o perfil tático simulado onde a súmula não traz formação. Na versão 0.5.2 do motor, o primeiro marcador pressiona e os demais dão cobertura lateral. As versões antigas de replay continuam reconhecidas. |
| Multiplayer e saves | A recuperação, a persistência e a concorrência precisavam de evidência atualizada. O ensaio HTTP antigo ainda usava contas de convidado. | O ensaio usa contas, ligas e comandos reais. A rodada lê filiação e checkpoint na mesma consulta após adquirir o bloqueio. A regressão de save aborta uma gravação e verifica, após reabrir o banco, que o progresso anterior permanece. |

**Arquivos de referência.** `.github/workflows/{ci,deploy,desktop}.yml`, `deploy/{deploy,self-update}.sh`, `src/lib/server/connected-world.ts`, `src/lib/domain/{club-selection,matchday}.ts`, `src/lib/data/roster-catalog.ts`, `src/lib/engine/{types,match}.ts`, `scripts/validate-live-season.mjs` e testes em `tests/`. A lista e as causas por área estão na [auditoria](AUDITORIA-MASTER.md). A divisão de código e as interfaces de integração estão em [INTEGRACAO-MASTER.md](INTEGRACAO-MASTER.md).

## Verificações e resultados

- **Tipos, banco e build.** Zero erros ou avisos de tipos. 190 testes passaram usando PostgreSQL 16.16 e PGlite. O build de produção executou e respondeu com `0012_career_label` aplicada. Essa migração aditiva pertence à base do PR #19.
- **Saves.** Foram exercitados criação, carregamento, renomeação, edição, conflito de versão, exclusão isolada, gravação interrompida e reabertura do banco em disco. A suíte também testa saves incompatíveis e separação entre carreira individual e liga.
- **Chromium.** As jornadas de criação, associação e lobby de treinador e atleta passaram. A Central de Carreiras passou em cinco tamanhos, incluindo 1366 × 768 a 2560 × 1440 e 390 × 844. O fluxo offline validou renomear, carregar, cancelar exclusão e excluir com confirmação. [Execução e capturas](https://github.com/Andresilvadev-br/BRASFC/actions/runs/44969738667/artifacts/14733051997).
- **Implantação simulada.** Em processos descartáveis, foram exercitados commit correto, falha de backup, falha na inicialização e resposta saudável com commit incorreto. A instalação na VPS é cancelada ou revertida conforme a etapa. Foi confirmado que produção aguarda a imagem do CI na main, enquanto staging pode construir localmente. `actionlint` e a validação de sintaxe Bash passaram.
- **Futebol.** O 4-3-3 caiu de 154 para 68 clubes no plano inicial padrão. A v3 distribui 43 clubes em 4-4-2, 24 em 5-3-2 e 21 em 4-2-3-1. As três referências táticas existentes foram preservadas. A IA aplica esquemas segundo o perfil simulado do treinador e o encaixe dos atletas, com domínio e ajustes em partida.
- **Campo 2D.** Em dois grupos pareados de 24 partidas, com pressão alta e sementes 100 a 123, os quadros em posse com companheiros a menos de 1 m caíram de 48,4% para 7,7%, amostrados a cada 12 ticks. Foram 2.550 de 5.266 quadros no motor 0.5.1 e 407 de 5.302 no 0.5.2. A calibração de 100 jogos registrou 2,51 gols por jogo. A matriz de 168 partidas examinou sete formações contra o 4-3-3. Os valores são amostras da simulação.
- **Windows.** O runner Windows aprovou a atualização interna de 1.4.8 para a candidata 1.4.9, com reabertura automática e conservação do save, do perfil e da preferência. Rejeitou download ausente, truncado e com SHA-512 incorreto. Um pacote de ensaio 1.4.10 exercitou rollback após falha de instalação e na primeira inicialização, com o executável anterior restaurado e nova tentativa concluída. A numeração 1.4.9 e 1.4.10 identificou os pacotes isolados de ensaio. [Evidência Windows](https://github.com/Andresilvadev-br/BRASFC/actions/runs/44969738655/artifacts/14732159917).
- **Temporada integrada.** Quatro participantes completaram 51 etapas, 1.741 partidas e a virada de 2026 para 2027 em 5 min 52 s. Foram 8.408 requisições sem erro HTTP. O P95 do relógio foi 58,4 ms em 7.350 pulsos.

## Desempenho em loopback

O ensaio usou Linux x86-64, Node v24.22.3, PostgreSQL 16.16, ambiente com 9 CPUs visíveis, aproximadamente 10 GiB de RAM e relógio de apresentação acelerado em 300×. Cada cenário abaixo percorreu a primeira rodada inteira, com 78 confrontos por liga. Foram exercitados login, prontidão, solicitações simultâneas, repetição com o mesmo identificador, confirmação e reconexão no intervalo. O placar foi gravado uma vez por confronto.

| Participantes e salas | Pulsos medidos | P50 | P95 | P99 |
| --- | ---: | ---: | ---: | ---: |
| 2 em uma liga | 285 | 52,1 ms | 75,3 ms | 134,0 ms |
| 4 em uma liga | 280 | 50,0 ms | 147,3 ms | 226,4 ms |
| 8 em uma liga | 277 | 49,5 ms | 289,7 ms | 377,8 ms |
| 4 + 4 em duas ligas, primeira | 278 | 96,3 ms | 257,3 ms | 337,0 ms |
| 4 + 4 em duas ligas, segunda | 274 | 96,2 ms | 237,7 ms | 325,2 ms |

A rodada de oito participantes atingiu o pico de 408 MiB de RSS no servidor Node. Entre as operações comuns, a leitura de estado teve P95 de 20,3 ms nessa rodada e o teste de 128 leituras de sessão de oito perfis teve P95 de 14,3 ms, sem erro. O teste isolado do limitador ainda devolveu 429 e uma gravação desatualizada recebeu 409. Na execução com duas ligas, os P95 de prontidão chegaram a 478,4 ms e 366,7 ms, incluindo o comando que prepara toda a rodada. Os números descrevem a carga local e precisam ser medidos novamente na VPS. O tempo do feedback visual depende da integração de frontend e permanece por medir.

## Rastreabilidade e pendências

- **Engenharia.** Auditoria no commit `3c7f9ef`, correções em `d609164`, ensaios em `9955ae7` e validação de navegador/PostgreSQL em `9da3f9c` no PR #20. A aprovação da imagem e do instalador em produção foi preparada em `cb5eb59`.
- **Experiência.** O [PR #21](https://github.com/Andresilvadev-br/BRASFC/pull/21) está em rascunho. O trabalho de calibração visual e o consumo dos contratos devem ser homologados após sua entrega na branch de integração.
- **VPS e publicação.** O workflow anterior publicou a imagem e pulou SSH e URL pública. A consulta à URL oficial foi bloqueada no ambiente de trabalho. Capacidade da VPS, restauração em ambiente equivalente e confirmação do commit público continuam pendentes. A publicação depende de aprovação no ambiente de produção, configuração do método e validação da branch integrada. A `main` permanece no commit `770d876`.
