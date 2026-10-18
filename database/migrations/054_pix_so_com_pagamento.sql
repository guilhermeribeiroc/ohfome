begin;

-- Pix no cardápio digital: só com pagamento na hora (QR Code).
--  1. fn_criar_pedido_publico recusa Pix quando o estabelecimento não usa o Pix automático (antes o
--     pedido ia direto para a cozinha com o Pix "para pagar na entrega").
--  2. O aviso de WhatsApp de pedido do cardápio só é enfileirado depois que o pedido é liberado
--     (enviado_cozinha), ou seja, depois do pagamento do Pix.

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
  v_tipo_produto text;
  v_quantidade int;
  v_preco numeric(10,2);
  v_item_observacoes text;
  v_item_opcoes jsonb;
  v_opcoes_fornecidas boolean;
  v_acrescimo numeric(10,2);
  v_item_pedido_id uuid;
  v_pizza jsonb;
  v_pizza_tamanho_id uuid;
  v_pizza_sabor_um_id uuid;
  v_pizza_sabor_dois_id uuid;
  v_pizza_regra text;
  v_pizza_tamanho_nome text;
  v_pizza_preco_sabor_unico numeric(10,2);
  v_pizza_preco_meio_a_meio numeric(10,2);
  v_pizza_sabor_um_nome text;
  v_pizza_sabor_um_acrescimo numeric(10,2);
  v_pizza_sabor_dois_nome text;
  v_pizza_sabor_dois_acrescimo numeric(10,2);
  v_pizza_valor_um numeric(10,2);
  v_pizza_valor_dois numeric(10,2);
  v_pizza_dois_produto_id uuid;
  v_pizza_dois_tamanho_id uuid;
  v_pizza_dois_preco_unico numeric(10,2);
  v_pizza_dois_permite boolean;
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

  if p_forma_pagamento = 'pix' or v_valor_pix is not null then
    select modo into v_pix_modo from configuracoes_pix
    where estabelecimento_id = v_estabelecimento_id and ativo;
    if v_pix_modo is null then
      raise exception 'Pix não está disponível neste cardápio' using errcode = '22023';
    end if;
    -- Pix no cardápio digital só vale com pagamento na hora (QR Code). Sem isso o pedido iria direto para a
    -- cozinha com o Pix "para pagar depois" (Pix na entrega), o que não é aceito.
    if v_pix_modo <> 'mercado_pago' then
      raise exception 'O Pix só é aceito com pagamento na hora pelo QR Code. Escolha outra forma de pagamento.' using errcode = '22023';
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

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para, pagamento_dividido, taxa_entrega, pagamento_status, whatsapp_consentimento)
  values (
    v_estabelecimento_id,
    case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end,
    'app', 'novo', v_enviar_cozinha, case when v_enviar_cozinha then now() else null end,
    v_cliente_id, v_observacoes, p_forma_recebimento, p_forma_pagamento,
    case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end,
    v_troco_para,
    case when v_misto then p_pagamento_dividido else null end,
    v_taxa_entrega, 'pendente', coalesce(p_notificar_pedido, false)
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

    select preco_venda, tipo_produto into v_preco, v_tipo_produto
    from produtos
    where id = v_produto_id and estabelecimento_id = v_estabelecimento_id and ativo;

    if v_preco is null then
      raise exception 'Produto inválido' using errcode = '22023';
    end if;

    v_pizza_tamanho_id := null; v_pizza_sabor_um_id := null; v_pizza_sabor_dois_id := null;
    v_pizza_tamanho_nome := null; v_pizza_sabor_um_nome := null; v_pizza_sabor_dois_nome := null; v_pizza_regra := null;

    if v_tipo_produto = 'pizza' then
      v_pizza := v_item->'pizza';
      if v_pizza is null then
        raise exception 'Escolha tamanho e sabor da pizza' using errcode = '22023';
      end if;
      v_pizza_tamanho_id := nullif(v_pizza->>'tamanhoId', '')::uuid;
      v_pizza_sabor_um_id := nullif(v_pizza->>'saborUmId', '')::uuid;
      v_pizza_sabor_dois_id := nullif(v_pizza->>'saborDoisId', '')::uuid;
      if v_pizza_tamanho_id is null or v_pizza_sabor_um_id is null then
        raise exception 'Escolha tamanho e sabor da pizza' using errcode = '22023';
      end if;
      if v_pizza_sabor_dois_id is not null and v_pizza_sabor_dois_id = v_pizza_sabor_um_id then
        raise exception 'Escolha sabores diferentes para meio a meio' using errcode = '22023';
      end if;

      select regra_meio_a_meio into v_pizza_regra
      from produto_configuracoes_pizza where produto_id = v_produto_id;

      select nome, preco_sabor_unico, preco_meio_a_meio into v_pizza_tamanho_nome, v_pizza_preco_sabor_unico, v_pizza_preco_meio_a_meio
      from pizza_tamanhos where id = v_pizza_tamanho_id and produto_id = v_produto_id and ativo;
      if v_pizza_tamanho_nome is null then
        raise exception 'Tamanho de pizza inválido' using errcode = '22023';
      end if;

      select nome, acrescimo into v_pizza_sabor_um_nome, v_pizza_sabor_um_acrescimo
      from pizza_sabores where id = v_pizza_sabor_um_id and produto_id = v_produto_id and ativo;
      if v_pizza_sabor_um_nome is null then
        raise exception 'Sabor de pizza inválido' using errcode = '22023';
      end if;

      if exists (select 1 from pizza_sabor_precos where sabor_id = v_pizza_sabor_um_id)
         and not exists (select 1 from pizza_sabor_precos where sabor_id = v_pizza_sabor_um_id and tamanho_id = v_pizza_tamanho_id) then
        raise exception 'Este sabor não é vendido neste tamanho' using errcode = '22023';
      end if;
      v_pizza_valor_um := coalesce(
        (select preco from pizza_sabor_precos where sabor_id = v_pizza_sabor_um_id and tamanho_id = v_pizza_tamanho_id),
        v_pizza_preco_sabor_unico + v_pizza_sabor_um_acrescimo);

      if v_pizza_sabor_dois_id is not null then
        if not exists (select 1 from pizza_tamanhos where id = v_pizza_tamanho_id and permite_meio_a_meio) then
          raise exception 'Este tamanho de pizza não aceita meio a meio' using errcode = '22023';
        end if;
        if exists (select 1 from pizza_sabores where id in (v_pizza_sabor_um_id, v_pizza_sabor_dois_id) and not permite_meio_a_meio) then
          raise exception 'Um dos sabores não pode ser combinado no meio a meio' using errcode = '22023';
        end if;
        -- O 2º sabor pode ser de outra pizza ativa do estabelecimento (ex.: metade salgada, metade
        -- doce), desde que essa pizza tenha um tamanho com o mesmo nome do escolhido.
        select ps.nome, ps.acrescimo, ps.produto_id into v_pizza_sabor_dois_nome, v_pizza_sabor_dois_acrescimo, v_pizza_dois_produto_id
        from pizza_sabores ps
        join produtos pr on pr.id = ps.produto_id and pr.ativo and pr.estabelecimento_id = v_estabelecimento_id
        where ps.id = v_pizza_sabor_dois_id and ps.ativo;
        if v_pizza_sabor_dois_nome is null then
          raise exception 'Sabor de pizza inválido' using errcode = '22023';
        end if;
        if v_pizza_dois_produto_id = v_produto_id then
          v_pizza_dois_tamanho_id := v_pizza_tamanho_id;
          v_pizza_dois_preco_unico := v_pizza_preco_sabor_unico;
        else
          select pt.id, pt.preco_sabor_unico, pt.permite_meio_a_meio
            into v_pizza_dois_tamanho_id, v_pizza_dois_preco_unico, v_pizza_dois_permite
          from pizza_tamanhos pt
          where pt.produto_id = v_pizza_dois_produto_id and lower(pt.nome) = lower(v_pizza_tamanho_nome) and pt.ativo;
          if v_pizza_dois_tamanho_id is null then
            raise exception 'Este sabor não é vendido neste tamanho' using errcode = '22023';
          end if;
          if not v_pizza_dois_permite then
            raise exception 'Este tamanho de pizza não aceita meio a meio' using errcode = '22023';
          end if;
        end if;
        if exists (select 1 from pizza_sabor_precos where sabor_id = v_pizza_sabor_dois_id)
           and not exists (select 1 from pizza_sabor_precos where sabor_id = v_pizza_sabor_dois_id and tamanho_id = v_pizza_dois_tamanho_id) then
          raise exception 'Este sabor não é vendido neste tamanho' using errcode = '22023';
        end if;
        v_pizza_valor_dois := coalesce(
          (select preco from pizza_sabor_precos where sabor_id = v_pizza_sabor_dois_id and tamanho_id = v_pizza_dois_tamanho_id),
          v_pizza_dois_preco_unico + v_pizza_sabor_dois_acrescimo);
        v_preco := case v_pizza_regra
          when 'media' then (v_pizza_valor_um + v_pizza_valor_dois) / 2
          when 'preco_fixo' then coalesce(v_pizza_preco_meio_a_meio, greatest(v_pizza_valor_um, v_pizza_valor_dois))
          else greatest(v_pizza_valor_um, v_pizza_valor_dois)
        end;
      else
        v_preco := v_pizza_valor_um;
      end if;
    end if;

    -- Opcoes do item (ex.: pao, tamanho). Compativel com clientes antigos
    -- que ainda nao enviam o campo: so valida minimo/maximo quando a chave
    -- "opcoes" vem no payload (mesma regra do fluxo interno Balcao/Mesa).
    v_opcoes_fornecidas := (v_item ? 'opcoes');
    v_item_opcoes := coalesce(v_item->'opcoes', '[]'::jsonb);

    if (select count(*) from jsonb_array_elements(v_item_opcoes)) <>
       (select count(distinct elem->>'opcaoId') from jsonb_array_elements(v_item_opcoes) elem) then
      raise exception 'Não repita a mesma opção' using errcode = '22023';
    end if;

    if (
      select count(*) from jsonb_array_elements(v_item_opcoes) elem
      join produto_opcoes o on o.id = (elem->>'opcaoId')::uuid and o.ativo
      join produto_grupos_opcoes g on g.id = o.grupo_id and g.ativo and g.produto_id = v_produto_id
      where g.id::text = elem->>'grupoId'
    ) <> jsonb_array_length(v_item_opcoes) then
      raise exception 'Uma opção não pertence a este produto' using errcode = '22023';
    end if;

    if exists (
      select 1 from produto_grupos_opcoes g
      where g.produto_id = v_produto_id and g.ativo
        and (v_opcoes_fornecidas or g.define_preco)
        and (select count(*) from jsonb_array_elements(v_item_opcoes) elem where elem->>'grupoId' = g.id::text)
            not between g.minimo_selecoes and g.maximo_selecoes
    ) then
      raise exception 'Escolha as opções deste item dentro do mínimo e máximo permitido' using errcode = '22023';
    end if;

    select coalesce(sum(o.acrescimo), 0) into v_acrescimo
    from jsonb_array_elements(v_item_opcoes) elem
    join produto_opcoes o on o.id = (elem->>'opcaoId')::uuid;

    insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, observacoes)
    values (v_pedido_id, v_produto_id, v_quantidade, (case when exists (select 1 from jsonb_array_elements(v_item_opcoes) elem
      join produto_opcoes o on o.id = (elem->>'opcaoId')::uuid
      join produto_grupos_opcoes g on g.id = o.grupo_id where g.define_preco) then 0 else v_preco end) + v_acrescimo, v_item_observacoes)
    returning id into v_item_pedido_id;

    if v_tipo_produto = 'pizza' then
      insert into itens_pedido_pizza (item_pedido_id, estabelecimento_id, tamanho_nome, sabor_um_nome, sabor_dois_nome, regra_meio_a_meio, preco_calculado)
      values (v_item_pedido_id, v_estabelecimento_id, v_pizza_tamanho_nome, v_pizza_sabor_um_nome, v_pizza_sabor_dois_nome, case when v_pizza_sabor_dois_id is not null then v_pizza_regra else null end, v_preco);
    end if;

    insert into itens_pedido_opcoes (estabelecimento_id, item_pedido_id, grupo_nome, opcao_nome, acrescimo)
    select v_estabelecimento_id, v_item_pedido_id, g.nome, o.nome, o.acrescimo
    from jsonb_array_elements(v_item_opcoes) elem
    join produto_opcoes o on o.id = (elem->>'opcaoId')::uuid
    join produto_grupos_opcoes g on g.id = o.grupo_id;
  end loop;

  if p_forma_recebimento = 'entrega' then
    insert into entregas (pedido_id, endereco, bairro) values (v_pedido_id, v_endereco, v_bairro_nome);
  end if;

  select total into v_total from pedidos where id = v_pedido_id;
  if v_troco_para is not null and p_forma_pagamento = 'dinheiro' and v_troco_para < v_total then
    raise exception 'O troco precisa ser para um valor igual ou maior que o total do pedido' using errcode = '22023';
  end if;
  if v_misto and abs(v_soma_partes - v_total) > 0.01 then
    raise exception 'A soma do pagamento dividido não bate com o total do pedido' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_pedido_id,
    'codigo', v_codigo,
    'total', v_total
  );
end;
$$;

create or replace function enfileirar_notificacao_whatsapp() returns trigger as $$
declare
  v_automacao_ativa boolean;
  v_telefone text;
begin
  if new.status = 'cancelado' or new.cliente_id is null or not new.whatsapp_consentimento then
    return new;
  end if;

  -- Pedido do cardápio digital ainda não liberado (Pix aguardando pagamento): não avisa o cliente.
  if new.origem = 'app' and not new.enviado_cozinha then
    return new;
  end if;

  select e.whatsapp_automacao_ativa into v_automacao_ativa
  from estabelecimentos e where e.id = new.estabelecimento_id;

  if not coalesce(v_automacao_ativa, false) then
    return new;
  end if;

  select c.telefone into v_telefone from clientes c where c.id = new.cliente_id;
  if v_telefone is null or length(v_telefone) < 10 then
    return new;
  end if;

  insert into notificacoes_whatsapp_pedido (estabelecimento_id, pedido_id, status_pedido)
  values (new.estabelecimento_id, new.id, new.status)
  on conflict (pedido_id, status_pedido) do nothing;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pedidos_notificacao_whatsapp on pedidos;
create trigger trg_pedidos_notificacao_whatsapp
  after insert or update of status, enviado_cozinha on pedidos
  for each row execute function enfileirar_notificacao_whatsapp();

commit;
