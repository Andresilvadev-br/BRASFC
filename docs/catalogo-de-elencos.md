# Catálogo brasileiro de elencos

A edição `brasil-2026-abertura-v2`, conferida em 21 de novembro de 2026, usa as 78 súmulas da rodada de estreia de cada divisão. Ela cobre os 156 clubes do Brasileirão 2026 e registra 3.442 atletas únicos. Cada clube tem a data da partida, a competição, o link da súmula, os titulares, os suplentes e o técnico quando consta no documento. A edição `brasil-2026-abertura-v1` continua disponível para saves que a usam, com o recorte de Palmeiras e Atlético-MG.

| Divisão | Clubes | Atletas no catálogo | Recorte |
| --- | ---: | ---: | --- |
| A | 20 | 449 | 28–29 de janeiro |
| B | 20 | 451 | 21–22 de março |
| C | 20 | 444 | 4–6 de abril |
| D | 96 | 2.098 | 4–22 de abril |

- O registro usa a inscrição CBF como chave do atleta. A chave interna também inclui o clube de origem para preservar a busca de atletas transferidos. O arquivo registra competição, temporada, data de corte, fontes, vínculo, posição e papel na partida.
- As súmulas identificam goleiros, titulares e suplentes. Nos clubes sem ficha tática complementar, o catálogo usa 4-3-3 e distribui os demais atletas no campo como estimativa do jogo. A tela identifica esse caso. Palmeiras e Atlético-MG conservam as posições documentadas na v1. No Flamengo, a revisão tática usa a cobertura da estreia e mantém a súmula como fonte da convocação.
- Oito inscrições aparecem em duas estreias de datas distintas. O catálogo conserva o vínculo mais recente em cada caso. Néris, relacionado no banco da estreia do Vitória, assume a vaga de Zé Marcos entre os titulares do jogo após a deduplicação para o Sport. A tela do Vitória indica o ajuste. Ferroviária, Brasiliense e Nova Iguaçu têm a função de técnico principal sem registro na respectiva súmula.
- Datas de nascimento e nacionalidades presentes vieram das fichas dos clubes. Campos sem confirmação ficam ausentes no catálogo e não são exibidos como fatos. A idade neutra interna de 25 anos para registros sem data serve apenas à simulação.
- O overall do BRASFC é calculado pelo motor a partir dos atributos. A referência inicial é `57 + 3 × reputação`, mais 3 para titulares e menos 2 para suplentes documentados. Os perfis de posição e a inscrição CBF dão variação determinística aos atributos. As notas são de balanceamento do jogo. Dados de contratos e folha sem fonte são simulados no save.
- O banco acompanha o tamanho da relação documentada, com até 12 suplentes. Atletas que ficaram fora das convocações e transferências posteriores ao recorte seguem pendentes de fontes. Os clubes da Liga BRASFC fictícia conservam os elencos da simulação.
- Novas carreiras e estados de universos gravam a versão em JSON. Carreiras e universos já gravados sem a chave continuam resolvendo seus IDs antigos. Mercado, contratos e táticas permanecem locais a cada save. Para publicar outra edição, registrar um novo ID e conservar o arquivo desta edição.

## Identidade visual

O manifesto `identidade.json` admite uma arte local em `static/escudos` somente com fonte e referência da autorização registradas. A edição usa símbolos provisórios identificados enquanto a autorização de distribuição estiver pendente. O registro público do escudo do Palmeiras no Commons distingue a classificação de copyright da situação de marca. As cores provisórias também são sinalizadas.

- [Escudo do Palmeiras no Commons e marca](https://commons.wikimedia.org/wiki/File:SE_Palmeiras_2025_crest.png)
- [Ficha oficial do Galo na estreia](https://atletico.com.br/galo-estreia-com-empate-na-arena-mrv/)
- [Perfis do Palmeiras](https://palmeiras.com.br/elenco/)

## Publicação

As versões de publicação são 0.8.4 no jogo e 1.4.4 no Windows. O workflow de deploy existente empacota a versão do site. O workflow App Windows empacota o offline, gera o instalador e produz os metadados de atualização. Valide o instalador e a versão do ambiente antes de considerar a distribuição concluída.

## Edição v3 para novas carreiras

A edição v3 conserva os 3.442 atletas, os vínculos, as súmulas e as três referências táticas disponíveis na v2. Quando a fonte só documenta a convocação, utiliza o perfil de treinador simulado e o encaixe dos jogadores do elenco nas posições dos esquemas preferidos. A seleção pode promover um suplente documentado se ele se encaixar melhor na escalação do jogo. As súmulas continuam registrando os titulares históricos e os jogadores conservam seus identificadores. Carreiras v1 e v2 mantêm a interpretação anterior da abertura.
