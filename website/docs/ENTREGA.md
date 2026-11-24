# Entrega da plataforma oficial BRASFC

Base verificada em 24/11/2026, commit `c51f0da` da `main`. A mudança fica exclusivamente em `website/`, na branch `feature/brasfc-official-website`.

## Escopo entregue

| Área | Resultado |
| --- | --- |
| Divulgação | Landing cinematográfica, recursos dos dois modos de carreira, partidas e ligas, galeria com filtros e ampliação, changelog, roadmap, suporte, privacidade e termos. |
| Download | Catálogo consultado na API oficial. Entram apenas releases estáveis com executável oficial carregado. A versão 1.4.9 tinha 133.627.174 bytes e o URL do instalador respondeu HTTP 200 no fim do redirecionamento. O SHA-256 é o publicado pelo GitHub. O instalador não foi executado neste ensaio. |
| Apresentação | Estádio ilustrativo gerado para a landing. O logo vem do favicon oficial. A sequência de cerca de 12 s usa Ultra Motion X da mesma revisão do jogo, escudo e capturas autênticas. É opcional, silenciosa, pode ser pulada e oferece uma cena estática com movimento reduzido ou economia de dados. |
| Fórum | Categorias, tópicos, respostas e comentários, busca, filtros, paginação, fixação, votos, confirmação de bugs, reações, menções, favoritos, anexos de imagem, notificações, perfil, denúncias e moderação. O fórum começa vazio. |
| Distintivos | Seis distintivos concedidos por moderadores mediante justificativa. O distintivo de equipe exige identificação oficial na configuração do servidor. É possível colocar até dois em destaque. |
| Contas | Adaptador para um provedor unificado via OIDC, nome de exibição, privacidade de perfil e controle de sessões. Google, senha e recuperação dependem do provedor oficial. A conexão com contas reais fica pendente. |

## Mídia

- `painel`, `jogador`, `taticas`, `elenco` e `ligas` foram derivados de `docs/homologacao/depois-*.jpg` registradas no trabalho Master.
- `mercado` e `partida` vêm de `docs/capturas/` e aparecem como arquivo.
- Nenhum vídeo de gameplay foi identificado entre os arquivos versionados na base. A galeria indica isso e a apresentação usa imagens estáticas.
- O estádio é uma imagem ilustrativa, fora do acervo de gameplay.

## Verificação

- `npm run build` aprovado no Node 24.
- `npm test` cobre a seleção das releases, indisponibilidade do instalador, rotas do jogo ausentes do website, proteção das mutações, identidade vinculada, uploads, escape de texto, votos idempotentes, notificações, moderação, encerramento de sessão, perfil privado e persistência do SQLite após reinício. O teste usa identidades controladas em memória.
- Chromium conferiu dez rotas em sete larguras de 320 a 1920 px, carregamento das imagens, teclado na galeria, apresentação pulável, movimento reduzido, filtros do fórum e URL do download. Axe avaliou as quatro páginas principais.
- O isolamento foi conferido por rotas e pelo diff do Git. Os testes do website não executam Electron, multiplayer, saves ou atualizador do jogo.
- A hospedagem e os testes com a identidade BRASFC real dependem da configuração descrita no README.

## Capturas

- [Home desktop](screens/home-desktop.jpg)
- [Home mobile](screens/home-mobile.jpg)
- [Galeria](screens/galeria-desktop.jpg)
- [Página de download](screens/download-desktop.jpg)
- [Fórum](screens/forum-desktop.jpg)

## Arquivos

`src/` contém servidor, fórum SQLite, adaptador OIDC, catálogo de releases, conteúdo e páginas. `public/` contém estilos, interações e mídia do site. `scripts/` contém build e atualização do catálogo. `test/` contém testes funcionais e de navegador. `docs/` contém este relatório e as capturas. `package.json`, lockfile, `.env.example` e `.gitignore` pertencem somente ao website.
