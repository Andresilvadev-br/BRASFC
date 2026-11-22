# BRASFC 0.11.0 — Relatório de Integração Final

**Integração e homologação: Claude (Equipe B), assumindo a Equipe A.** Data: 22/11/2026.
Branch de integração: `improvement/master-integration`. Destino proposto: `main`. Nada foi publicado nem implantado.

## 1. Recomendação

**A versão está pronta para publicação, dependendo apenas da sua autorização.**

Todos os testes executados sobre o código integrado passaram, nesta sessão e no CI do PR #23, incluindo a atualização real no Windows. Nenhuma regressão foi encontrada. Ficam fora desta comprovação a VPS real (implantação, saúde e carga) e o Safari do iPhone.

## 2. O que foi integrado

| Origem | Conteúdo | Como entrou |
|---|---|---|
| #19 (base comum `28f4fdc`) | Central de Carreiras e apresentação pré-jogo (0.10.1) | Já estava na base da integração |
| #20 Engenharia (Codex), 8 commits até `bb70101` | Contrato `readiness`, catálogo v3, motor 0.5.2, barreiras de publicação (imagem aprovada, backup, saúde), ensaios de carga, Windows e PostgreSQL | Avanço direto (fast-forward) |
| #21 Experiência (Claude) | Auditoria de layout, piso de 11 px, elenco por relação, resultados recentes, calendário, criação de liga, `Switch`, prontidão oficial na interface | Um merge, junto com o #22 |
| #22 Partida e homologação (Claude) | Campo ao vivo interpolado, `StatsCompare`, escudo nas cenas, capturas antes × depois | Mesmo merge `72fdb3f` |
| Integração final | Versão 0.11.0, Windows 1.4.9, novidades do jogo e `CHANGELOG.md` | Commit de versão |

- **Duplicação:** nenhum commit aparece duas vezes. O #22 contém o #21, e os dois entraram num único merge.
- **Conflitos:** só um, em `docs/INTEGRACAO-MASTER.md` (as duas equipes criaram o arquivo). Foi resolvido mantendo a versão mais recente do Codex na íntegra mais a seção da Equipe B.
- **Código:** não houve conflito. A interface consome o `readiness` pelo contrato do Codex, sem alterar `protocol.ts`.

## 3. Resultados reais dos testes no código integrado

| # | Teste | Resultado |
|---|---|---|
| 1 | Typecheck (`svelte-check --fail-on-warnings`) | 700 arquivos, 0 erros, 0 avisos |
| 1 | Lint | O projeto não tem script de lint; a verificação estática disponível é o `svelte-check` |
| 1 | Build de produção | Concluído |
| 2 | Unitários e integração (PGlite) | 192 aprovados, 3 ignorados (exigem PostgreSQL) |
| 3 | Suíte completa com PostgreSQL 16 real | **195/195** |
| 3 | Colaboração, reconexão e concorrência no PostgreSQL (`PG_WORLD_URL`) | **15/15** |
| 3 | Saves da 0.10.0 publicada abertos pela 0.11.0 (PostgreSQL) | Só a migração 0012 foi aplicada. As duas carreiras abriram intactas (data, versão, posição do atleta), a biblioteca listou as duas, renomear funcionou, a rodada seguinte foi jogada (versão 3 → 4) e o nome se manteve |
| 4 | Navegador, multiplayer (`tests/multiplayer-browser.mjs`) | Aprovado: ligas de treinador e atleta, convites, retorno, recarga, 4 larguras |
| 4 | Navegador, carreiras offline (`tests/career-browser.mjs`) | Aprovado em 5 resoluções |
| 4 | Auditoria de layout (31 rotas × 2560, 1920, 1366, 390 e 320 px) | 0 telas com rolagem horizontal, 0 erros de console |
| 5 | Temporada completa (4 participantes, PostgreSQL) | 51 etapas, virada 2026 → 2027, 0 erros HTTP, 0 quedas inesperadas, 497 s |
| 5 | Partidas simultâneas e reconexão | Duas ligas com 4 + 4 ao mesmo tempo, 78/78 confrontos oficiais em cada; reconexão no intervalo e confirmação repetida aplicada uma vez |
| 6 | Latência (ver tabela abaixo) | P95 abaixo do alvo de 500 ms em todos os cenários |
| 6 | Tráfego HTTP (8 perfis) | 128 respostas 200, P95 10,8 ms, P99 15,1 ms. Gravações concorrentes 200/409, 0 duplicatas, limitador 429 ativo |
| 7 | Atualização interna do Windows, saves e rollback (runner `windows-latest`, CI do PR #23) | **Aprovado** (`"passed": true`, 1.4.8 → 1.4.9). Downloads ausente, truncado e corrompido (SHA-512) rejeitados com save intacto. Atualização aplicada pelo app, reaberta, com conta, carreira e preferência preservadas. Instalação abortada e falha na primeira inicialização revertidas para a versão anterior, com a mesma carreira disponível |
| — | CI do PR #23 (`b82ce65`) | **Aprovado**: tipos, testes com PGlite e PostgreSQL real, colaboração e concorrência no PostgreSQL, build, smoke test do servidor, fluxos de navegador (multiplayer e offline) e imagem Docker |
| 8 | Partida ao vivo | Campo: 171 imagens distintas em 4 s com interpolação × 4 sem. Até o intervalo: 51 cenas, todas com escudo; 10 estatísticas; prontidão "0/1"; sem overflow nem erros |
| 8 | Memória e requisições do cliente | Heap de 6,1 → 6,6 MiB em 35 navegações, estabilizando (sem vazamento contínuo). 0 chamadas de API repetidas na mesma navegação |

### Latência dos pulsos da partida (PostgreSQL 16, loopback, relógio acelerado 300×)

| Cenário | Pulsos | P50 | P95 | P99 | Erros | Pico de memória |
|---|---:|---:|---:|---:|---|---:|
| 2 participantes | 360 | 54,8 ms | 78,0 ms | 117,2 ms | 0 | 380 MiB |
| 4 participantes | 340 | 55,6 ms | 158,3 ms | 217,6 ms | 0 | 378 MiB |
| 8 participantes | 304 | 58,0 ms | 329,6 ms | 408,6 ms | 0 | 412 MiB |
| 4 + 4 em duas ligas (A) | 333 | 97,4 ms | 241,7 ms | 339,6 ms | 0 | 501 MiB |
| 4 + 4 em duas ligas (B) | 336 | 97,6 ms | 216,5 ms | 341,6 ms | 0 | 501 MiB |
| Temporada completa, 4 participantes | 9.201 | 50,6 ms | 67,2 ms | 88,7 ms | 0 | 392 MiB |

Os números ficaram na mesma faixa dos ensaios isolados do Codex e mostram que a integração não degradou o servidor. Eles descrevem uma máquina local e precisam ser repetidos na VPS.

## 4. Erros encontrados e corrigidos

**Nesta etapa de integração:** nenhum teste falhou sobre o código integrado, então não foi necessária nenhuma correção de código. Os ajustes foram:

- a resolução do conflito do documento de integração;
- a versão da candidata (0.11.0 / 1.4.9) e as novidades.

**Já corrigidos nas entregas integradas e reverificados aqui:**

| Erro | Corrigido em | Reverificação no código integrado |
|---|---|---|
| Campo ao vivo pulando a cada pulso | #22 | 171 × 4 imagens distintas |
| Lobby "todos prontos" com participante offline | #21 + contrato do #20 | Tela igual ao `readiness` do servidor |
| Rolagem horizontal em telas estreitas e textos abaixo de 11 px | #21 | Auditoria de 5 larguras limpa |
| 154 de 156 clubes em 4-3-3 na abertura | #20 (catálogo v3) | Testes de catálogo aprovados |
| Pressionadores aglomerados atrás da bola | #20 (motor 0.5.2) | Suíte de motor aprovada |
| Deploy marcado como sucesso sem implantar e instalador publicado antes do teste | #20 | Workflows revisados; comprovação final depende do CI e da VPS |

## 5. Pendências e riscos remanescentes

1. **VPS:** a implantação, a saúde do serviço e a versão na URL pública não foram verificadas. Exigem a sua autorização e acesso ao servidor. A capacidade de carga na VPS também segue sem medição.
2. **Safari do iPhone:** não testado, porque este ambiente só tem Chromium.
3. **Aglomeração residual no campo:** o Codex reduziu a de 48,4% para 7,7% dos quadros em posse. O resto é comportamento do motor.
4. **Uma liga multiplayer com 8 participantes reais em produção** ainda não foi observada. Os ensaios usam clientes automatizados.
5. **Lint:** não existe script de lint no projeto.

## 6. Como publicar (depois da sua autorização)

1. CI e Windows já estão verdes no PR #23 (`b82ce65`).
2. Fazer o merge do PR na `main`. O workflow publica o instalador 1.4.9, e o deploy de produção aguarda a imagem aprovada e o ambiente "producao".
3. Verificar a saúde do serviço e a versão 0.11.0 na URL pública.
4. Fechar os PRs #19, #20, #21 e #22, cujo conteúdo já está no PR final.
