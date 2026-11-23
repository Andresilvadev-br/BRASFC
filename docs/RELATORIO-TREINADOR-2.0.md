# BRASFC — Carreira de Treinador 2.0: relatório de entrega

Branch: `dev-87mxsh`, construída sobre o PR #25 (`fix/career-contract-expiry-lock`), que já contém a `main` 0.11.0.
Nada foi publicado e a `main` não foi alterada.

## 1. Resumo

A carreira de treinador agora tem quatro sistemas novos e completos de ponta a ponta:

- **Vínculo real.** Um treinador sem contrato fica sem clube. A partir daí, o ex-clube não pode mais ser administrado: o bloqueio está no servidor, e as rodadas seguem com a IA no comando dele.
- **Mercado de treinadores.** Propostas chegam em três janelas por temporada, ficam salvas com prazo e podem ser comparadas. Antes de assinar, dá para ver o clube por dentro.
- **Conhecimento tático do treinador.** É separado do entrosamento do elenco e acompanha o treinador quando ele troca de clube.
- **Minhas Táticas.** Uma biblioteca de táticas salvas, que vale em qualquer clube.

Além disso, a entrega cobre:

- partida com 10 jogadores de verdade no motor;
- suspensões persistentes por competição;
- "Montar melhor 11" com otimização do conjunto;
- reuniões de orçamento com resposta argumentada da diretoria;
- idades nas telas que faltavam.

## 2. Auditoria do PR #25

| Item do PR #25 | Problema encontrado | Correção |
|---|---|---|
| Bloqueio de rodadas após o desligamento | `playRound` lançava erro para qualquer treinador demitido. A carreira travava; foi essa a falha do CI ("temporada inteira", que dependia de uma demissão aleatória) | Sem clube, o calendário avança. O jogo do ex-clube é simulado pela IA, sem decisões do usuário e sem lançamentos financeiros na carreira |
| Renovação automática | Dependia só de confiança ≥ 60 | A diretoria avalia confiança, campanha, objetivo, caixa e reputação. Pode aprovar (2 ou 3 temporadas) ou recusar, sempre com aviso. A recusa explícita do treinador continua prevalecendo |
| Pedido de verba | Só confiança e caixa; aumento fixo | Reunião completa (seção 3.6) |
| Melhor 11 | `autoLineup` guloso, e trocava as funções do treinador | Algoritmo húngaro sobre todo o elenco elegível, com prévia. Funções, mentalidade e instruções são mantidas |
| Idades | Só em parte das telas | Mercado, prévia de clubes, escalação de entrada, banco e reservas |
| Propostas | Duas telas com "Assumir" sem confirmação | Uma única Central de Propostas, com confirmação obrigatória (`confirm: true` no servidor) |
| Histórico | Uma troca de clube no meio da temporada somava os jogos do clube antigo ao novo | Cada passagem grava a própria linha (`seasonRow`) |

## 3. Funcionalidades

### 3.1 Vínculo do treinador

O estado não foi duplicado. Ele é derivado de `club.board.dismissed`, `office.renewalDeclinedSeason`, `office.unemployedSince` e das propostas abertas:

| Estado | Quando |
|---|---|
| Contratado | Situação normal |
| Saída confirmada | O treinador recusou a renovação; segue no comando até o fim da temporada |
| Sem clube | Contrato expirado ou demissão |
| Em negociação | Sem clube e com propostas abertas |

- **Fim do contrato:** a saída entra no histórico, nas decisões e nos marcos, e chega a mensagem "Fim de contrato".
- **O que o servidor bloqueia para um ex-treinador:**
  - gestão do clube (`POST /club`);
  - ações do gabinete;
  - tática, treinos e plano (`PATCH`);
  - navegação: o treinador sem clube só acessa Gabinete, Mensagens, Mundo e História.
- **O ex-clube volta para a IA:** o universo nomeia um técnico livre para ele.

### 3.2 Mercado de treinadores

- **Janelas:** em torno de 25%, 60% e 85% das rodadas de liga (rodadas 10, 23 e 32 numa liga de 38).
  - O número de propostas por janela (0 a 3) depende da reputação, da posição e da confiança. Uma janela pode passar sem nenhuma.
  - Fora das janelas também chegam propostas: após uma demissão, no fim de contrato e no mercado de quem está sem clube.
- **Sem clube:** surgem novas oportunidades a cada 3 a 6 rodadas. O treinador nunca fica preso.
- **Cada proposta é persistida** com:
  - origem;
  - prazo (temporada e rodada);
  - situação (aberta, recusada, aceita ou expirada);
  - objetivo;
  - o registro de que já foi adiada (`postponed`).
- **Ações:** avaliar, aceitar (com confirmação), recusar e adiar uma única vez (+3 rodadas).
- **Assinatura transacional:** `changeCareerClub` usa a versão da carreira. Um segundo clique recebe 409.
- **Prévia do clube** (`GET /api/careers/:id/clubes/:clubId`, carregada só quando o treinador abre a proposta):
  - visão geral, últimos resultados, diretoria e técnico atual;
  - projeto e objetivos;
  - elenco completo (titulares e banco, idade, OVR, potencial dos jovens, destaques, carências por setor);
  - finanças: caixa, verba, teto da folha, folha real e saúde.

  A prévia usa as mesmas funções que montam o clube na assinatura (`initialClubState`, `boardObjectivesFor`, teto inicial da folha). Por isso os números batem depois de assumir; o teste confirma.
- **Interface:**
  - janela "Clubes interessados em você";
  - cards com escudo, divisão, reputação, momento, objetivo, salário, duração e prazo;
  - painel lateral com abas, comparação de até 3 propostas e modal de assinatura;
  - para quem está sem clube, o botão "Avançar uma semana".

### 3.3 Conhecimento tático pessoal

- **Onde fica:** `career.data.coachKnowledge` guarda formações, estilos, instruções, conceitos e linha do tempo.
- **Ritmo:** cresce mais devagar que o entrosamento do elenco e perde só 1% por temporada (o elenco perde 5%).
- **Efeito em campo:** a execução usa o domínio do elenco mais 30% da vantagem do treinador, nunca acima do que o treinador sabe.
- **Efeito no treino:** com um treinador que domina o sistema, o elenco aprende até 1,6 vez mais rápido (`teachingFactor`).
- **O que não é copiado:** o entrosamento entre os atletas.
- **Saves antigos:** o conhecimento nasce igual ao domínio do clube atual, então o motor não muda até a primeira troca de clube.
- **Interface:** painel "Você × Elenco × Em campo" no Domínio tático.

### 3.4 Minhas Táticas

- **O que fica salvo:** formação, mentalidade, estilo, todas as instruções, funções e ordens individuais **por posição**. Também fica a referência do clube de origem: escalação, banco e capitães.
- **Operações:** salvar, renomear, duplicar, substituir pela atual e excluir. São até 24 táticas, validadas no servidor.
- **Em outro clube:** nenhum ID de jogador do clube anterior é usado. O melhor encaixe é recalculado e a prévia lista o que precisa ser revisto.
- **Aplicar:** abre uma prévia das mudanças e avisa quando há alterações não salvas.

### 3.5 Expulsões, 10 em campo e suspensões

**Motor 0.5.3:**

- substituição com `slot` (o reserva entra na vaga aberta e a posição de quem saiu fica vazia);
- decisão `move` (leva um atleta à vaga, sem substituição);
- troca de formação com vagas (`''`);
- recusa de formação com 11 nomes quando há 10 em campo.

**IA:** depois de uma expulsão na defesa, recompõe a linha com um reserva, ou recuando um atacante quando não há trocas.

**Reproduções:** partidas gravadas em 0.5.2 desligam esse comportamento (`rulesForVersion`), para reproduzirem o mesmo resultado.

**Interface:**

- "10 jogadores em campo — 1 expulso";
- vagas tracejadas no campo;
- toque no atleta e depois na vaga;
- sugestão do auxiliar com o botão "Fazer a troca", nunca automática.

**Disciplina** (`career.data.discipline`), por competição:

- vermelho e segundo amarelo: 1 jogo de suspensão;
- 3 amarelos: 1 jogo de suspensão, e a contagem zera;
- na troca de temporada os amarelos zeram e as suspensões pendentes continuam.

**Aplicação no servidor:** `fixtureSetup` tira os suspensos da escalação e do banco. Uma decisão forjada que tente colocar um suspenso em campo é recusada pelo motor.

**Avisos:** em Elenco, Táticas (bloqueia a escalação), Calendário e Pré-jogo.

### 3.6 Diretoria

- **Pedidos:** transferências, teto da folha ou redistribuição, sempre com uma justificativa.
- **O que a diretoria analisa:**
  - caixa, resultado mensal e dívida;
  - campanha em relação ao objetivo;
  - coerência da justificativa;
  - perfil da diretoria, reputação e insistência.
- **Respostas possíveis:**
  - aprovação integral;
  - aprovação parcial;
  - contraproposta (aceitar ou recusar até 3 rodadas depois);
  - recusa;
  - "aguarde resultados" (12 rodadas).
- **Limites:**
  - 3 pedidos por tipo na temporada;
  - 8 rodadas entre pedidos do mesmo tipo;
  - aumento máximo de +50% sobre o orçamento do primeiro pedido da temporada.
- **O caixa nunca muda.** O teto da folha não cria dinheiro.
- **Onde aparece:** painel de reunião no Gabinete, com histórico, e atalho em Finanças.

## 4. Arquitetura e compatibilidade

- **Nenhuma migração SQL.** Todos os campos novos são opcionais dentro de `careers.data`, e cada um tem sanitização para saves antigos:
  - `coachKnowledge`, `tacticPresets`, `discipline`;
  - em `office`: `unemployedSince`, `offerWindows`, `offerAlert`, `budgetTalks`, `budgetCounter`, `budgetBaseline`;
  - nas propostas: `expiresRound`, `status`, `source`.
- **Módulos novos:**
  - `domain/employment.ts`, `domain/coach-knowledge.ts`, `domain/tactic-presets.ts`, `domain/lineup-optimizer.ts`, `domain/discipline.ts`, `domain/board-talks.ts`;
  - `server/coach-market.ts`, `server/coach-knowledge.ts`.
- **Partida no cliente e no servidor:** usam o mesmo contexto (`view.effective`), então o resultado visto é o mesmo que o servidor reproduz.

## 5. Testes executados

| Verificação | Resultado |
|---|---|
| `npm run verify` (svelte-check, vitest, build) | 712 arquivos sem erros; **219 aprovados**, 3 ignorados (exigem PostgreSQL real); build concluído |
| `tests/coach-career-2.test.ts` | 18 cenários aprovados, incluindo uma temporada inteira pelo servidor (PGlite) |

Cobertura dos cenários do pedido:

| Cenário | Validado |
|---|---|
| 1 | Recusa, último jogo, saída em 2027 e bloqueio do ex-clube |
| 2 | Renovação aprovada, recusada pela diretoria e recusa explícita |
| 3 | Três janelas, persistência, sem duplicatas, assinatura com 409 no clique duplo |
| 4 | Conhecimento preservado; o elenco novo precisa se adaptar |
| 5 | O preset muda de clube sem IDs inválidos |
| 6 | Zagueiro expulso: atacante sai, zagueiro entra na vaga, o time segue com 10; `move`; IA recompõe |
| 7 | O suspenso não joga, nem por decisão forjada, e volta depois de cumprir |
| 8 | Melhor 11 de 4-4-2 para 4-3-3 |
| 9 | Diretoria: limites, sem criação de caixa, contraproposta |
| 10 | Save antigo abre e joga |

**Não validado nesta entrega:**

- suíte com PostgreSQL real (roda no CI);
- multiplayer com usuários simultâneos (a suíte de multiplayer existente passa, mas não foi escrito um teste novo);
- inspeção visual por capturas;
- Windows.

## 6. Pendências

- Capturas reais das telas novas (não feitas, a pedido, para economizar).
- O multiplayer usa o motor novo (10 em campo) e aceita formação com vagas, mas o lobby e as ligas compartilhadas não têm mercado de treinadores nem suspensões persistentes. Isso entra na unificação da Dev 0.12.
- Clubes da IA não têm caixa próprio persistido. A prévia usa o estado inicial determinístico, que é exatamente o que o treinador encontra ao assinar.
