begin;

-- Opção que DEFINE o preço: em sanduíches o preço depende do pão (Bola / Árabe). Com
-- define_preco = true o preço da opção escolhida é o preço completo do item, e não um
-- acréscimo sobre o preço do produto. Os itens do pedido (preco_unitario), o total, o
-- financeiro e a comanda já usam o preço calculado aqui.

alter table produto_grupos_opcoes add column if not exists define_preco boolean not null default false;

create or replace function fn_cardapio_publico(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', e.id,
    'nome', e.nome,
    'tipo', e.tipo,
    'tipoComida', e.tipo_comida,
    'logoUrl', e.logo_url,
    'whatsappAtendimento', e.whatsapp_atendimento,
    'bannerModo', e.cardapio_banner_modo,
    'pix', (
      select case when cp.ativo then jsonb_build_object('modo', cp.modo) else null end
      from configuracoes_pix cp where cp.estabelecimento_id = e.id
    ),
    'banners', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'url', b.url, 'ordem', b.ordem, 'enquadramento', b.enquadramento) order by b.ordem)
      from banners_cardapio b
      where b.estabelecimento_id = e.id and b.ativo
    ), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'tamanho', p.tamanho,
        'descricao', p.descricao,
        'imagemUrl', p.imagem_url,
        'categoriaNome', coalesce(c.nome, 'Geral'),
        'precoVenda', p.preco_venda,
        'tipoProduto', p.tipo_produto,
        'controlaEstoqueUnidades', p.controla_estoque_unidades,
        'estoqueDisponivel', case when p.controla_estoque_unidades then fn_disponibilidade_produto(e.id, p.id) else null end,
        'grupoOpcoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id,
            'nome', g.nome,
            'minimoSelecoes', g.minimo_selecoes,
            'maximoSelecoes', g.maximo_selecoes,
            'definePreco', g.define_preco,
            'opcoes', coalesce((
              select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'acrescimo', o.acrescimo) order by o.ordem, o.nome)
              from produto_opcoes o where o.grupo_id = g.id and o.ativo
            ), '[]'::jsonb)
          ) order by g.ordem, g.nome)
          from produto_grupos_opcoes g
          where g.produto_id = p.id and g.ativo
        ), '[]'::jsonb),
        'pizza', case when p.tipo_produto = 'pizza' then (
          select jsonb_build_object(
            'regraMeioAMeio', pcp.regra_meio_a_meio,
            'tamanhos', coalesce((
              select jsonb_agg(jsonb_build_object('id', pt.id, 'nome', pt.nome, 'precoSaborUnico', pt.preco_sabor_unico, 'precoMeioAMeio', pt.preco_meio_a_meio, 'permiteMeioAMeio', pt.permite_meio_a_meio) order by pt.ordem)
              from pizza_tamanhos pt where pt.produto_id = p.id and pt.ativo
            ), '[]'::jsonb),
            'sabores', coalesce((
              select jsonb_agg(jsonb_build_object('id', ps.id, 'nome', ps.nome, 'descricao', ps.descricao, 'acrescimo', ps.acrescimo, 'permiteMeioAMeio', ps.permite_meio_a_meio,
                'precos', coalesce((select jsonb_object_agg(sp.tamanho_id::text, sp.preco) from pizza_sabor_precos sp where sp.sabor_id = ps.id), '{}'::jsonb)) order by ps.ordem, ps.nome)
              from pizza_sabores ps where ps.produto_id = p.id and ps.ativo
            ), '[]'::jsonb)
          )
          from produto_configuracoes_pizza pcp where pcp.produto_id = p.id
        ) else null end
      ) order by coalesce(c.ordem_exibicao, 0), p.nome, p.tamanho)
      from produtos p
      left join categorias_produto c on c.id = p.categoria_id
      where p.estabelecimento_id = e.id and p.ativo
    ), '[]'::jsonb)
  )
  from estabelecimentos e
  where e.slug = p_slug and e.ativo;
$$;

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
        select nome, acrescimo into v_pizza_sabor_dois_nome, v_pizza_sabor_dois_acrescimo
        from pizza_sabores where id = v_pizza_sabor_dois_id and produto_id = v_produto_id and ativo;
        if v_pizza_sabor_dois_nome is null then
          raise exception 'Sabor de pizza inválido' using errcode = '22023';
        end if;
        if exists (select 1 from pizza_sabor_precos where sabor_id = v_pizza_sabor_dois_id)
           and not exists (select 1 from pizza_sabor_precos where sabor_id = v_pizza_sabor_dois_id and tamanho_id = v_pizza_tamanho_id) then
          raise exception 'Este sabor não é vendido neste tamanho' using errcode = '22023';
        end if;
        v_pizza_valor_dois := coalesce(
          (select preco from pizza_sabor_precos where sabor_id = v_pizza_sabor_dois_id and tamanho_id = v_pizza_tamanho_id),
          v_pizza_preco_sabor_unico + v_pizza_sabor_dois_acrescimo);
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
  v_consentimento boolean;
  v_endereco text;
  v_bairro text;
  v_novo_pedido_id uuid;
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
  v_observacoes text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_total numeric(10,2);
begin
  select p.estabelecimento_id, p.status::text, p.forma_recebimento, p.forma_pagamento, p.tipo, p.cliente_id, p.whatsapp_consentimento
    into v_estabelecimento_id, v_status, v_forma_recebimento, v_forma_pagamento, v_tipo, v_cliente_id, v_consentimento
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
    cliente_id, observacoes, forma_recebimento, forma_pagamento, pagamento_status, pedido_pai_id, whatsapp_consentimento
  )
  values (
    v_estabelecimento_id, v_tipo, 'app', 'novo', true, now(),
    v_cliente_id, v_observacoes, v_forma_recebimento, v_forma_pagamento, 'pendente', p_pedido_id, coalesce(v_consentimento, false)
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
    select preco_venda, tipo_produto into v_preco, v_tipo_produto
    from produtos
    where id = v_produto_id and estabelecimento_id = v_estabelecimento_id and ativo;
    if v_preco is null then
      raise exception 'Produto inválido' using errcode = '22023';
    end if;
    if v_tipo_produto = 'pizza' then
      raise exception 'Pizza ainda não pode ser adicionada por aqui — peça direto no cardápio.' using errcode = '22023';
    end if;

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
    values (v_novo_pedido_id, v_produto_id, v_quantidade, (case when exists (select 1 from jsonb_array_elements(v_item_opcoes) elem
      join produto_opcoes o on o.id = (elem->>'opcaoId')::uuid
      join produto_grupos_opcoes g on g.id = o.grupo_id where g.define_preco) then 0 else v_preco end) + v_acrescimo, v_item_observacoes)
    returning id into v_item_pedido_id;

    insert into itens_pedido_opcoes (estabelecimento_id, item_pedido_id, grupo_nome, opcao_nome, acrescimo)
    select v_estabelecimento_id, v_item_pedido_id, g.nome, o.nome, o.acrescimo
    from jsonb_array_elements(v_item_opcoes) elem
    join produto_opcoes o on o.id = (elem->>'opcaoId')::uuid
    join produto_grupos_opcoes g on g.id = o.grupo_id;
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

commit;
