-- Cadastro rapido do cliente no cardapio publico (cpf + preferencia de
-- notificacao) e rastro de quando/o-que foi notificado num pedido.
alter table clientes add column if not exists cpf text;
alter table clientes add column if not exists notificar_pedido boolean not null default false;
alter table pedidos add column if not exists notificado_em timestamptz;
alter table pedidos add column if not exists notificado_mensagem text;

-- fn_criar_pedido_publico ganha 2 parametros novos (cpf, notificar) com
-- default, por isso precisa ser recriada: o Postgres identifica funcoes
-- pela lista de tipos dos parametros, entao so "or replace" nao basta.
drop function if exists fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb);

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
  p_itens jsonb,
  p_cpf text default null,
  p_notificar_pedido boolean default false
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
  v_cpf text := nullif(btrim(coalesce(p_cpf, '')), '');
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

  insert into clientes (estabelecimento_id, nome, telefone, endereco, cpf, notificar_pedido)
  values (v_estabelecimento_id, p_cliente_nome, p_telefone, case when p_forma_recebimento = 'entrega' then v_endereco else null end, v_cpf, p_notificar_pedido)
  on conflict (estabelecimento_id, telefone) do update
    set nome = excluded.nome,
        endereco = coalesce(excluded.endereco, clientes.endereco),
        cpf = coalesce(excluded.cpf, clientes.cpf),
        notificar_pedido = excluded.notificar_pedido
  returning id into v_cliente_id;

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para)
  values (v_estabelecimento_id, case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end, 'app', 'novo', true, now(), v_cliente_id, v_observacoes, p_forma_recebimento, p_forma_pagamento, case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end, v_troco_para)
  returning id, codigo into v_pedido_id, v_codigo;

  for v_item in select jsonb_array_elements(p_itens) loop
    v_produto_id := (v_item->>'produtoId')::uuid;
    v_quantidade := (v_item->>'quantidade')::int;

    if v_quantidade is null or v_quantidade <= 0 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;

    select preco_venda into v_preco
    from produtos
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

  return jsonb_build_object('id', v_pedido_id, 'codigo', v_codigo, 'notificar', p_notificar_pedido);
end;
$$;

revoke all on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean) from public;
grant execute on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean) to ohfome_app;

-- Consulta publica de status: usada pela aba de acompanhamento do cliente.
-- So enxerga pedidos com origem='app' (feitos pelo cardapio) do slug pedido,
-- e o proprio uuid do pedido (imprevisivel) funciona como o "token" de acesso.
create function fn_pedido_publico_status(p_slug text, p_pedido_id uuid)
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
    'createdAt', p.created_at,
    'notificadoEm', p.notificado_em,
    'notificadoMensagem', p.notificado_mensagem,
    'estabelecimentoNome', e.nome,
    'itens', coalesce(
      (select jsonb_agg(jsonb_build_object('produtoNome', pr.nome, 'quantidade', ip.quantidade) order by ip.created_at)
       from itens_pedido ip join produtos pr on pr.id = ip.produto_id
       where ip.pedido_id = p.id),
      '[]'::jsonb
    ),
    'historico', coalesce(
      (select jsonb_agg(jsonb_build_object('status', h.status_novo, 'em', h.created_at) order by h.created_at)
       from historico_status_pedido h where h.pedido_id = p.id),
      '[]'::jsonb
    )
  )
  from pedidos p
  join estabelecimentos e on e.id = p.estabelecimento_id
  where e.slug = p_slug and p.id = p_pedido_id and p.origem = 'app';
$$;

revoke all on function fn_pedido_publico_status(text, uuid) from public;
grant execute on function fn_pedido_publico_status(text, uuid) to ohfome_app;
