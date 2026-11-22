# BRASFC Master — Relatório da Equipe B (Claude)

Experiência, interface e animações. Data: 22/11/2026. Base comum: `28f4fdc` (0.10.1). Comparação com a versão publicada `770d876` (0.10.0).

## 1. Resumo

| Fase | Entrega | PR |
|---|---|---|
| 1 · Estabilização | Auditoria de layout no navegador, overflow a 320 px corrigido, piso de 11 px | #21 |
| 2 · Telas | Elenco por relação, resultados recentes, calendário, criação de liga, `Switch` | #21 |
| 4 · Prontidão | Lobby e seção Rodada consomem o contrato `readiness` da Equipe A | #21 |
| 3 · Partida | Campo ao vivo interpolado, estatísticas do intervalo, escudo nas cenas | #22 (empilhado no #21) |
| 5 · Homologação | Capturas comparativas e este relatório | #22 |

## 2. Problemas encontrados e causas

| Problema | Causa | Solução |
|---|---|---|
| Rolagem horizontal a 320 px em 6 telas | Grades com `1fr` (mínimo pelo conteúdo) e seletores largos | `minmax(0, 1fr)`, quebra de texto, colunas responsivas |
| Textos de 9 a 10,5 px | 33 regras de estilo espalhadas | Piso de 11 px |
| Elenco sem distinção entre banco e fora da relação | Tudo que não era titular aparecia como "Reservas" | Mesma relação da Central de Táticas (banco salvo ou automático) |
| Lobby mostrava "Todos prontos" com alguém offline | A prontidão era deduzida só de `ready` | Presença separada; depois, contrato `readiness` (`canStart`) |
| Campo ao vivo "teleportava" a cada pulso | Ninguém chamava `draw(alpha)` na partida ao vivo | Interpolação entre o que está na tela e o quadro oficial |
| Criação de liga com cara de formulário | Inputs e selects soltos dentro de um `<details>` | Painel de configuração com cards, pílulas, stepper e prévia |

## 3. Testes executados (todos com execução real)

| Verificação | Resultado |
|---|---|
| `npm run check` | 0 erros e 0 avisos |
| `vitest` | 191 aprovados e 3 ignorados (exigem PostgreSQL real; rodam no CI) |
| `scripts/audit-layout.mjs` (31 rotas × 1920, 1600, 1366, 390 e 320) | 0 telas com rolagem horizontal e 0 erros de console |
| `tests/multiplayer-browser.mjs` contra o build | Aprovado (ligas de treinador e atleta, convites, recarga, 4 larguras) |
| Ensaio de integração com `improvement/master-engineering` | Conflito só em `docs/INTEGRACAO-MASTER.md`; check sem erros; 187 testes; os dois testes de navegador aprovados |
| Prontidão contra o servidor real | Servidor `requiredCount 1, readyOnlineCount 0, canStart false`; tela "0/1 · 0 de 1" |
| Campo ao vivo, rodada real, 4 s | 4 imagens distintas sem interpolação × 162 com |
| Rodada ao vivo até o intervalo | 53 cenas com escudo; 10 linhas de estatística; prontidão "0/1"; sem overflow nem erros |

## 4. Arquivos principais

- **Novos:**
  - `src/lib/ui/Switch.svelte`
  - `src/lib/ui/ReadinessRing.svelte`
  - `src/lib/ui/match/frame-tween.ts`
  - `src/lib/ui/match/StatsCompare.svelte`
  - `scripts/audit-layout.mjs`
  - `scripts/capturas-homologacao.mjs`
  - `tests/frame-tween.test.ts`
- **Alterados:**
  - telas de elenco, painel, calendário, multiplayer, lobby e comissão;
  - `ConnectedWorld`, `LiveMatch`, `PitchCanvas` e `BroadcastMoments`;
  - estilos de 18 arquivos (piso de 11 px).

## 5. Comparações antes × depois

As capturas foram geradas automaticamente pelo `scripts/capturas-homologacao.mjs`, com o mesmo roteiro nas duas versões: carreira de treinador com 3 rodadas, carreira de jogador e uma conta para criar a liga. Elencos, datas e resultados variam com a semente de cada carreira. A versão "antes" é a 0.10.0 publicada, que já inclui a primeira etapa visual.

### Menu principal · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-menu-pc.jpg) | ![depois](homologacao/depois-menu-pc.jpg) |

### Menu principal · 390 × 844

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-menu-mobile.jpg) | ![depois](homologacao/depois-menu-mobile.jpg) |

### Carreiras salvas · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-carreiras-pc.jpg) | ![depois](homologacao/depois-carreiras-pc.jpg) |

### Carreiras salvas · 390 × 844

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-carreiras-mobile.jpg) | ![depois](homologacao/depois-carreiras-mobile.jpg) |

### Central do Treinador · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-painel-treinador-pc.jpg) | ![depois](homologacao/depois-painel-treinador-pc.jpg) |

### Central do Treinador · 390 × 844

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-painel-treinador-mobile.jpg) | ![depois](homologacao/depois-painel-treinador-mobile.jpg) |

### Elenco · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-elenco-pc.jpg) | ![depois](homologacao/depois-elenco-pc.jpg) |

### Calendário · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-calendario-pc.jpg) | ![depois](homologacao/depois-calendario-pc.jpg) |

### Central de Táticas · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-taticas-pc.jpg) | ![depois](homologacao/depois-taticas-pc.jpg) |

### Central do Jogador · visão geral · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-jogador-visao-pc.jpg) | ![depois](homologacao/depois-jogador-visao-pc.jpg) |

### Central do Jogador · visão geral · 390 × 844

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-jogador-visao-mobile.jpg) | ![depois](homologacao/depois-jogador-visao-mobile.jpg) |

### Central do Jogador · desenvolvimento · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-jogador-treino-pc.jpg) | ![depois](homologacao/depois-jogador-treino-pc.jpg) |

### Central do Jogador · contratos e mercado · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-jogador-contratos-pc.jpg) | ![depois](homologacao/depois-jogador-contratos-pc.jpg) |

### Criação de liga · 1366 × 768

| Antes (0.10.0 publicada) | Depois (Equipe B) |
|---|---|
| ![antes](homologacao/antes-criar-liga-pc.jpg) | ![depois](homologacao/depois-criar-liga-pc.jpg) |

## 6. Problemas que permaneceram e recomendações

- O motor ainda pode gerar aglomeração e sobreposição no campo 2D. Isso é tarefa da Equipe A (A5): a interface não altera coordenadas oficiais.
- Mercado, Competições, Notícias, Estatísticas, Treinos e Mensagens foram auditados e mantidos. Cabe uma segunda passada visual depois da integração, com prioridade para o Mercado.
- A capacidade de carga e a homologação do Windows ficam com a Equipe A.
- A homologação visual no Safari do iPhone não foi feita: o ambiente só tem Chromium.

## 7. Riscos para a próxima etapa

- O #22 está empilhado no #21. Integrar primeiro o #21 e depois trocar a base do #22 para `improvement/master-integration`.
- O tipo `readiness` está declarado localmente na interface, idêntico ao contrato. Se a Equipe A mudar o contrato, atualizar `ConnectedWorld.svelte` e o lobby.
