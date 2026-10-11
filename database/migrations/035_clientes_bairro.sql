-- O bairro preferido agiliza o novo pedido presencial de delivery. Ele e
-- gravado como texto para preservar o historico mesmo se a taxa/bairro for
-- desativado ou renomeado depois.
alter table clientes add column if not exists bairro text;

create index if not exists idx_clientes_estabelecimento_nome
  on clientes (estabelecimento_id, nome);
