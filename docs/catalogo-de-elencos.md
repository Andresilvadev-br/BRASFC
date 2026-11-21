# Catálogo brasileiro de elencos

A edição `brasil-2026-abertura-v1` registra o recorte de 28 de janeiro de 2026. A [súmula CBF do jogo 6](https://conteudo.cbf.com.br/sumulas/2026/1426se.pdf) confirma 23 atletas por clube para Palmeiras e Atlético-MG, com 11 titulares, 12 suplentes e os respectivos técnicos. A ficha é um recorte de jogo. A presença de atletas fora da convocação ainda precisa ser documentada.

- O registro usa a inscrição CBF como chave do atleta. A chave interna também inclui o clube de origem para preservar a busca de atletas transferidos. O arquivo registra competição, temporada, data de corte, fontes, vínculo, posição e papel na partida.
- Posições e enquadramento no campo foram modelados a partir das fichas esportivas. Por exemplo, Alan Franco tem volante como posição principal e lateral-direito como posição complementar para representar a escalação de abertura.
- Datas de nascimento e nacionalidades presentes vieram das fichas dos clubes. Campos sem confirmação ficam ausentes no catálogo e não são exibidos como fatos. A idade neutra interna de 25 anos para registros sem data serve apenas à simulação.
- O overall do BRASFC é calculado pelo motor a partir dos atributos. A referência inicial é `57 + 3 × reputação`, mais 3 para titulares e menos 2 para suplentes documentados. Os perfis de posição e a inscrição CBF dão variação determinística aos atributos. As notas são de balanceamento do jogo. Dados de contratos e folha sem fonte são simulados no save.
- O banco de 12 reproduz a súmula na prévia. O limite de suplentes efetivamente inscritos no motor continua sujeito às regras de jogo do BRASFC.
- Os demais clubes da base A–D exibem a pendência. Vagas operacionais são identificadas por posição e número. Os clubes da Liga BRASFC fictícia conservam os elencos da simulação.
- Novas carreiras e estados de universos gravam a versão em JSON. Carreiras e universos já gravados sem a chave continuam resolvendo seus IDs antigos. Mercado, contratos e táticas permanecem locais a cada save. Para publicar outra edição, registrar um novo ID e conservar o arquivo desta edição.

## Identidade visual

O manifesto `identidade.json` admite uma arte local em `static/escudos` somente com fonte e referência da autorização registradas. A edição usa símbolos provisórios identificados enquanto a autorização de distribuição estiver pendente. O registro público do escudo do Palmeiras no Commons distingue a classificação de copyright da situação de marca. As cores provisórias também são sinalizadas.

- [Escudo do Palmeiras no Commons e marca](https://commons.wikimedia.org/wiki/File:SE_Palmeiras_2025_crest.png)
- [Ficha oficial do Galo na estreia](https://atletico.com.br/galo-estreia-com-empate-na-arena-mrv/)
- [Perfis do Palmeiras](https://palmeiras.com.br/elenco/)

## Publicação

As versões de publicação são 0.8.4 no jogo e 1.4.4 no Windows. O workflow de deploy existente empacota a versão do site. O workflow App Windows empacota o offline, gera o instalador e produz os metadados de atualização. Valide o instalador e a versão do ambiente antes de considerar a distribuição concluída.
