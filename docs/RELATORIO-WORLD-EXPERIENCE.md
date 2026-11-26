# World Database 2026/27: interface, escudos e experiência

**Branch:** `feature/world-database-experience`
**Base:** PR #32 (`feature/offline-active-leagues`, Windows 1.6.1)
**Contrato com a engine:** [`docs/WORLD-CONTRACT.md`](WORLD-CONTRACT.md). O Codex adotou o mesmo `src/lib/world/contract.ts`, e o arquivo é idêntico nas duas branches.

## Países, divisões e competições na interface

| | Situação |
|---|---|
| Países listados | 34 com ligas no catálogo `00b10fbcb9d42242ac8aec75`; o Brasil vem dos dados nativos |
| Jogáveis | Brasil: Séries A a D e Copa do Brasil, com 156 clubes elegíveis |
| Em preparação | 33 países com 46 divisões cadastradas, sem inscrições confirmadas. Os clubes seguem no mercado. |
| Continentais | A navegação já tem grupo próprio. A classificação para 2027 é da engine; ainda não há partidas continentais. |

A interface só exibe o que a engine marca como `playable`. Quando a branch do Codex confirmar inscrições e calendário (Espanha e Itália já têm 20/20 na elite), esses países passam a aparecer como selecionáveis, sem mudanças na interface.

## Entregas

1. **Seleção de países antes dos treinadores**
   - Cada cartão mostra bandeira, divisões, clubes, copas, jogos e tempo por temporada.
   - Há busca e filtro por continente.
   - O resumo traz o total de partidas, o tempo e o save estimados e os clubes disponíveis.
   - Ativar um país ativa todas as divisões dele. O recorte de divisões do Brasil (PR #32) ficou como opção avançada e é enviado como `leagueSelection`.
2. **Escolha de clube:** aceita divisões de qualquer país ativo, com rótulos da engine e lista compacta quando há mais de 4 divisões. A seleção vale para todos os treinadores locais.
3. **Competições:** navegação agrupada por país e continente. Copas abrem a própria tela; competições não jogáveis aparecem desabilitadas.
4. **Situação nas copas:** selos para aguardando estreia, em disputa, classificado, eliminado (com fase e adversário), não classificado e campeão.
5. **Bandeiras:** 132 bandeiras locais (flag-icons, licença MIT), em WebP 64×48, somando 139 KB. O Windows não desenha bandeiras em emoji.
6. **Escudos:** importação local em Configurações › Escudos.

## Escudos

**Licença.** O Brasfoot Next declara que escudos e marcas pertencem aos clubes; a licença CC BY-SA vale para os dados. A licença do Megapatch 3.0 não foi confirmada. Por isso nenhum escudo entra no repositório ou no instalador. O jogador escolhe uma pasta que já possui, e o app processa tudo localmente, sem rede.

**Reconhecimento dos arquivos:**
- Brasfoot Next: caminho exato `clubs/<país>/<slug>/crest.png`.
- Megapatch, layout clássico ou pasta solta: nome normalizado, sem acentos e sem termos genéricos como FC, EC ou Clube. Nomes ambíguos ficam de fora.
- Os clubes brasileiros do Brasfoot Next apontam para o ID nativo. A única exceção conferida é `bra/bragantino` → `rb-bragantino` (SP, Série A).

**Padrão de saída:**
- quadro de 128 px, centralizado, com margem uniforme de 6 %;
- escala uniforme, sem distorção nem corte da arte;
- remoção apenas das bordas 100 % transparentes; imagem opaca fica inteira;
- WebP de no máximo 64 KB, endereçado pelo conteúdo, então imagens iguais não se duplicam;
- com mais de uma fonte, fica a imagem de maior resolução;
- sem imagem, o clube usa o escudo gerado pelas cores.

**Medição com o Brasfoot Next real** (amostra de Brasil, Espanha, Itália e Inglaterra, rev. 13fc362):

| | Resultado |
|---|---|
| Arquivos lidos | 4.946 |
| Escudos reconhecidos e salvos | 213 de 213 |
| Tempo | 3,5 s |
| Pacote | 1,3 MB (≈ 6,3 KB por escudo) |
| Clubes brasileiros nativos | 39 de 170 (23 %): todos os que o Brasfoot Next cobre |
| Internacionais | 174 nesses três países |

Pela contagem da engine, o banco completo cobre 1.083 dos 1.196 clubes internacionais (90,5 %). A cobertura brasileira acima de 39 clubes depende de outra fonte local, como o Megapatch. A busca por nome já está preparada, mas não foi testada com arquivos reais do Megapatch, que não estavam disponíveis aqui.

## Copa do Brasil: o caso do Sport

O Sport é inscrito na **2ª fase** da edição 2026 (`copa-do-brasil.json`). Foram encontradas duas causas:

- **Interface (esta branch):** a tela da Copa só olhava confrontos já sorteados. Por isso dizia "Seu clube não está nesta edição" para quem entra numa fase futura. Agora mostra **Aguardando estreia · 2ª fase · 25/02**, verificado no navegador com uma carreira do Sport.
- **Engine (Codex):** o confronto só era sorteado ao avançar a rodada, e a data da estreia aparecia como folga. A branch do Codex prepara a fase ao calcular o calendário e reconstrói chaves ausentes ao reabrir o save.

## Testes

- **Unitários** (`tests/world-experience.test.ts`, 16 testes):
  - bandeiras e nomes em português;
  - estimativa de jogos;
  - recorte e enquadramento dos escudos;
  - correspondência entre arquivo e clube (incluindo "Sport" e nomes ambíguos);
  - selos de participação;
  - agrupamento das competições.
- **`npm run verify`:** 239 aprovados e 4 ignorados nesta branch. **Integrado com a engine** (merge local sem conflitos): 245 aprovados e 4 ignorados, sem erros de tipo.
- **Chromium, no build integrado em modo offline:**
  - teste do PR #32 atualizado (dois treinadores, só a Série B, rodadas, fechar e reabrir) aprovado;
  - assistente padrão com dois treinadores: envia `worldSelection`, e o save grava `{ countries: ['bra'] }` com as quatro Séries e a Copa;
  - importação real de escudos;
  - Competições e Copa a 1366 e 390 px, sem rolagem horizontal e sem erros de página.

## Pendências

- **Não validado:** o executável Windows, offline e com a pasta de dados real. Este ambiente não roda Windows; o workflow `desktop.yml` cobre essa etapa no PR.
- Países estrangeiros jogáveis, tabelas estrangeiras e telas continentais com dados reais dependem da engine. A interface já está pronta para `playable: true`, `competitionsOf()` e `participationOf()`.
- A prévia de elenco na escolha de um clube estrangeiro fica em branco até a engine definir o elenco inicial.
- O custo por partida (2,5 ms) é a estimativa provisória da interface; a engine fornece a medida definitiva em `LoadEstimate`.
