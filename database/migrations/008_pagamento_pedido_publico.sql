-- Forma de pagamento informada pelo cliente no cardápio digital.
alter table pedidos
  add column if not exists forma_pagamento text check (forma_pagamento is null or forma_pagamento in ('cartao', 'dinheiro', 'pix')),
  add column if not exists tipo_cartao text check (tipo_cartao is null or tipo_cartao in ('credito', 'debito')),
  add column if not exists troco_para numeric(10, 2) check (troco_para is null or troco_para > 0),
  add column if not exists pagamento_status text not null default 'pendente' check (pagamento_status in ('pendente', 'pago', 'falhou', 'estornado'));

drop function if exists fn_criar_pedido_publico(text, text, text, text, text, text, jsonb);

create function fn_criar_pedido_publico(
  p_slug text,
  p_cliente_nome text,
  p_telefone text,
  p_forma_recebimento text,
  p_endereco text,
  p_observacoes text,
  p_forma_pagamento text,
  p_tipo_cartao text,
  p_troco_para numeric,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estabelecimento_id uuid;
  v_cliente_id uuid;
  v_pedido_id uuid;
  v_codigo int;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade int;
  v_preco numeric(10,2);
  v_endereco text := nullif(btrim(coalesce(p_endereco, '')), '');
  v_observacoes text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_troco_para numeric(10,2) := case when p_troco_para > 0 then p_troco_para else null end;
begin
  select id into v_estabelecimento_id from estabelecimentos where slug = p_slug and ativo;
  if v_estabelecimento_id is null then
    raise exception 'Estabelecimento não encontrado' using errcode = 'P0002';
  end if;

  if p_forma_recebimento not in ('entrega', 'retirada') then
    raise exception 'Forma de recebimento inválida' using errcode = '22023';
  end if;
  if p_forma_pagamento not in ('cartao', 'dinheiro') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  if p_forma_pagamento = 'cartao' and p_tipo_cartao not in ('credito', 'debito') then
    raise exception 'Informe crédito ou débito' using errcode = '22023';
  end if;
  if p_forma_pagamento = 'cartao' then
    v_troco_para := null;
  end if;
  if p_forma_recebimento = 'entrega' and length(coalesce(v_endereco, '')) < 10 then
    raise exception 'Informe o endereço completo para entrega' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens' using errcode = '22023';
  end if;

  insert into clientes (estabelecimento_id, nome, telefone, endereco)
  values (v_estabelecimento_id, p_cliente_nome, p_telefone, case when p_forma_recebimento = 'entrega' then v_endereco else null end)
  on conflict (estabelecimento_id, telefone) do update
    set nome = excluded.nome,
        endereco = coalesce(excluded.endereco, clientes.endereco)
  returning id into v_cliente_id;

  insert into pedidos (
    estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em,
    cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para
  )
  values (
    v_estabelecimento_id,
    case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end,
    'app', 'novo', true, now(), v_cliente_id, v_observacoes, p_forma_recebimento,
    p_forma_pagamento, case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end, v_troco_para
  )
  returning id, codigo into v_pedido_id, v_codigo;

  for v_item in select jsonb_array_elements(p_itens) loop
    v_produto_id := (v_item->>'produtoId')::uuid;
    v_quantidade := (v_item->>'quantidade')::int;
    if v_quantidade is null or v_quantidade <= 0 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    select preco_venda into v_preco from produtos
      where id = v_produto_id and estabelecimento_id = v_estabelecimento_id and ativo;
    if v_preco is null then
      raise exception 'Produto inválido' using errcode = '22023';
    end if;
    insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
      values (v_pedido_id, v_produto_id, v_quantidade, v_preco);
  end loop;

  if p_forma_recebimento = 'entrega' then
    insert into entregas (pedido_id, endereco) values (v_pedido_id, v_endereco);
  end if;

  return jsonb_build_object('id', v_pedido_id, 'codigo', v_codigo);
end;
$$;

revoke all on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb) from public;
grant execute on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb) to ohfome_app;
