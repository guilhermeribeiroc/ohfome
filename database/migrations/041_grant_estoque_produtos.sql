begin;

-- A migration 033 criou estoque_produtos, estoque_compromissos_produtos e
-- movimentacoes_estoque_produtos, mas nunca concedeu privilégios nelas para
-- ohfome_app — só concedeu EXECUTE nas funções. Como a leitura em
-- /api/estoque/produtos faz SELECT direto nas tabelas (não via função
-- SECURITY DEFINER), toda consulta falhava com "permission denied for table
-- estoque_produtos", e a tela de "Produtos por unidade" sempre mostrava
-- "Nenhum produto cadastrado" mesmo com produtos existentes.
grant select, insert, update, delete on
  estoque_produtos, estoque_compromissos_produtos, movimentacoes_estoque_produtos
to ohfome_app;

commit;
