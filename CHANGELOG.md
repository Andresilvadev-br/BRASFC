# Novidades

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
