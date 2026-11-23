# Expansão internacional — catálogo de pesquisa (2026/27)

Base independente do Brasil 2026 e **ainda não conectada à carreira**. Este commit não altera saves, regras de campeonatos, engine ou frontend.

- 36 clubes da fase de liga da UCL 2026/27, distribuídos por 16 ligas nacionais; não inclui os eliminados nas qualificatórias.
- 30 clubes da MLS 2026, com conferências oficiais.
- 36 observações de formação inferidas pela divisão em linhas dos onzes da jornada 4 da UCL (3–4 de novembro de 2026). Não representam necessariamente a formação preferida, nem instruções táticas verificadas. Formações ainda não suportadas devem ser implementadas ou mapeadas explicitamente, nunca substituídas silenciosamente por 4-3-3.
- Uma amostra de XI do Arsenal, com números e posições de jogo inferidas da ficha tática; posição em campo não é posição natural. Não é elenco completo.
- Todas as fichas de elenco integral continuam pendentes; não gerar atletas fictícios como se fossem reais.

## Próximos critérios de integração

1. Completar participantes das 16 ligas nacionais (não somente clubes UCL); adicionar classificatórias se incluídas no escopo. Verificar fontes oficiais, época e data de corte por competição.
2. Coletar elenco principal completo por clube, com ID persistente, nome, número, posição natural e secundárias verificadas; dados desconhecidos ficam pendentes. Separar inscrição continental de elenco doméstico. Resolver transferências/duplicidades e empréstimos. Não atribuir ratings estimados como oficiais.
3. Obter diversas fichas táticas recentes por treinador; calcular frequência de formação e registrar estilos, papéis, largura, pressão e alternativas como observados ou modelados. Usar adequação do elenco e contexto da partida para alternativas, sem cotas artificiais de formação.
4. Versionar catálogos, permitir ligas selecionáveis e adaptar calendário, economia, mercado, vagas continentais, regras domésticas e MLS. Não alterar saves já existentes. A MLS exige conferências, 34 jogos e playoffs; UCL exige 36 clubes, oito jogos e classificação/eliminação próprias.
5. Carregar somente pacotes necessários sob demanda, manter catálogo estático separado do save, simular ligas não ativas de forma leve e persistir deltas autoritativos. Validar no Electron e Web.
6. Só marcar liga como jogável após elenco, regras, calendário, persistência, IA e testes reais. Nenhum escudo protegido foi incluído.

Fontes oficiais e escopo por competição encontram-se no JSON.
