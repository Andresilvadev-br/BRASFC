# World Database 2026/27: contrato entre engine e interface

Os tipos estão em [`src/lib/world/contract.ts`](../src/lib/world/contract.ts). As duas branches partem do PR #32 (`feature/offline-active-leagues`, Windows 1.6.1).

| Branch | Responsável | Dono de |
|---|---|---|
| `feature/world-database-engine` | Codex | Catálogo, inscrições, regulamentos, calendários, copas, continentais, persistência e estimativa de carga |
| `feature/world-database-experience` | Claude | Telas, componentes, bandeiras, escudos e pacote local de escudos |

## IDs

- **País:** trigrama FIFA em minúsculas, como no catálogo (`bra`, `esp`, `eng`, `sco`).
- **Clube:** o nativo brasileiro mantém o ID atual (`flamengo`); os demais usam `world/<país>/<slug>`.
- **Competições:**
  - `serie-a` … `serie-d` e `copa-do-brasil` (inalterados);
  - `league/<país>/<nível>`;
  - `state/<uf>/<nível>`;
  - `cup/<país>`;
  - `continental/<sigla>` (`ucl`, `uel`, `uecl`, `libertadores`, `sudamericana`).

## O que a engine fornece e a interface consome

| Função (servidor) | Retorno | Uso na interface |
|---|---|---|
| `worldCountries()` em `#lib/server/world-countries.ts` | `WorldCountry[]` | Seleção de países: bandeira, divisões, clubes, `playable` e `load` |
| `CareerData.worldSelection` | `WorldSelection` | Países ativos do save, os mesmos para todos os treinadores |
| `competitionsOf(career)` | `WorldCompetition[]` | Navegação de Competições, agrupada por país e por continente |
| `participationOf(career, competition)` | `CompetitionParticipation[]` | Selos do clube: aguardando estreia, em disputa, classificado, eliminado, não classificado ou campeão |

A branch de interface traz uma versão **provisória** de `worldCountries()`. Ela lê o catálogo instalado e o Brasil nativo. Como as divisões estrangeiras não têm inscritos confirmados (`membership` = 0 no catálogo `00b10fbcb9d42242ac8aec75`), saem com `playable: false` e `clubs: []`. A carga é estimada pelo número de jogos do regulamento. A engine substitui essa função mantendo a assinatura. A seleção de participação também tem um adaptador provisório para a Copa do Brasil e as Séries, derivado de `CupState` e `LeagueState`. A engine o substitui pelos estados oficiais.

## Escudos (só interface)

- Nenhum escudo de terceiros é versionado nem entra no instalador. O Brasfoot Next declara que escudos e marcas pertencem aos clubes. A licença do Megapatch 3.0 não foi confirmada.
- O jogador importa uma pasta que já possui, pela tela **Configurações › Escudos**. O processamento acontece no próprio app, sem internet. O resultado fica em `<pasta de dados>/crests/`, com o manifesto `CrestManifest` e um arquivo `<sha256-16>.webp` por imagem, deduplicado por conteúdo.
- Padrão de saída:
  - quadro quadrado de 128 px, com o escudo centralizado;
  - margem de 6 %, proporção original preservada, sem cortar a arte;
  - corte apenas das bordas totalmente transparentes;
  - transparência preservada; imagens opacas não são recortadas.
- Sem arquivo utilizável, o jogo usa o escudo gerado pelas cores do clube.

## Regras comuns

- Nada de participantes, regulamentos ou classificações inventados. Sem fonte verificável, o dado é `null`, `[]` ou `playable: false`.
- Os saves antigos continuam válidos. Sem `worldSelection`, o save é tratado como `{ countries: ['bra'] }` com a `LeagueSelection` do PR #32.
