# Novidades

## 0.13.0 — LOCAL LEGACY

- Jogo 100% offline no Windows: o aplicativo sobe o jogo embutido (arquivos do instalador, save PGlite na pasta do usuário) e nunca abre o site. A internet fica só para distribuição e atualização.
- Removidos carreira online, salas, convites, contas, chat, WebSocket e sincronização remota. O site público (VPS) virou apresentação e download; as rotas do jogo redirecionam para a página inicial e a API do jogo responde 410. O banco antigo do servidor não é tocado.
- Carreira local com vários treinadores no mesmo save: “Adicionar outro treinador” na escolha do clube, turnos na ordem de criação, troca de controle com tela de passagem, mensagens/finanças/histórico por treinador. Uma carreira individual é o caso de um treinador só (mesma arquitetura).
- Negociação entre treinadores humanos com contrapropostas livres, sobre o mercado existente (contratos, orçamento e resposta do atleta), sem transações duplicadas.
- Central de resultados simultâneos (só com vários treinadores), intervenções por expulsão, segundo amarelo e lesão, clique no clube para pausar e intervalo sequencial. Clássico, Pixel e Narração seguem na carreira individual.
- Janela de comando tático em três áreas (também na partida individual).
- Aparência: sem barba/bigode; novos rostos, penteados, cores e roupas.
- Migração aditiva 0013 (`coach` em mensagens e lançamentos). Instalador Windows 1.6.0.

## 0.12.0 — Carreira única de treinador

- Carreira de Treinador 2.0: contratos, desemprego, mercado de treinadores, conhecimento tático, Minhas Táticas, negociação de verba com a diretoria, expulsões com time de 10, suspensões persistentes, melhor 11 e idades.
- Carreira de jogador descontinuada: saves antigos ficam na biblioteca como legado. Ligas online só de treinadores (um por clube; auxiliar sempre da IA).
- Mesmas telas na carreira individual e na online, por uma camada única de armazenamento (local × liga).
- Hybrid Save Engine: fila local persistente (IndexedDB) para tática, treinos e dicas, sincronização automática ao reconectar sem duplicar, e indicadores de salvo localmente/sincronizando/sincronizado.
- Rodada rápida (P50 do servidor de ~2 s para ~0,25 s), menu principal sem rolagem, qualidade visual adaptativa e delegação temporária à IA nas ligas.
- Novo site: landing page em `/` (download para Windows, galeria, novidades e comunidade); o jogo no navegador passou para `/jogar`. O app do Windows e o modo offline continuam abrindo direto no jogo.
- Sem migração de banco. Instalador Windows 1.5.0.

## 0.11.0 — BRASFC Master

- Integração das equipes de engenharia (Codex) e de experiência (Claude) sobre a 0.10.1.
- Prontidão oficial da rodada (`readiness`) no lobby e na seção Rodada; partida só começa com obrigatórios prontos e online.
- Motor 0.5.2 com pressão e cobertura menos aglomeradas e catálogo de abertura v3 com formações variadas.
- Campo ao vivo interpolado entre quadros oficiais, comparativo de estatísticas no intervalo e escudo nas cenas de lance.
- Elenco por titulares, banco e fora da relação; calendário com resultados; criação de liga em painel visual; resultados recentes no painel.
- Publicação protegida por imagem aprovada, backup e verificação de saúde. Migração aditiva 0012. Instalador Windows 1.4.9.

## 0.10.1 — Central de carreiras

- Menu principal com Continuar (desabilitado sem save válido), Nova carreira, Carregar carreira e Carreiras compartilhadas.
- Biblioteca de saves em cards: clube, treinador ou atleta, modalidade, temporada, data no jogo, competição, última atividade e indicador de mais recente.
- Organização por mais recentes, mais antigos, tipo e clube ou nome, com carregamento incremental e estados vazio, incompatível e sem conexão.
- Renomear o save (coluna própria, sem alterar identificador, versão nem progresso) e exclusão com confirmação explícita, restrita à carreira escolhida.
- Ligas multiplayer listadas à parte; só o anfitrião exclui um universo, no multiplayer.
- Apresentação pré-jogo centralizada no celular. Migração aditiva 0012.

## 0.10.0 — Visual premium

- Biblioteca de cards esportivos (ação, seleção, indicador, confronto e destaque) com microinterações da Ultra Motion X.
- Central do Jogador reconstruída: contrato e mercado em cards com disponibilidade explicada, foco de treino em cards e evolução real do geral.
- Partida ao vivo com placar de TV, controles compactos, lances traduzidos sem repetição e placar da rodada agrupado por série.
- Lobby com participantes em cards, presença online e prontidão animada; prontidão do intervalo no mesmo padrão.
- Editor de personagem com prévia de cada peça, cards das ligas e campos de seleção unificados.
- Correção do painel de exclusão de liga no celular (painel inferior com áreas seguras). Sem migração de banco. Instalador Windows 1.4.8.

## 0.9.1 — Criação de ligas e lobby

- Cards de Treinador e Jogador na entrada, configuração compacta e modo de participação confirmado pelo servidor.
- Seleção do clube ou preparação do atleta antes de abrir o lobby, com retorno à configuração e recuperação do rascunho.
- Central Social separada, convites com funções compatíveis e navegação adaptada ao celular.
- Migração aditiva 0011 para recuperar uma criação repetida. Instalador Windows 1.4.7.

## 0.9.0 — Ligas multiplayer (desenvolvimento)

- Conta online com sessões por dispositivo, recuperação por código e conversão de perfil convidado.
- Ligas com lobby persistente, convites por função, vagas reservadas, amizade e central da carreira compartilhada.
- Canais da liga e da comissão com histórico e decisão de propostas táticas.
- Negociação contratual após acordo de transferência entre técnicos em novas ligas.
- Escolha de temporada inicial, calendário, competições e dificuldade na criação de novas ligas.
- Convites pela lista de amigos, prévia de sugestões táticas e histórico social e esportivo do perfil.
- Permissões do auxiliar para propostas, renovações e contratos, com limites e revisão opcional pelo treinador.
- Comunicação, pesquisa de reforços e planejamento da próxima partida durante uma rodada.
- Saída da comissão mantendo acesso à liga e exclusão individual de ligas pelo anfitrião com confirmação.
- Criação de atletas com 12 nacionalidades sul-americanas, idade inicial de 16 a 35 anos e pé dominante incluindo ambidestro.
- Troca de posições entre titulares por arraste ou toque, antes do jogo e durante a partida, inclusive no intervalo.
- Removido o atalho redundante de entrada na própria tela do dia de jogo.
- Migrações aditivas 0009 e 0010 e ferramenta administrativa de reset com backup validado.

## 0.8.5 — Mercado de transferências

- Pesquisa paginada por atleta, clube e nacionalidade com filtros combináveis em todo o universo.
- Fichas e comparação com estimativas de observação identificadas e histórico registrado.
- Central de negociações com retomada de contrapropostas, decisões entre treinadores e montagem responsiva.
- Migração aditiva de índice. O instalador Windows passa para 1.4.5.

## 0.8.4 — Seleção de clubes e elencos de abertura

- Seleção responsiva das Séries A, B, C e D com setas, busca por clube, campo, banco e elenco.
- Os 156 clubes das Séries A–D usam 3.442 atletas das súmulas de abertura de 2026. Cada clube indica sua fonte, e as notas e posições estimadas são identificadas na prévia.
- Clubes com dados pendentes recebem aviso e vagas de simulação identificadas. A identidade provisória é sinalizada enquanto a autorização dos escudos estiver pendente.
- Novas carreiras e novos universos fixam a edição do catálogo. Saves anteriores conservam seus elencos, contratos e escalações.
- O instalador Windows fica preparado para a versão 1.4.4.

## 0.8.3 — Apresentação pré-jogo

- Na carreira individual, a abertura mostra o confronto, as duas escalações com capitães e banco, e o apito inicial. A partida começa automaticamente e a apresentação pode ser pulada pelo botão ou com Esc.
- O multiplayer usa o mesmo painel de escalação na abertura sincronizada.
- O instalador Windows passa para 1.4.3.

## 0.8.2 — Táticas, intervalo e mandos

- A tela de Táticas mostra o overall dos 11 titulares ao lado da posição no campo, na carreira individual e no multiplayer. O número acompanha o jogador nas trocas.
- A escalação do intervalo tem um campo menor e coloca o banco ao lado em janelas largas.
- Nos novos calendários do Brasileirão com 38 rodadas, cada clube alterna entre casa e fora em 35 das 37 transições. A sequência fica limitada a dois jogos com o mesmo mando.
- Finanças abre em temporadas avançadas e em saves antigos com resumos mensais sem categorias.
- O instalador Windows passa para 1.4.2.

## 0.8.1 — Mensagens, calendário e escalação

- Abrir a caixa de mensagens marca a primeira mensagem como lida uma única vez. A caixa e a página de notícias oferecem nova tentativa se a consulta falhar.
- Novas temporadas intercalam os mandos de campo. As temporadas já salvas preservam o calendário original até a virada.
- As táticas separam titulares, banco de suplentes e reservas fora da convocação. Uma alteração independente na carreira pode ser conciliada ao salvar a tática, e conflitos com outra edição tática preservam o rascunho.
- O painel tático da partida tem rolagem própria. No intervalo, a escalação abre para ajustes antes de confirmar o segundo tempo.
- O instalador Windows passa para 1.4.1.

## 0.8.0 — Ultimate Football Experience (desenvolvimento)

- Rodada cooperativa com presença obrigatória, carregamento coletivo, intervalo compartilhado e gravação transacional.
- Transmissão com placares simultâneos, escalações animadas, campo 2D ligado ao servidor e alterações táticas oficiais.
- Cápsula pré-partida da sala com atividades e prontidão dos participantes. Avisos comuns permanecem no sistema de toasts.
- Migração incremental de sessões. O instalador Windows passa a 1.4.0 no próximo lançamento estável.
- A carreira individual e a compartilhada usam a mesma navegação, o campo de escalação, o planejador de treinos e o comparador de patrocínios. O lobby fica acessível dentro da carreira.
- Gol anulado entra na súmula, na transmissão e no replay sem alterar o placar ou os gols do atleta.
- Leituras repetidas são agrupadas. Limites por perfil, espera informada pelo servidor e recuperação mantêm a carreira disponível em falhas transitórias.
- A candidata do Master Update inclui o editor cosmético planejado para a Dev 0.9, com visualização em pixel art. A publicação depende da homologação.

## 0.7.1 — Menu principal

- A prévia das opções mantém o menu e o rodapé na mesma posição durante a navegação.

## 0.7.0 — Connected World (desenvolvimento)

- Universos privados persistentes com papéis, convites, rodada oficial, classificação, decisões e negociação entre clubes.
- Comandos versionados com confirmação durável, reprodução local de partidas e recuperação por revisão.
- Abertura original com sequência de estádio, bola, trajetória e revelação.
- Central Windows com verificação periódica, download configurável e aplicação pelo Electron.

## 0.6.1 — 2026-11-19 · Carreira de Jogador e estabilidade

- Central com comparação por posição, notas por adversário, atributos por grupo e evolução por temporada.
- Confirmação de troca de clube, comparação salarial e contraproposta sem alterar os termos antigos.
- Histórico detalhado carregado ao abrir a tela, com consultas limitadas aos dados estatísticos.
- Inclui as correções da Dev 0.5.1.

## 0.6.0 — 2026-11-19 · Carreira de Jogador

- Criação de jogador com dados pessoais, prévia em pixel art e uniforme configurável.
- Central dedicada, treinos individuais no calendário, concorrência por posição, convocação, objetivos e avaliação pelo motor de partidas.
- Evolução de atributos, condição física, lesões, entrevistas, empresário, contratos, transferências, empréstimos e patrocínio individual.
- Estatísticas, recordes pessoais e trajetória profissional em saves independentes da carreira de treinador.

## 0.5.1 — 2026-11-19 · Carreira de Treinador

- Campo interativo com banco expansível e painéis de instruções, domínio, auxiliar, pré-jogo e comercial.
- Valores exatos de patrocínio e teto salarial disponível na pré-temporada. Validação de renovações e missões.
- Táticas e treinos usam a versão do save em que foram editados. A interface informa conflitos entre abas.
- O universo completo carrega no explorador. As demais telas recebem o contexto do próximo jogo, e a simulação reaproveita a preparação da rodada.

## 0.5.0 — 2026-11-18 · Manager Update

### Novo
- **Futebol brasileiro vivo** (`careers.data.universe`): cada clube da IA tem filosofia, projeto (título, crescimento, estabilidade, reconstrução, crise), diretoria, técnico fictício com reputação e histórico, formação e domínio dela. Diretorias perdem a confiança com maus resultados (pelo perfil) e demitem; técnicos livres são contratados conforme o porte; entre temporadas, clubes grandes buscam técnicos em alta, rebaixados se reconstroem e promovidos crescem. Em 10 temporadas simuladas: ~19 demissões e ~12 trocas de comando por temporada, sem nenhuma inconsistência.
- **Notícias** geradas pelos fatos: demissões, contratações, sequências, lideranças, títulos, recordes e mudanças de projeto; as relevantes chegam à caixa de mensagens (no máximo duas por passo).
- **Gabinete do treinador**: reuniões com a diretoria (orçamento, advertência com ultimato, avaliação do meio da temporada, renovação) e coletivas de imprensa em momentos relevantes, com efeitos proporcionais em torcida, diretoria e reputação; contrato, reputação, marcos, decisões e linha do tempo da carreira; propostas de emprego vindas de clubes com vaga ou insatisfeitos, com salário e duração.
- **Comissão técnica**: auxiliar, preparador físico, treinador de goleiros, analista, fisioterapeuta, coordenador da base e chefe de observação, com competência, salário, contrato, rescisão e efeito medido; recomendações contextuais.
- **Treinos**: preparação específica para o próximo adversário (vale um jogo, teto de +6 de execução) e planejamento delegado ao auxiliar.
- **Base e olheiros**: plano de desenvolvimento por jovem, estagnação após os 19 anos, missões com prazo, precisão dos relatórios e comparação de prospectos.
- **Legado**: comparação interativa entre temporadas, revelados pela base e recordes do universo.

### Medições
- Passo de domingo: ~1,9–2,0 s (0.4: ~1,9 s); primeiro passo de saves antigos: ~2,5 s (cria o universo).
- Navegação interna: 42–104 ms; memória da página: ~108 MB (0.4: ~96 MB).

## 0.4.1 — 2026-11-18 · Stability Update

### Novo
- App para Windows (Electron, pasta `desktop/`): janela sempre centralizada no monitor do cursor, tamanho lembrado, tela cheia por F11/Alt+Enter ou botão, barra de título integrada, tela própria sem conexão, atualização automática do aplicativo; instalador gerado e publicado pelo GitHub Actions; botão de download no menu, na Central de Atualizações e nas Configurações (só aparece quando o instalador existe).

### Corrigido / auditado
- Grupos A11–A16 da Série D 2026 conferidos clube a clube com a lista do sorteio da CBF (TNH1, 06/03/2026).
- 5-3-2: diagnóstico com 400 jogos por configuração. Com posse de bola rende 1,07 ponto por jogo contra o 4-3-3 (o 4-4-2 rende 1,10); com mentalidade defensiva e contra-ataque, 1,27. Cinco ajustes no motor foram testados e descartados (pioravam ou ficavam dentro do ruído); o auxiliar agora recomenda o uso medido.
- Dez temporadas seguidas conferidas: acessos, quedas e tamanhos das divisões fecham todo ano.

## 0.4.0 — 2026-11-18 · Evolution Update

### Novo
- Copa do Brasil 2026 com os 126 participantes reais, nove fases, jogo único (fases 1–4), ida e volta (5ª à semifinal), final única em campo neutro, pênaltis, premiação e chaveamento interativo.
- Série D 2026 real (96 clubes, 16 grupos, mata-mata, playoffs de acesso) e Série C por edição: 20 (2026), 24 (2027) e 28 em dois grupos (2028+), com contas de acesso/rebaixamento conferidas até 2040.
- Mercado de transferências: compra, venda, empréstimo, jogadores livres, renovação, rescisão, propostas recebidas, lista de venda, observados; clube e atleta respondem separadamente; IA compra por carência de elenco e orçamento.
- Contratos persistentes, valor de mercado, salários por nível, evolução e aposentadoria dos atletas, jovens que repõem elencos da IA.
- Finanças: caixa, TV/comercial, patrocínio, bilheteria, premiações, salários, estrutura, base e olheiros; orçamento e teto salarial da diretoria; extrato idempotente.
- Diretoria com 6 personalidades, objetivos, confiança e demissão; propostas de emprego; patrocínios fictícios com bônus e exigências; obras com custo e prazo; torcida e público.
- Categorias de base (turmas limitadas, evolução semanal, promoção) e olheiros com relatórios imprecisos por região e posição.
- Carreira de jogador com contrato, empresário, propostas, objetivos, prêmios e evolução por minutos.
- História: campeões de todas as competições, artilharia, transferências marcantes e sala de troféus.
- Redesign: navegação lateral, painel, mercado, finanças, clube, base, Copa, história, elenco (campo/cartões/lista), competições, comportamento tático desenhado no campo, entrada em campo cinematográfica, menu em deck.
- Ultra Motion X: material com luz e inclinação, atração magnética, números animados, entrada sob demanda; qualidade Automático/Completo/Leve.
- PWA instalável e Central de Atualizações (verificar, ver novidades, atualizar com proteção de alterações não salvas, confirmação da versão carregada, aviso entre abas, "O que há de novo").

### Pendente
- Elencos reais e técnicos (sem fonte verificável); 2ª fase da Série C 2028 sem regulamento publicado (projeção).
- Esquemas 5-3-2 ainda abaixo da média em confronto neutro.

## 0.3.1 — 2026-11-18 · Refinamento do motor

### Corrigido
- Excesso de gols entre IAs (Série A 3,66 → 2,7 por jogo): calibração pela população real de clubes e técnicos da IA, nível relativo da partida, goleiros, mentalidade ofensiva, pressão e jogo vertical.
- Motor 22% mais rápido sem mudar nenhum resultado (impressão digital idêntica).
- Formações: alas como pontas com três zagueiros, meia que chega à área sem pontas (4-2-2-2: 0,75 → 1,03 ponto por jogo contra o 4-3-3).
- Implantação: a pasta de dados era ignorada pelo Git, o que quebrava o CI e a VPS; a VPS agora baixa a imagem pronta e avisa falhas.

## 0.3.0 — 2026-11-18 · Inteligência tática avançada

### Corrigido da Dev 0.2
- Impedimentos excessivos (6,8 → ~2,9 por jogo) corrigidos na lógica de desmarcação, leitura da linha e leitura do passe.
- Faltas, cartões, gols, escanteios e mando recalibrados com referências do Brasileirão (`docs/MOTOR.md`).
- Estilos rebalanceados (amplitude de 1,13–1,84 para ~1,27–1,61 ponto por jogo no confronto cruzado).
- Formações além do 4-3-3 corrigidas (meias abertos, alas, zagueiros centrais, dupla de ataque).
- Modo Pixel completo; estatísticas acumuladas do jogador; base 2026 com cidades, UF e estádios conferidos.
- Notas individuais recalibradas; uniformes parecidos não se confundem mais.

### Novo (Dev 0.3)
- Carreira com os 60 clubes reais (Séries A, B e C), calendário, 2ª fase da Série C, acesso, rebaixamento e temporadas seguintes; a liga fictícia continua para saves antigos.
- Tática simples (formação, mentalidade, estilo) ou avançada (18 instruções em 3 seções), preservando ajustes ao trocar o preset.
- 20 funções individuais com compatibilidade, recomendação explicada e domínio próprio.
- Domínio tático progressivo e persistente (formação, estilo, instruções, entrosamento, funções).
- Centro de treinamento semanal (11 treinos, intensidade, carga física, recuperação e previsão).
- Auxiliar técnico com recomendações baseadas em dados (aplicar ou ignorar).
- Técnicos da IA com 7 perfis, plano contra o usuário por observação e ajustes durante o jogo.
- Instruções avançadas também durante a partida (decisões reproduzíveis pelo servidor).
- Migração `0003` (temporada e competição nos resultados, com script de reversão).

### Pendente
- Elencos reais, técnicos com data de referência, nomes oficiais e cores de 23 clubes.
- Regras de acesso/rebaixamento das Séries A e B a confirmar em fonte oficial; Série D não simulada.
- Copa do Brasil e mercado de transferências.
- Esquemas com três zagueiros e dupla de ataque ainda um pouco abaixo do 4-3-3 no motor.

## 0.2.0 — 2026-11-17 · Motor de futebol e partidas em 2D

### Funcionando
- **BRASFC Football Engine** (`src/lib/engine`): simulação por ticks de 1 s em campo 105×68 m, determinística por semente; passes, lançamentos, passes em profundidade, condução, dribles, desarmes, faltas, cartões, pênaltis, escanteios, laterais, tiros de meta, impedimento, lesões, cansaço, substituições e acréscimos.
- 27 atributos em 4 grupos; overall ponderado por posição; perfis (arquétipos) por posição.
- Táticas com efeito real: 7 formações (incl. 4-2-2-2 e 3-4-3), 3 mentalidades e 7 estilos. Calibração com 160+ partidas por cenário: nenhuma opção vence todas.
- Estatísticas e notas derivadas exclusivamente dos eventos da partida.
- Central da partida com modos Clássico, Pixel (prévia) e Narração; velocidades 1×–8×; pular para o resultado; linha do tempo; assistente técnico.
- Laboratório (partida rápida) com os 60 clubes das Séries A, B e C 2026.
- Carreira: partida da rodada com a tática salva; reprodução autoritativa no servidor (semente + decisões); demais jogos simulados; resultados gravados (migração `0002`); classificação a partir dos resultados.
- Correção do salvamento de táticas (comparação independente da ordem das chaves do `jsonb`).

### Pendente / parcial
- Base 2026: participantes conferidos em fontes; cidades de conhecimento público; estádios, técnicos e elencos **pendentes**. Elencos usam vagas genéricas sem nomes de pessoas.
- Modo Pixel é uma prévia de baixa resolução (sem animação de corrida).
- A carreira ainda usa a liga fictícia da Dev 0.1; os clubes reais estão no Laboratório.

## 0.1.0 — 2026-11-17 · Fundação do BRASFC

### Funcionando
- Abertura com carregamento real (motor de animação, fontes, sessão, código do menu) e opção de pular.
- Menu principal cinematográfico (teclado e mouse), estádio original em camadas e personagens em pixel art.
- Criação de carreira de Treinador ou Jogador: posição escolhida no campo, aparência em pixel art, escolha de clube e apresentação cinematográfica.
- Central da carreira: painel, elenco, central tática (formações, arrastar e soltar, mentalidade, estilo, relatório do auxiliar), treinos, calendário, competições e mensagens.
- Persistência em PostgreSQL com migrações; perfil de convidado por cookie seguro.
- Multiplayer beta: salas privadas por código com presença e "pronto" em tempo real (WebSocket, servidor autoritativo).
- Dynamic Island, transições de página e microinterações com a Ultra Motion X; respeito a movimento reduzido.
- Detecção de nova versão sem interromper alterações não salvas; endpoint `/api/health`.
- Docker, Caddy (HTTPS), GitHub Actions (CI + deploy), backups e restauração.

### Demonstrativo
- Clubes, elencos, notícias e classificação são fictícios. Nenhuma partida é simulada ainda.
