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

## Situação atual

- Participantes das Séries A, B e C de 2026: conferidos (MKT Esportivo, 90min, TNH1, Itatiaia).
- Cidade/UF: preenchidas quando de conhecimento público; **pendentes** para Barra, Caxias, Floresta, Maranhão e Ypiranga.
- Estádio, técnico, nome oficial e elenco: **pendentes** para todos.
- Cores: aproximação visual a confirmar; 23 clubes ainda com cores pendentes (usam cores neutras).

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
