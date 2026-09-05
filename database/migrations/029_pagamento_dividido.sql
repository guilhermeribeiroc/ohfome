-- Pagamento dividido em duas formas (ex.: metade Pix, metade dinheiro com
-- troco). Guardamos a forma "resumo" em forma_pagamento = 'misto' e o
-- detalhe das duas partes em pagamento_dividido (jsonb), para não duplicar
-- tipo_cartao/troco_para (que continuam servindo o caso de forma única).

alter table pedidos drop constraint if exists pedidos_forma_pagamento_check;
alter table pedidos add constraint pedidos_forma_pagamento_check
  check (forma_pagamento is null or forma_pagamento in ('cartao', 'dinheiro', 'pix', 'misto'));

alter table pedidos add column if not exists pagamento_dividido jsonb;
alter table pedidos add constraint pedidos_pagamento_dividido_check check (
  (forma_pagamento = 'misto' and jsonb_array_length(pagamento_dividido) = 2)
  or (forma_pagamento is distinct from 'misto' and pagamento_dividido is null)
);

-- Acrescenta suporte a pagamento dividido (forma_pagamento = 'misto') ao
-- pedido público. Quando uma das partes é Pix com Mercado Pago, só essa
-- parte é cobrada (o retorno inclui valorPix para a rota decidir o valor
-- da cobrança em vez de usar o total do pedido).
create or replace function fn_criar_pedido_publico(
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
  p_cpf text,
  p_notificar_pedido boolean,
  p_bairro_id uuid,
  p_email text,
  p_pagamento_dividido jsonb default null
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
  v_item_observacoes text;
  v_endereco text := nullif(btrim(coalesce(p_endereco, '')), '');
  v_observacoes text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_cpf text := nullif(btrim(coalesce(p_cpf, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_troco_para numeric(10,2) := case when p_troco_para > 0 then p_troco_para else null end;
  v_bairro_nome text;
  v_taxa_entrega numeric(10,2) := 0;
  v_pix_modo text;
  v_enviar_cozinha boolean := true;
  v_total numeric(10,2);
  v_misto boolean := p_forma_pagamento = 'misto';
  v_parte jsonb;
  v_parte_forma text;
  v_parte_valor numeric(10,2);
  v_soma_partes numeric(10,2) := 0;
  v_valor_pix numeric(10,2);
begin
  select id into v_estabelecimento_id from estabelecimentos where slug = p_slug and ativo;
  if v_estabelecimento_id is null then
    raise exception 'Estabelecimento não encontrado' using errcode = 'P0002';
  end if;

  if p_forma_recebimento not in ('entrega', 'retirada') then
    raise exception 'Forma de recebimento inválida' using errcode = '22023';
  end if;
  if p_forma_pagamento not in ('cartao', 'dinheiro', 'pix', 'misto') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  if p_forma_pagamento = 'cartao' and p_tipo_cartao not in ('credito', 'debito') then
    raise exception 'Informe crédito ou débito' using errcode = '22023';
  end if;
  if p_forma_pagamento = 'cartao' then
    v_troco_para := null;
  end if;

  -- Validação estrutural do pagamento dividido: exatamente 2 partes, formas
  -- válidas e diferentes entre si, cada uma com valor positivo.
  if v_misto then
    if p_pagamento_dividido is null or jsonb_array_length(p_pagamento_dividido) <> 2 then
      raise exception 'Pagamento dividido precisa de exatamente 2 partes' using errcode = '22023';
    end if;
    if (p_pagamento_dividido -> 0 ->> 'forma') = (p_pagamento_dividido -> 1 ->> 'forma') then
      raise exception 'As duas partes do pagamento dividido precisam ser formas diferentes' using errcode = '22023';
    end if;
    for v_parte in select jsonb_array_elements(p_pagamento_dividido) loop
      v_parte_forma := v_parte ->> 'forma';
      v_parte_valor := (v_parte ->> 'valor')::numeric;
      if v_parte_forma not in ('cartao', 'dinheiro', 'pix') then
        raise exception 'Forma inválida no pagamento dividido' using errcode = '22023';
      end if;
      if v_parte_valor is null or v_parte_valor <= 0 then
        raise exception 'Valor inválido no pagamento dividido' using errcode = '22023';
      end if;
      if v_parte_forma = 'cartao' and (v_parte ->> 'tipoCartao') not in ('credito', 'debito') then
        raise exception 'Informe crédito ou débito na parte em cartão' using errcode = '22023';
      end if;
      v_soma_partes := v_soma_partes + v_parte_valor;
      if v_parte_forma = 'pix' then
        v_valor_pix := v_parte_valor;
      end if;
    end loop;
  end if;

  if p_forma_recebimento = 'entrega' and length(coalesce(v_endereco, '')) < 10 then
    raise exception 'Informe o endereço completo para entrega' using errcode = '22023';
  end if;
  if p_forma_recebimento = 'entrega' then
    if p_bairro_id is null then
      raise exception 'Selecione o bairro de entrega' using errcode = '22023';
    end if;
    select nome, taxa into v_bairro_nome, v_taxa_entrega
    from bairros_entrega
    where id = p_bairro_id and estabelecimento_id = v_estabelecimento_id and ativo;
    if v_bairro_nome is null then
      raise exception 'Bairro inválido' using errcode = '22023';
    end if;
  end if;
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens' using errcode = '22023';
  end if;

  -- Pix "puro" ou Pix como parte do pagamento dividido seguem a mesma regra:
  -- se o estabelecimento usa Mercado Pago, o pedido só vai pra cozinha após
  -- a confirmação (e exige e-mail do pagador).
  if p_forma_pagamento = 'pix' or v_valor_pix is not null then
    select modo into v_pix_modo from configuracoes_pix
    where estabelecimento_id = v_estabelecimento_id and ativo;
    if v_pix_modo is null then
      raise exception 'Pix não está disponível neste cardápio' using errcode = '22023';
    end if;
    if v_pix_modo = 'mercado_pago' then
      if v_email is null or position('@' in v_email) < 2 or position('.' in split_part(v_email, '@', 2)) < 2 then
        raise exception 'Informe um e-mail válido para pagar com Pix' using errcode = '22023';
      end if;
      v_enviar_cozinha := false;
    end if;
  end if;

  insert into clientes (estabelecimento_id, nome, telefone, endereco, cpf, email, notificar_pedido)
  values (v_estabelecimento_id, p_cliente_nome, p_telefone, case when p_forma_recebimento = 'entrega' then v_endereco else null end, v_cpf, v_email, p_notificar_pedido)
  on conflict (estabelecimento_id, telefone) do update
    set nome = excluded.nome,
        endereco = coalesce(excluded.endereco, clientes.endereco),
        cpf = coalesce(excluded.cpf, clientes.cpf),
        email = coalesce(excluded.email, clientes.email),
        notificar_pedido = excluded.notificar_pedido
  returning id into v_cliente_id;

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para, pagamento_dividido, taxa_entrega, pagamento_status)
  values (
    v_estabelecimento_id,
    case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end,
    'app', 'novo', v_enviar_cozinha, case when v_enviar_cozinha then now() else null end,
    v_cliente_id, v_observacoes, p_forma_recebimento, p_forma_pagamento,
    case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end,
    v_troco_para,
    case when v_misto then p_pagamento_dividido else null end,
    v_taxa_entrega, 'pendente'
  )
  returning id, codigo into v_pedido_id, v_codigo;

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
    values (v_pedido_id, v_produto_id, v_quantidade, v_preco, v_item_observacoes);
  end loop;

  if p_forma_recebimento = 'entrega' then
    insert into entregas (pedido_id, endereco, bairro) values (v_pedido_id, v_endereco, v_bairro_nome);
  end if;

  -- O total só existe depois dos itens inseridos (recalculado por trigger).
  -- É aqui, com o total de verdade, que validamos a soma do pagamento
  -- dividido — nunca confiando no total que o cliente enviou.
  select total into v_total from pedidos where id = v_pedido_id;
  if v_misto and abs(v_soma_partes - v_total) > 0.01 then
    raise exception 'A soma do pagamento dividido não bate com o total do pedido' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_pedido_id,
    'codigo', v_codigo,
    'estabelecimentoId', v_estabelecimento_id,
    'notificar', p_notificar_pedido,
    'taxaEntrega', v_taxa_entrega,
    'total', v_total,
    'pixModo', case when p_forma_pagamento = 'pix' or v_valor_pix is not null then v_pix_modo else null end,
    'valorPix', v_valor_pix,
    'aguardandoPagamento', not v_enviar_cozinha
  );
end;
$$;

revoke all on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid, text, jsonb) from public;
grant execute on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid, text, jsonb) to ohfome_app;

-- A assinatura antiga (14 parâmetros, sem p_pagamento_dividido) fica órfã
-- porque o Postgres trata parâmetro extra com default como overload novo;
-- removemos para não haver duas versões da função coexistindo.
drop function if exists fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid, text);
