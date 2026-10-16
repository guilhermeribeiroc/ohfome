begin;

-- Índices identificados numa análise de performance de ponta a ponta do
-- sistema. Nenhum muda comportamento, só acelera leituras que já existem.

-- produto_insumos: o trigger trg_insumos_custo_propaga (fn_propagar_custo_insumo)
-- faz "where pi.insumo_id = new.id" a cada UPDATE de custo_unitario em insumos
-- — sem índice, isso é full scan da tabela inteira a cada reajuste de preço
-- de um insumo compartilhado por vários produtos (ex: "queijo").
create index idx_produto_insumos_insumo on produto_insumos(insumo_id);

-- entregas: /api/entregas faz "where ... or en.created_at > now() - interval
-- '12 hours' order by en.created_at desc" a cada poll do módulo de Delivery
-- (4s). idx_entregas_status já existe; este índice complementa o OR via
-- bitmap e cobre a ordenação.
create index idx_entregas_created_at on entregas(created_at desc);

-- pedidos: idx_pedidos_estabelecimento já cobre (estabelecimento_id, status),
-- mas /api/financeiro filtra "status = 'finalizado'" e ordena/agrega por
-- created_at num intervalo de datas — incluir created_at evita um sort
-- separado e estreita o range scan conforme o histórico de pedidos cresce.
create index idx_pedidos_estabelecimento_status_created on pedidos(estabelecimento_id, status, created_at);

-- Busca de clientes (/api/clientes): hoje usa LIKE '%termo%' sobre uma
-- expressão (nome normalizado sem acento/pontuação, e telefone só com
-- dígitos), que nenhum índice btree ajuda. pg_trgm permite índice GIN em
-- texto livre com LIKE de ponta a ponta — a expressão do índice precisa
-- bater exatamente com a da query em route.ts para o planner reconhecer.
create extension if not exists pg_trgm;

create index idx_clientes_nome_normalizado_trgm on clientes
  using gin ((regexp_replace(translate(lower(nome), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g')) gin_trgm_ops);

create index idx_clientes_telefone_normalizado_trgm on clientes
  using gin ((regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g')) gin_trgm_ops);

commit;
