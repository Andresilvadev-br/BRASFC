# Novidades

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
