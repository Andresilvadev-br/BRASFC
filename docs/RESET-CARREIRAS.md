# Reinicialização de carreiras e ligas

O procedimento é manual e externo à publicação. Use um banco exclusivo do BRASFC e uma janela de manutenção com os processos de escrita parados. Ele cobre o banco online. Os saves locais do Windows estão no PGlite do usuário.

O escopo aceita `careers` para carreiras individuais, `rooms` para ligas ou `both`. A data UTC seleciona registros criados **antes** do corte informado. Contas, sessões, perfis e amizades permanecem no banco. As tabelas dependentes são removidas por chaves estrangeiras com cascata.

1. Defina `DATABASE_URL`, informe escopo e data, e execute `node deploy/reset-careers.mjs inventory both DATA_UTC`. Revise as contagens e a presença de rodadas em andamento.
2. Em um host com Node e os utilitários PostgreSQL compatíveis com a versão do servidor, defina `BRASFC_RESET_RESTORE_URL` para uma instância isolada e vazia. Execute `node deploy/reset-careers.mjs backup both DATA_UTC CAMINHO.dump`. O procedimento cria o dump, restaura na instância isolada e compara o inventário e a contagem de contas. Preserve o dump e seu manifesto em local privado.
3. Teste a nova criação de carreira e a restauração nesse ambiente. Obtenha a aprovação operacional explícita para o corte, o escopo e o hash do inventário. Só então defina `BRASFC_RESET_OPERATOR` e execute `node deploy/reset-careers.mjs apply both DATA_UTC CAMINHO.dump HASH_APROVADO`.
4. Confirme a operação na tabela `career_reset_audit` e teste criação, acesso à conta e listagem de ligas. Uma mudança de escopo ou dados afetados exige novo inventário e nova aprovação.
