-- Pix configurável por estabelecimento. O modo manual não depende de provedor;
-- o modo Mercado Pago mantém uma conexão OAuth própria por restaurante.

alter table clientes add column if not exists email text;

create table if not exists configuracoes_pix (
  estabelecimento_id uuid primary key references estabelecimentos(id) on delete cascade,
  ativo boolean not null default false,
  modo text not null default 'manual' check (modo in ('manual', 'mercado_pago')),
  chave_manual text,
  instrucao_manual text,
  expiracao_minutos integer not null default 30 check (expiracao_minutos between 30 and 43200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_configuracoes_pix_updated_at
  before update on configuracoes_pix
  for each row execute function set_updated_at();

create table if not exists mercado_pago_conexoes (
  estabelecimento_id uuid primary key references estabelecimentos(id) on delete cascade,
  collector_id text not null,
  access_token_cifrado text not null,
  refresh_token_cifrado text not null,
  token_expira_em timestamptz,
  scope text,
  conectado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_mercado_pago_conexoes_updated_at
  before update on mercado_pago_conexoes
  for each row execute function set_updated_at();

create table if not exists mercado_pago_oauth_states (
  state uuid primary key,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  code_verifier text not null,
  expira_em timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mercado_pago_oauth_states_expira
  on mercado_pago_oauth_states(expira_em);

create table if not exists pagamentos_pix (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  pedido_id uuid not null unique references pedidos(id) on delete cascade,
  provedor text not null check (provedor in ('mercado_pago')),
  idempotency_key uuid not null unique,
  order_id text unique,
  payment_id text unique,
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'falhou', 'expirado', 'estornado')),
  valor numeric(10, 2) not null check (valor >= 0),
  moeda char(3) not null default 'BRL',
  copia_cola text,
  qr_code_base64 text,
  ticket_url text,
  expira_em timestamptz,
  confirmado_em timestamptz,
  detalhe_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_pagamentos_pix_updated_at
  before update on pagamentos_pix
  for each row execute function set_updated_at();

create index if not exists idx_pagamentos_pix_estabelecimento_status
  on pagamentos_pix(estabelecimento_id, status, created_at desc);

alter table configuracoes_pix enable row level security;
alter table mercado_pago_conexoes enable row level security;
alter table mercado_pago_oauth_states enable row level security;
alter table pagamentos_pix enable row level security;

drop policy if exists tenant_isolation on configuracoes_pix;
create policy tenant_isolation on configuracoes_pix
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

drop policy if exists tenant_isolation on mercado_pago_conexoes;
create policy tenant_isolation on mercado_pago_conexoes
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

drop policy if exists tenant_isolation on mercado_pago_oauth_states;
create policy tenant_isolation on mercado_pago_oauth_states
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

drop policy if exists tenant_isolation on pagamentos_pix;
create policy tenant_isolation on pagamentos_pix
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

grant select, insert, update, delete on configuracoes_pix, mercado_pago_conexoes,
  mercado_pago_oauth_states, pagamentos_pix to ohfome_app;

-- A versão pública do cardápio expõe apenas o modo Pix, nunca chave ou
-- credencial. Com Pix desativado, o campo é nulo e o front não oferece Pix.
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
      select jsonb_agg(jsonb_build_object('id', b.id, 'url', b.url, 'ordem', b.ordem) order by b.ordem)
      from banners_cardapio b
      where b.estabelecimento_id = e.id and b.ativo
    ), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'descricao', p.descricao,
        'imagemUrl', p.imagem_url,
        'categoriaNome', coalesce(c.nome, 'Geral'),
        'precoVenda', p.preco_venda
      ) order by coalesce(c.ordem_exibicao, 0), p.nome)
      from produtos p
      left join categorias_produto c on c.id = p.categoria_id
      where p.estabelecimento_id = e.id and p.ativo
    ), '[]'::jsonb)
  )
  from estabelecimentos e
  where e.slug = p_slug and e.ativo;
$$;

-- Acrescenta e-mail do pagador e devolve o total calculado pelo banco. O
-- próprio banco decide se Pix automático pode ser enviado à cozinha.
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
  p_email text
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
begin
  select id into v_estabelecimento_id from estabelecimentos where slug = p_slug and ativo;
  if v_estabelecimento_id is null then
    raise exception 'Estabelecimento não encontrado' using errcode = 'P0002';
  end if;

  if p_forma_recebimento not in ('entrega', 'retirada') then
    raise exception 'Forma de recebimento inválida' using errcode = '22023';
  end if;
  if p_forma_pagamento not in ('cartao', 'dinheiro', 'pix') then
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

  if p_forma_pagamento = 'pix' then
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

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para, taxa_entrega, pagamento_status)
  values (v_estabelecimento_id, case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end, 'app', 'novo', v_enviar_cozinha, case when v_enviar_cozinha then now() else null end, v_cliente_id, v_observacoes, p_forma_recebimento, p_forma_pagamento, case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end, v_troco_para, v_taxa_entrega, case when p_forma_pagamento = 'pix' then 'pendente' else 'pendente' end)
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

  select total into v_total from pedidos where id = v_pedido_id;
  return jsonb_build_object(
    'id', v_pedido_id,
    'codigo', v_codigo,
    'estabelecimentoId', v_estabelecimento_id,
    'notificar', p_notificar_pedido,
    'taxaEntrega', v_taxa_entrega,
    'total', v_total,
    'pixModo', case when p_forma_pagamento = 'pix' then v_pix_modo else null end,
    'aguardandoPagamento', not v_enviar_cozinha
  );
end;
$$;

revoke all on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid, text) from public;
grant execute on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid, text) to ohfome_app;

-- Itens de Pix automático não podem baixar estoque antes do pagamento. A
-- baixa acontece na mesma transação que confirma o Pix, pela função abaixo.
create or replace function baixar_estoque_item_pedido() returns trigger as $$
declare
  v_baixar boolean;
begin
  select not (forma_pagamento = 'pix' and not enviado_cozinha)
    into v_baixar
    from pedidos
   where id = new.pedido_id;

  if coalesce(v_baixar, false) then
    insert into movimentacoes_estoque (insumo_id, tipo, quantidade, motivo, pedido_id)
    select pi.insumo_id, 'saida', pi.quantidade_necessaria * new.quantidade,
           'Baixa automatica - pedido', new.pedido_id
    from produto_insumos pi
    where pi.produto_id = new.produto_id;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function baixar_estoque_pedido_confirmado(p_pedido_id uuid) returns void as $$
begin
  if exists (select 1 from movimentacoes_estoque where pedido_id = p_pedido_id) then
    return;
  end if;
  insert into movimentacoes_estoque (insumo_id, tipo, quantidade, motivo, pedido_id)
  select pi.insumo_id, 'saida', pi.quantidade_necessaria * ip.quantidade,
         'Baixa automatica - Pix confirmado', p_pedido_id
  from itens_pedido ip
  join produto_insumos pi on pi.produto_id = ip.produto_id
  where ip.pedido_id = p_pedido_id and ip.status <> 'cancelado';
end;
$$ language plpgsql;

grant execute on function baixar_estoque_pedido_confirmado(uuid) to ohfome_app;

-- A rota de webhook não possui sessão. Ela usa esta função mínima somente
-- após validar a assinatura do Mercado Pago, para entrar no tenant correto.
create or replace function fn_estabelecimento_por_order_mercado_pago(p_order_id text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select estabelecimento_id from pagamentos_pix where order_id = p_order_id limit 1;
$$;

revoke all on function fn_estabelecimento_por_order_mercado_pago(text) from public;
grant execute on function fn_estabelecimento_por_order_mercado_pago(text) to ohfome_app;

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
  left join pagamentos_pix px on px.pedido_id = p.id
  where e.slug = p_slug and p.id = p_pedido_id and p.origem = 'app';
$$;
