# BRASFC Website

Plataforma oficial de divulgação e comunidade, com servidor e banco próprios. Base do acervo BRASFC em `c51f0da`.

## Executar

Use Node.js 24 e npm. Execute a partir de `website/`.

```sh
npm ci
npm run build
npm start
```

Abra [http://127.0.0.1:4175](http://127.0.0.1:4175). Para testar sem consultar o GitHub a cada início, use `WEBSITE_RELEASE_LOOKUP=0 npm start`. O catálogo local conserva a data da consulta. Use `npm run releases:refresh` para atualizá-lo com a API pública do GitHub.

O servidor usa SQLite próprio em `website/data/community.sqlite` por padrão e cria um fórum vazio. Para configurar variáveis com arquivo local, copie `.env.example` para `.env`, faça o build e inicie com `node --env-file=.env dist/server.mjs`. O arquivo de exemplo deixa a autenticação desabilitada. Nenhuma credencial faz parte dos arquivos versionados.

## Verificar

```sh
npm test
npx playwright install chromium
npm run build
npm run test:browser
```

O ensaio de navegador usa banco em memória e a fotografia local do catálogo. É possível fornecer `WEBSITE_CHROMIUM_EXECUTABLE` e `WEBSITE_CHROMIUM_ARGS` se o ambiente oferecer outro runtime Chromium. As capturas são gravadas em `test-results/` por padrão.

## Publicação futura

- Servir `website/` como serviço Node independente em domínio ou subdomínio dedicado. O build fica em `website/dist/`. O runtime também precisa das dependências de produção de `website/package-lock.json`.
- Configurar TLS e `WEBSITE_ORIGIN` para a origem pública do website. A origem atualmente usada pelo aplicativo Electron é recusada na inicialização do site. Preservar DNS, rotas, cookies, WebSockets e proxy da aplicação do jogo.
- Montar um volume exclusivo para `WEBSITE_DATA`, com backup e restauração testados. SQLite usa WAL. Fazer backup consistente via mecanismo do SQLite ou com o serviço parado. O fluxo OAuth temporário reside na memória da instância Node. Iniciar com uma única instância.
- O serviço assume TLS na borda, limite de tamanho coerente com 2 MB de anexo e limites de tráfego no proxy dedicado. Não confia em IP fornecido por cabeçalhos do navegador. Atrás de proxy, o limite de início de login usa o endereço da conexão e deve ser considerado na configuração da borda.
- Executar as verificações nesta origem dedicada antes de autorizar mudança de DNS. Validar download, mídia, banco vazio, política de privacidade e testes de navegador com a configuração real.
- A origem do jogo e os workflows existentes ficam fora do processo de publicação do website.

## Identidade BRASFC

O site aceita somente OIDC de um emissor HTTPS previamente configurado. O provedor deve conhecer a mesma conta usada no jogo e oferecer seus próprios métodos de login e recuperação. Para Google e senha, o provedor unificado precisa expor esses métodos e definir como uma conta existente prova a posse antes de vincular uma credencial nova.

A integração exige o fluxo Authorization Code, PKCE S256, resposta `id_token` assinada e callback exato `<WEBSITE_ORIGIN>/conta/retorno`. O ID token deve incluir `iss`, `sub`, `brasfc_profile_id` imutável, `preferred_username` canônico e, opcionalmente, `name`. A aplicação valida o estado, nonce, emissor, assinatura, cliente e callback, e vincula o par identificador oficial/subject. A sessão do site é própria, com cookie restrito ao host. A aplicação não guarda tokens externos, e-mails ou senhas. Mudanças no emissor de um banco populado exigem migração deliberada. Não configure o Google diretamente como emissor da aplicação, pois ele não emite o identificador oficial BRASFC.

`WEBSITE_TEAM_IDS` recebe IDs BRASFC dos moderadores separados por vírgula. O estado oficial, a fixação, a moderação e a concessão de distintivos são validados no servidor. O privilégio da equipe não vem de dados enviados pelos usuários. A gestão e recuperação das credenciais permanecem no provedor. Hoje a leitura funciona sem login e as ações de participação exigem configuração real.

## Arquivos e resultados

O [relatório](docs/ENTREGA.md) registra o isolamento, as fontes de mídia, os testes executados e as capturas.
