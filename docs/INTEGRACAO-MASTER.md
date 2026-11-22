# BRASFC — Integração Master (Codex/Work + Claude)

Registro compartilhado entre as equipes. Cada equipe mantém a sua seção. As decisões comuns ficam em "Pendências entre equipes".

> A seção da Equipe A (Codex/Work) deve ser acrescentada pelo Codex na branch `improvement/master-engineering`. Na integração, mantenha as duas seções.

---

## Equipe B — Claude (experiência, interface e animações)

### Base e branches

| Item | Valor |
|---|---|
| `main` verificada | `770d876` — BRASFC 0.10.0 / Windows 1.4.8 (publicada) |
| PR anterior ainda aberto | **#19** (`dev-87mxsh`): `7351b9d` apresentação pré-jogo + `28f4fdc` Central de carreiras (0.10.1) |
| Branch desta etapa | `improvement/master-experience`, criada a partir de `28f4fdc` (= `770d876` + PR #19) |
| PR desta etapa | aberto a partir de `improvement/master-experience` (contém os commits do #19) |

Integrar a `improvement/master-experience` dispensa o #19, que pode ser fechado depois da integração.

### Arquivos fora da área da Equipe B (herdados do PR #19, criados antes da divisão de responsabilidades)

Peço revisão do Codex. A partir de agora não altero esses arquivos sem combinar antes.

| Arquivo | Alteração | Motivo |
|---|---|---|
| `migrations/0012_career_label.sql` | `ALTER TABLE careers ADD COLUMN label TEXT` (aditiva) | Nome do save sem tocar em `data`, `version` ou `id` |
| `src/lib/server/repos/careers.ts` | `renameCareer`, `cleanCareerLabel`, coluna `label`, divisão calculada em `listCareers(compact)` | Biblioteca de saves |
| `src/routes/api/careers/[id]/+server.ts` | `PATCH { action: 'rename', label }` | Renomear save |
| `src/routes/continuar/+page.server.ts` | Carrega carreiras e atalhos das ligas abertas | Biblioteca de saves |
| `src/lib/domain/career.ts` | Campos opcionais `label` e `division` em `Career` | Tipagem da listagem |
| `src/lib/domain/saves.ts` (novo) | `saveIssue`, `latestValidSave`, `sortSaves`, `saveTitle` | Regras da biblioteca. Se preferir, o Codex pode assumir o arquivo |
| `tests/saves.test.ts`, `tests/live-round.test.ts` | 12 cenários de saves e a lista de migrações com a 0012 | Testes |

### Contratos de API que a interface usa (sem mudança de formato nesta etapa)

- `PATCH /api/careers/:id` com `{ action: 'rename', label: string | null }` → `{ ok, label }`. Retorna 400 para nome com mais de 40 caracteres e 404 para carreira de outro perfil.
- `DELETE /api/careers/:id` → `{ ok }` ou 404.
- Sessão da rodada ao vivo: `phase`, `required`, `confirmed`, `waiting`, `loaded` e `fixtures[{ competition, home, away, score, phase, minute }]`. O placar da rodada agrupa por `competition`.
- Lobby (`ConnectedWorld` / realtime): `members[].online` e `assignment.ready`.

### Pendências entre equipes (Claude → Codex)

1. **Estado "apto a iniciar".** O lobby hoje deduz a presença por `members[].online` e a prontidão por `assignment.ready`. A diretriz pede que o frontend não adivinhe. Proposta de contrato para o Codex, no estado do mundo e na sessão:
   ```ts
   readiness: {
     required: string[];   // perfis obrigatórios para a próxima rodada
     ready: string[];      // confirmaram preparação
     online: string[];     // conectados agora
     canStart: boolean;    // regra real da liga cumprida
     blockedBy?: Array<{ profileId: string; reason: 'offline' | 'not_ready' | 'loading' }>;
   }
   ```
   Assim que existir, o anel do lobby e o do intervalo passam a usar `canStart` e `blockedBy` em vez da dedução atual. Enquanto isso, o lobby já separa "prontos" de "desconectados" e não mostra mais "Todos prontos" com alguém offline.
2. **Campo 2D (A5).** A interface vai interpolar só entre estados oficiais consecutivos (`tick`) e não vai mover jogadores para posições inventadas. Preciso que o Codex confirme se cada quadro enviado (`players[].x/y`) já está em metros do campo (`PITCH.length`/`PITCH.width`) e qual é o intervalo real entre ticks na transmissão.
3. **Formações (A4).** A interface mostra a formação de qualquer clube sem supor 4-3-3. Quando o catálogo mudar, nenhuma alteração visual é necessária.

### Entregas desta etapa

**Fase 1 — estabilização da interface**
- Auditoria de layout no navegador (`scripts/audit-layout.mjs`), só em texto, sem capturas:
  - 31 rotas, com carreira de treinador (rodadas jogadas) e carreira de jogador;
  - larguras 1920×1080, 1600×900, 1366×768, 390×844 e 320×640;
  - mede rolagem horizontal, elementos fora da viewport e erros de console.
- Corrigido:
  - estouro a 320 px em Nova carreira, Novidades, Finanças, Notícias, Gabinete e na tabela do Painel;
  - 33 regras com texto de 9 a 10,5 px subiram para o mínimo de 11 px.
- Resultado final: 0 telas com rolagem horizontal e 0 erros de console nas 5 larguras.

**Fase 2 — reformulação (em andamento)**
- **Elenco:** separação explícita entre Titulares, Banco (relacionados, até 9) e Fora da relação, nas três visões (campo, cartões e lista). Usa a mesma relação da Central de Táticas.
- **Central do Treinador:** nova faixa "Resultados recentes" com placares oficiais (V/E/D, competição e rodada).
- **Lobby:** a prontidão diferencia "prontos" de "online".

### Verificado no navegador (Playwright, dev server com PGlite)

- Elenco: 11 titulares, 9 no banco e 3 fora da relação, iguais nas visões campo e lista.
- Painel: 3 resultados oficiais após 3 rodadas ("Empate", "Vitória", "Derrota").

### Próximas etapas da Equipe B

- **Fase 2:** Treinos, Mercado, Calendário, Competições, Notícias, Configurações, Criação de ligas e Comissão técnica.
- **Fase 3:** campo 2D (interpolação entre ticks oficiais), cenas de evento e intervalo, que dependem da pendência 2.
- **Fase 4:** lobby e intervalo com o contrato `readiness`, que depende da pendência 1.
- **Fase 5:** homologação visual com capturas comparativas, com custo de tokens combinado com o responsável.
