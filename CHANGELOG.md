# Novidades

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
