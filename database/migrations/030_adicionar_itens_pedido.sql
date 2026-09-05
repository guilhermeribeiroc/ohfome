-- Permite ao cliente do Cardapio Digital adicionar itens a um pedido que ja
-- foi enviado, enquanto ainda houver tempo util (antes de sair para entrega,
-- ou antes de ficar pronto para retirada). Cada adicional vira um pedido novo
-- e independente, vinculado ao pedido original via pedido_pai_id — o mesmo
-- padrao ja usado nas "rodadas" do Garcom/Mesa, o que faz a impressao/entrada
-- na cozinha trazer automaticamente so os itens adicionados, sem reimprimir
-- a comanda inteira.

alter table pedidos add column if not exists pedido_pai_id uuid references pedidos(id) on delete set null;
create index if not exists idx_pedidos_pedido_pai_id on pedidos(pedido_pai_id) where pedido_pai_id is not null;

create or replace function fn_adicionar_itens_pedido_publico(
  p_slug text,
  p_pedido_id uuid,
  p_itens jsonb,
  p_observacoes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estabelecimento_id uuid;
  v_status text;
  v_forma_recebimento text;
  v_forma_pagamento text;
  v_tipo pedido_tipo;
  v_cliente_id uuid;
  v_endereco text;
  v_bairro text;
  v_novo_pedido_id uuid;
  v_codigo int;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade int;
  v_preco numeric(10,2);
  v_item_observacoes text;
  v_observacoes text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_total numeric(10,2);
begin
  select p.estabelecimento_id, p.status::text, p.forma_recebimento, p.forma_pagamento, p.tipo, p.cliente_id
    into v_estabelecimento_id, v_status, v_forma_recebimento, v_forma_pagamento, v_tipo, v_cliente_id
  from pedidos p
  join estabelecimentos e on e.id = p.estabelecimento_id
  where e.slug = p_slug and p.id = p_pedido_id and p.origem = 'app';

  if v_estabelecimento_id is null then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_status in ('finalizado', 'cancelado')
     or (v_forma_recebimento = 'entrega' and v_status = 'saiu_para_entrega')
     or (v_forma_recebimento = 'retirada' and v_status = 'pronto') then
    raise exception 'Não é mais possível adicionar itens a este pedido' using errcode = '22023';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum item informado' using errcode = '22023';
  end if;

  if v_forma_recebimento = 'entrega' then
    select endereco, bairro into v_endereco, v_bairro from entregas where pedido_id = p_pedido_id;
  end if;

  insert into pedidos (
    estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em,
    cliente_id, observacoes, forma_recebimento, forma_pagamento, pagamento_status, pedido_pai_id
  )
  values (
    v_estabelecimento_id, v_tipo, 'app', 'novo', true, now(),
    v_cliente_id, v_observacoes, v_forma_recebimento, v_forma_pagamento, 'pendente', p_pedido_id
  )
  returning id, codigo into v_novo_pedido_id, v_codigo;

  for v_item in select jsonb_array_elements(p_itens) loop
    v_produto_id := (v_item->>'produtoId')::uuid;
    v_quantidade := (v_item->>'quantidade')::int;
    v_item_observacoes := nullif(btrim(coalesce(v_item->>'observacoes', '')), '');
    if v_quantidade is null or v_quantidade <= 0 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    if length(coalesce(v_item_observacoes, '')) > 1000 then
      raise exception 'A observação do item pode ter até 1.000 caracteres' using errcode = '22023';
    end if;
    select preco_venda into v_preco
    from produtos
    where id = v_produto_id and estabelecimento_id = v_estabelecimento_id and ativo;
    if v_preco is null then
      raise exception 'Produto inválido' using errcode = '22023';
    end if;
    insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, observacoes)
    values (v_novo_pedido_id, v_produto_id, v_quantidade, v_preco, v_item_observacoes);
  end loop;

  if v_forma_recebimento = 'entrega' then
    insert into entregas (pedido_id, endereco, bairro) values (v_novo_pedido_id, v_endereco, v_bairro);
  end if;

  select total into v_total from pedidos where id = v_novo_pedido_id;

  return jsonb_build_object(
    'id', v_novo_pedido_id,
    'codigo', v_codigo,
    'pedidoPaiId', p_pedido_id,
    'total', v_total
  );
end;
$$;

revoke all on function fn_adicionar_itens_pedido_publico(text, uuid, jsonb, text) from public;
grant execute on function fn_adicionar_itens_pedido_publico(text, uuid, jsonb, text) to ohfome_app;

-- fn_pedido_publico_status: passa a trazer os adicionais vinculados (cada um
-- com seu proprio status/itens) e restaura estabelecimentoIdInterno/
-- pixOrderIdInterno, que a migration 023 removeu por engano ao adicionar
-- suporte a tamanho — sem eles a rota de acompanhamento nunca conseguia
-- disparar a consulta de contingencia do Pix (ver comentario em
-- web/src/app/api/publico/[slug]/pedidos/[id]/route.ts).
create or replace function fn_pedido_publico_status(p_slug text, p_pedido_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'status', p.status,
    'formaRecebimento', p.forma_recebimento,
    'formaPagamento', p.forma_pagamento,
    'pagamentoStatus', p.pagamento_status,
    'pixExpiraEm', px.expira_em,
    'estabelecimentoIdInterno', p.estabelecimento_id,
    'pixOrderIdInterno', px.order_id,
    'createdAt', p.created_at,
    'notificadoEm', p.notificado_em,
    'notificadoMensagem', p.notificado_mensagem,
    'estabelecimentoNome', e.nome,
    'itens', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'produtoNome', pr.nome || case when ip.tamanho is not null then ' (' || ip.tamanho::text || ')' else '' end,
         'produtoTamanho', ip.tamanho,
         'quantidade', ip.quantidade
       ) order by ip.created_at)
       from itens_pedido ip join produtos pr on pr.id = ip.produto_id
       where ip.pedido_id = p.id),
      '[]'::jsonb
    ),
    'historico', coalesce(
      (select jsonb_agg(jsonb_build_object('status', h.status_novo, 'em', h.created_at) order by h.created_at)
       from historico_status_pedido h where h.pedido_id = p.id),
      '[]'::jsonb
    ),
    'adicionais', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'id', ad.id,
          'codigo', ad.codigo,
          'status', ad.status,
          'createdAt', ad.created_at,
          'itens', coalesce(
            (select jsonb_agg(jsonb_build_object(
               'produtoNome', pr2.nome || case when ip2.tamanho is not null then ' (' || ip2.tamanho::text || ')' else '' end,
               'quantidade', ip2.quantidade
             ) order by ip2.created_at)
             from itens_pedido ip2 join produtos pr2 on pr2.id = ip2.produto_id
             where ip2.pedido_id = ad.id),
            '[]'::jsonb
          )
        ) order by ad.created_at)
       from pedidos ad where ad.pedido_pai_id = p.id),
      '[]'::jsonb
    )
  )
  from pedidos p
  join estabelecimentos e on e.id = p.estabelecimento_id
  left join pagamentos_pix px on px.pedido_id = p.id
  where e.slug = p_slug and p.id = p_pedido_id and p.origem = 'app';
$$;
