-- Taxas de entrega por bairro: o estabelecimento define quanto cobrar por
-- bairro, e o cliente no cardapio publico escolhe o bairro e ja ve a taxa
-- calculada automaticamente.

create table bairros_entrega (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null,
  taxa numeric(10, 2) not null default 0 check (taxa >= 0),
  -- comeca desativado: o dono revisa a taxa antes do bairro aparecer pros
  -- clientes no cardapio (evita cobrar 0 por engano).
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (estabelecimento_id, nome)
);

create index idx_bairros_entrega_estabelecimento on bairros_entrega(estabelecimento_id);

alter table bairros_entrega enable row level security;

create policy tenant_isolation on bairros_entrega
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

grant select, insert, update, delete on bairros_entrega to ohfome_app;

-- Registra em qual bairro (e com qual endereco) cada entrega foi feita.
alter table entregas add column if not exists bairro text;

-- Semeia os bairros da cidade (Morada Nova/CE) pra todo estabelecimento
-- novo, ja com o nome pronto — o dono so ativa e define a taxa de cada um.
create or replace function fn_registrar_estabelecimento(
  p_nome text,
  p_tipo tipo_estabelecimento,
  p_tipo_comida text,
  p_modulos modulo_sistema[],
  p_usuarios jsonb,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estabelecimento_id uuid;
  v_modulo modulo_sistema;
  v_usuario jsonb;
  v_categorias text[];
  v_nome_categoria text;
  v_ordem int;
  v_bairros text[] := array[
    'Centro', 'Cristo Rei', 'São José', 'Hermógenes Henrique Girão',
    'Nossa Senhora da Conceição', 'Girão Maia', 'Júlia Santiago', 'São Francisco',
    'Antônio Raulino', 'Divino Espírito Santo', 'Alto Tiradentes',
    'Dionísio de Matos Fontes', 'Dois de Agosto', 'Luiz Valter Rabelo Maia', 'Irapuan Nobre'
  ];
  v_nome_bairro text;
begin
  insert into estabelecimentos (nome, tipo, tipo_comida, slug)
  values (p_nome, p_tipo, p_tipo_comida, p_slug)
  returning id into v_estabelecimento_id;

  foreach v_modulo in array p_modulos loop
    insert into estabelecimento_modulos (estabelecimento_id, modulo)
    values (v_estabelecimento_id, v_modulo);
  end loop;

  for v_usuario in select jsonb_array_elements(p_usuarios) loop
    insert into usuarios (estabelecimento_id, nome, usuario, email, senha_hash, role)
    values (
      v_estabelecimento_id,
      v_usuario->>'nome',
      lower(v_usuario->>'usuario'),
      nullif(lower(v_usuario->>'email'), ''),
      v_usuario->>'senha_hash',
      (v_usuario->>'role')::user_role
    );
  end loop;

  v_categorias := case p_tipo
    when 'churrascaria' then array['Espetos', 'Carnes', 'Porções', 'Acompanhamentos', 'Saladas', 'Bebidas', 'Sobremesas']
    when 'pizzaria' then array['Pizzas Salgadas', 'Pizzas Doces', 'Esfihas', 'Bebidas', 'Sobremesas']
    when 'hamburgueria' then array['Hambúrgueres', 'Porções', 'Combos', 'Bebidas', 'Sobremesas']
    when 'japonesa' then array['Sushis', 'Temakis', 'Yakisoba', 'Entradas', 'Bebidas', 'Sobremesas']
    when 'padaria_cafeteria' then array['Pães', 'Salgados', 'Doces', 'Cafés', 'Bebidas']
    when 'sorveteria' then array['Sorvetes', 'Açaí', 'Milkshakes', 'Sundaes', 'Casquinhas', 'Bebidas']
    else array['Entradas', 'Pratos Principais', 'Acompanhamentos', 'Bebidas', 'Sobremesas']
  end;

  v_ordem := 0;
  foreach v_nome_categoria in array v_categorias loop
    insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
    values (v_estabelecimento_id, v_nome_categoria, v_ordem);
    v_ordem := v_ordem + 1;
  end loop;

  foreach v_nome_bairro in array v_bairros loop
    insert into bairros_entrega (estabelecimento_id, nome)
    values (v_estabelecimento_id, v_nome_bairro);
  end loop;

  return v_estabelecimento_id;
end;
$$;

-- fn_criar_pedido_publico ganha o parametro do bairro escolhido: busca a
-- taxa cadastrada e ja grava em pedidos.taxa_entrega (o total do pedido e
-- recalculado automaticamente pelo trigger existente ao inserir os itens).
drop function if exists fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean);

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
  p_notificar_pedido boolean default false,
  p_bairro_id uuid default null
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
  v_bairro_nome text;
  v_taxa_entrega numeric(10,2) := 0;
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

  insert into clientes (estabelecimento_id, nome, telefone, endereco, cpf, notificar_pedido)
  values (v_estabelecimento_id, p_cliente_nome, p_telefone, case when p_forma_recebimento = 'entrega' then v_endereco else null end, v_cpf, p_notificar_pedido)
  on conflict (estabelecimento_id, telefone) do update
    set nome = excluded.nome,
        endereco = coalesce(excluded.endereco, clientes.endereco),
        cpf = coalesce(excluded.cpf, clientes.cpf),
        notificar_pedido = excluded.notificar_pedido
  returning id into v_cliente_id;

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para, taxa_entrega)
  values (v_estabelecimento_id, case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end, 'app', 'novo', true, now(), v_cliente_id, v_observacoes, p_forma_recebimento, p_forma_pagamento, case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end, v_troco_para, v_taxa_entrega)
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
    insert into entregas (pedido_id, endereco, bairro) values (v_pedido_id, v_endereco, v_bairro_nome);
  end if;

  return jsonb_build_object('id', v_pedido_id, 'codigo', v_codigo, 'notificar', p_notificar_pedido, 'taxaEntrega', v_taxa_entrega);
end;
$$;

revoke all on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid) from public;
grant execute on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid) to ohfome_app;

-- Lista publica dos bairros ativos (e a taxa de cada um) pro cardapio digital.
create function fn_bairros_publico(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'nome', b.nome, 'taxa', b.taxa) order by b.nome), '[]'::jsonb)
  from bairros_entrega b
  join estabelecimentos e on e.id = b.estabelecimento_id
  where e.slug = p_slug and e.ativo and b.ativo;
$$;

revoke all on function fn_bairros_publico(text) from public;
grant execute on function fn_bairros_publico(text) to ohfome_app;
