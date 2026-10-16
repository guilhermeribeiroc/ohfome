begin;

-- Nome do cliente opcional em pedidos de balcão/mesa, sem precisar cadastrar
-- o cliente. Aparece na comanda e nos cards do pedido.
alter table pedidos add column if not exists cliente_nome_avulso text;

commit;
