# Novidades

## 0.8.0 — Ultimate Football Experience (desenvolvimento)

- Rodada cooperativa com presença obrigatória, carregamento coletivo, intervalo compartilhado e gravação transacional.
- Transmissão com placares simultâneos, escalações animadas, campo 2D ligado ao servidor e alterações táticas oficiais.
- Cápsula pré-partida da sala com atividades e prontidão dos participantes. Avisos comuns permanecem no sistema de toasts.
- Migração incremental de sessões. O instalador Windows passa a 1.4.0 no próximo lançamento estável.
- A carreira individual e a compartilhada usam a mesma navegação, o campo de escalação e o planejador de treinos. O lobby fica acessível dentro da carreira.
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
