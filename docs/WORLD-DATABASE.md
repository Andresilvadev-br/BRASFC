# BRASFC World Database 2026/27

## Instalação local

Extraia o SQLite do pacote de dados em `%APPDATA%\BRASFC\saves\world-catalogs\`, mantendo o nome com 24 caracteres hexadecimais. No próximo save brasileiro criado pelo assistente de ligas, o jogo registra o identificador do catálogo local mais recente. Mantenha versões anteriores na mesma pasta para que os saves que usam essas versões continuem a consultá-las. As contratações já concluídas são gravadas no save.

Em **Mercado**, selecione **Banco mundial** e procure pelo nome de um atleta ou selecione um clube nos filtros. O arquivo é consultado por clube e pesquisa. A base brasileira nativa permanece como referência para as Séries A a D e para o mercado nacional. O executável usa o banco local da carreira e abre o catálogo mundial em modo de leitura.

## Conversão de dados

Use Python 3.11 ou posterior. A primeira pasta deve conter uma base Brasfoot Next com manifesto de formato 1. Passe os patches em ordem de precedência. O conversor preserva as camadas, aplica remoções do manifesto e grava um SQLite separado, validado antes da substituição do arquivo de saída.

```sh
python3 scripts/import-world-db.py /caminho/database \
  --revision 13fc36281bef66c1b03f3497871ef2e0a953f935 \
  --output world.sqlite --report relatorio.json
```

Para instalar um catálogo gerado, renomeie `world.sqlite` para o valor `catalog_id` do relatório seguido de `.sqlite`. Para sobrepor patches locais, use `--patch /caminho/patch` para cada camada. Um pacote legado com `.ban`, `.cfg` e `.ces` pode ser convertido previamente para o formato aberto com a ferramenta do Brasfoot Next descrita abaixo. Confira a licença de cada camada antes de redistribuir o resultado.

## Importação verificada

| Dados | Quantidade |
| --- | ---: |
| Clubes, em 132 países | 1.236 |
| Jogadores, dos quais 698 de base | 34.889 |
| Seleções identificadas pelo código | 224 |
| Definições de divisões nacionais e estaduais | 45 + 108 |
| Rivalidades sem duplicação de sentido | 17 |
| Referências de escudos, uniformes e troféus | 1.122, 2.805 e 292 |

O catálogo registra 892 estádios com o nome genérico «Estádio Municipal». Foram descartadas três linhas de atletas com identidade incompleta e três duplicatas no mesmo elenco. Há 542 chaves de possíveis homônimos entre clubes. Sem identificadores oficiais, os registros continuam separados. O overall e o potencial são estimativas reproduzíveis a partir dos dados da fonte. O jogo usa os atributos próprios e aplica os pontos fortes descritos pela fonte. As idades e vínculos refletem a edição importada.

As configurações de liga da fonte descrevem regulamentos e não contêm listas confiáveis de inscritos por divisão. O conversor aceita `--memberships` com as colunas `competition,club` e valida ambos os vínculos. Na edição processada, as 153 definições ficaram com zero inscrições confirmadas. Os estaduais e torneios continentais internacionais ainda não entram no calendário jogável. As imagens permanecem como referências, e a base de seleções fornece códigos e referências visuais.

## Fontes e licenças

- Dados do Brasfoot Next, versão de outubro de 2026, revisão [13fc362](https://github.com/Brasfoot-Next/database/tree/13fc36281bef66c1b03f3497871ef2e0a953f935). O catálogo derivado mantém CC BY-SA 4.0 e seus créditos. A fonte ressalva que escudos, uniformes e marcas pertencem aos respectivos titulares. [Banco e termos](https://github.com/Brasfoot-Next/database).
- A documentação de pacotes foi usada como referência de formato. A ferramenta externa `brasfoot-data convert` pode preparar uma instalação legada para uso local. O código do conversor BRASFC foi implementado separadamente. [Especificação do Brasfoot Next](https://github.com/Brasfoot-Next/brasfoot-next/blob/bd2ccbdd5f1aaacb6437b58b198d7963c61b3780/docs/patches.md).
- A publicação do Megapatch 3.0 anuncia uma distribuição com executável e dados de novembro. A licença de redistribuição não pôde ser confirmada. O pacote entregue contém os dados CC BY-SA da primeira fonte. [Atualiza Brasfoot](https://atualizabrasfoot.blogspot.com/2026/11/).

## Verificação

O catálogo converteu o conjunto completo em cerca de 2,2 segundos nesta máquina. Foram executadas as verificações de integridade e referências do SQLite. O relatório JSON acompanha o pacote e lista a origem, as contagens e os problemas da importação.
