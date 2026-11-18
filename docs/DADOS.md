# Dados de clubes — Brasil 2026

Arquivos em `src/lib/data/brasil/2026/`, carregados e validados por `src/lib/data/brasil.ts`.

| Arquivo | Conteúdo |
|---|---|
| `temporada.json` | temporada, versão dos dados, aviso e as três competições (20 clubes cada) |
| `clubes.json` | dados esportivos: id estável, nome popular, sigla, série, cidade/UF, estádio, técnico, força estimada, pendências e fontes |
| `identidade.json` | **separado** dos dados esportivos: cores aproximadas; nenhum escudo ou marca protegida (os escudos do jogo são genéricos) |
| `fontes.json` | registro de fontes (veículo, título, URL, datas, para que foi usada) |
| `correcoes.json` | correções manuais com fonte e motivo; aplicadas por cima de `clubes.json` |

## Regras

1. Só entram dados verificáveis. O que não foi conferido fica `null` e aparece em `pendencias`.
2. Nenhum dado real é inventado. Enquanto o elenco real não é importado, o jogo usa jogadores com **nomes fictícios** (combinações aleatórias de nomes comuns, marcados como `pending`), sempre com aviso na tela de que não são os atletas do clube.
3. A **força estimada (1–5)** é uma estimativa própria do BRASFC (série, histórico recente e investimento público), usada apenas para gerar os elencos pendentes. Não é dado oficial nem copiado de outro jogo.
4. Sem *scraping*: os participantes foram conferidos manualmente em reportagens públicas (ver `fontes.json`).
5. IDs são estáveis (`kebab-case`) e nunca reaproveitados.

## Situação atual (versão de dados 2026.1, 18/11/2026)

- Participantes das Séries A, B e C de 2026: conferidos (MKT Esportivo, 90min, TNH1, Itatiaia).
- **Cidade, UF e estádio**: conferidos nas tabelas "Participantes" das páginas da Wikipédia das três séries (editadas em 17/11/2026), inclusive Barra-SC (Balneário Camboriú), Caxias (Caxias do Sul), Floresta (Fortaleza), Maranhão (São Luís) e Ypiranga (Erechim).
- **Pendentes** (com motivo):
  - Estádios de Sport e Vila Nova (linha da tabela não lida literalmente na fonte).
  - Técnicos: as fontes trazem trocas ao longo da temporada sem um "técnico no início da temporada" confiável; nenhum técnico foi cadastrado. A IA usa *perfis de jogo* sem nome de pessoa.
  - Nomes oficiais completos dos clubes.
  - Cores de 23 clubes (sem fonte por clube; usam cores neutras).
  - Elencos reais: não importados (exigiriam conferência atleta a atleta). O jogo usa nomes fictícios sinalizados.
- **Regras 2026**: Série C conferida (1ª fase em turno único, 8 classificados para 2 grupos de 4, 4 acessos, 2 rebaixados). Séries A e B: 4 rebaixados e 4 acessos/rebaixados — **a confirmar** em fonte oficial da CBF. A Série D não é simulada: quem cairia da C permanece nela.

## Validador

`validateDataset` checa IDs, siglas duplicadas, UF, faixa da força, fontes existentes, campos nulos sem pendência, cores e 20 clubes por série. Rodado nos testes (`tests/data.test.ts`) e no carregamento (`DATASET_ISSUES`).

## Como corrigir um dado

Adicione em `correcoes.json`:

```json
{ "clube": "flamengo", "campo": "estadio", "valor": "Maracanã", "fonte": "<id em fontes.json>", "motivo": "conferido em ..." }
```

A fonte precisa existir em `fontes.json`. O campo sai automaticamente das pendências.

## Transferências (preparação)

Os elencos reais entrarão como `elencos/<clube>.json` com id estável por atleta; transferências serão registradas como eventos datados (atleta, origem, destino, data, fonte), nunca sobrescrevendo o histórico.


## Dev 0.4 — Série D, Copa do Brasil e regras por edição

- `src/lib/data/brasil/2026/serie-d.json`: 96 clubes em 16 grupos (Wikipédia, consultada em 11/2026). Grupos A1–A10 conferidos no texto; parte de A11 e A12–A16 vieram do resumo da página e estão marcados com a pendência `grupo-confirmar`. Campeão (Uberlândia), vice (ASA) e os seis acessos (ABC, ASA, Gama, Goiatuba, Nacional-AM, Uberlândia) conferidos também na CBF.
- `copa-do-brasil.json`: 126 participantes com a fase de entrada (28 + 74 + 4 + 20). Fontes: Wikipédia (pt/en) e anúncio da CBF. 14 clubes que só disputam a Copa foram cadastrados como "estaduais" (série E), com cidade pendente.
- Regras por edição em `src/lib/domain/rules.ts`: Série C com 20 (2026), 24 (2027, CBF/DOL) e 28 em dois grupos com três quedas por grupo (2028, CBF/CNN). A 2ª fase de 2028 ainda não foi publicada: o BRASFC projeta dois quadrangulares (marcado como projeção).
- Clubes sem cores conferidas recebem **cores provisórias geradas** (marcadas como tal), nunca apresentadas como oficiais.
- Premiação da Copa: tabela da Wikipédia em inglês, não conferida no regulamento (aviso na tela).
