begin;

-- Operação presencial, estoque de produtos acabados e expedição. Esta
-- migration é aditiva: produtos atuais continuam sem controle unitário até o
-- responsável ativá-lo e informar uma contagem física.

alter table produtos
  add column if not exists controla_estoque_unidades boolean not null default false;

alter table clientes alter column telefone drop not null;

alter table pedidos
  add column if not exists modalidade_atendimento text not null default 'preparo'
    check (modalidade_atendimento in ('preparo', 'imediata'));

alter table entregadores
  add column if not exists ativo boolean not null default true;

create table if not exists estoque_produtos (
  produto_id uuid not null,
  estabelecimento_id uuid not null,
  saldo_fisico integer not null default 0 check (saldo_fisico >= 0),
  updated_at timestamptz not null default now(),
  primary key (produto_id, estabelecimento_id),
  constraint fk_estoque_produtos_produto_tenant
    foreign key (produto_id, estabelecimento_id)
    references produtos(id, estabelecimento_id) on delete cascade
);

create table if not exists movimentacoes_estoque_produtos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  produto_id uuid not null,
  pedido_id uuid references pedidos(id) on delete restrict,
  usuario_id uuid references usuarios(id),
  tipo text not null check (tipo in ('entrada', 'ajuste', 'compromisso', 'consumo', 'liberacao')),
  quantidade integer not null check (quantidade > 0),
  motivo text,
  saldo_fisico_resultante integer,
  created_at timestamptz not null default now(),
  constraint fk_movimentacoes_estoque_produto_tenant
    foreign key (produto_id, estabelecimento_id)
    references produtos(id, estabelecimento_id) on delete restrict
);

create index if not exists idx_mov_estoque_produtos_tenant_produto
  on movimentacoes_estoque_produtos(estabelecimento_id, produto_id, created_at desc);

create table if not exists estoque_compromissos_produtos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  pedido_id uuid not null,
  item_pedido_id uuid not null unique references itens_pedido(id) on delete restrict,
  produto_id uuid not null,
  quantidade integer not null check (quantidade > 0),
  status text not null check (status in ('reservado', 'comprometido', 'consumido', 'liberado')),
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fk_compromisso_pedido_tenant
    foreign key (pedido_id, estabelecimento_id)
    references pedidos(id, estabelecimento_id) on delete restrict,
  constraint fk_compromisso_produto_tenant
    foreign key (produto_id, estabelecimento_id)
    references produtos(id, estabelecimento_id) on delete restrict
);

create index if not exists idx_compromissos_estoque_ativos
  on estoque_compromissos_produtos(estabelecimento_id, produto_id)
  where status in ('reservado', 'comprometido');
create index if not exists idx_compromissos_estoque_pedido
  on estoque_compromissos_produtos(pedido_id);

create table if not exists pedidos_idempotencia (
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  chave text not null check (length(chave) between 16 and 200),
  hash_conteudo text not null,
  pedido_id uuid not null references pedidos(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (estabelecimento_id, chave)
);

create or replace function atualizar_estoque_produtos_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_estoque_produtos_updated_at on estoque_produtos;
create trigger trg_estoque_produtos_updated_at
  before update on estoque_produtos
  for each row execute function atualizar_estoque_produtos_updated_at();

create or replace function validar_estoque_unitario_produto() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.controla_estoque_unidades and exists (
    select 1 from produto_insumos where produto_id = new.id
  ) then
    raise exception 'Produto com ficha técnica não pode usar estoque por unidade' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_produtos_estoque_unitario on produtos;
create trigger trg_produtos_estoque_unitario
  before update of controla_estoque_unidades on produtos
  for each row execute function validar_estoque_unitario_produto();

create or replace function validar_ficha_tecnica_produto_unitario() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from produtos where id = new.produto_id and controla_estoque_unidades) then
    raise exception 'Desative o estoque por unidade antes de adicionar ficha técnica' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ficha_tecnica_produto_unitario on produto_insumos;
create trigger trg_ficha_tecnica_produto_unitario
  before insert or update of produto_id on produto_insumos
  for each row execute function validar_ficha_tecnica_produto_unitario();

create or replace function fn_disponibilidade_produto(p_estabelecimento_id uuid, p_produto_id uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select ep.saldo_fisico - coalesce(sum(ec.quantidade) filter (where ec.status in ('reservado', 'comprometido')), 0)::integer
  from estoque_produtos ep
  left join estoque_compromissos_produtos ec
    on ec.produto_id = ep.produto_id and ec.estabelecimento_id = ep.estabelecimento_id
  where ep.estabelecimento_id = p_estabelecimento_id and ep.produto_id = p_produto_id
  group by ep.saldo_fisico;
$$;

create or replace function fn_movimentar_estoque_produto(
  p_estabelecimento_id uuid,
  p_produto_id uuid,
  p_operacao text,
  p_quantidade integer,
  p_usuario_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_saldo integer;
  v_saldo_anterior integer;
  v_comprometido integer;
begin
  if p_operacao not in ('entrada', 'ajuste') or p_quantidade < 0 then
    raise exception 'Movimentação inválida' using errcode = '22023';
  end if;

  select saldo_fisico into v_saldo
  from estoque_produtos
  where estabelecimento_id = p_estabelecimento_id and produto_id = p_produto_id
  for update;
  if not found then
    raise exception 'Estoque unitário não está habilitado para este produto' using errcode = 'P0002';
  end if;
  v_saldo_anterior := v_saldo;

  select coalesce(sum(quantidade), 0)::integer into v_comprometido
  from estoque_compromissos_produtos
  where estabelecimento_id = p_estabelecimento_id and produto_id = p_produto_id
    and status in ('reservado', 'comprometido');

  if p_operacao = 'entrada' and p_quantidade = 0 then
    return jsonb_build_object('saldoFisico', v_saldo, 'comprometido', v_comprometido, 'disponivel', v_saldo - v_comprometido);
  end if;

  if p_operacao = 'entrada' then
    v_saldo := v_saldo + p_quantidade;
  elsif p_quantidade < v_comprometido then
    raise exception 'A contagem física não pode ser menor que as unidades comprometidas' using errcode = '23514';
  else
    v_saldo := p_quantidade;
  end if;

  if p_operacao = 'ajuste' and v_saldo = v_saldo_anterior then
    return jsonb_build_object('saldoFisico', v_saldo, 'comprometido', v_comprometido, 'disponivel', v_saldo - v_comprometido);
  end if;

  update estoque_produtos set saldo_fisico = v_saldo
  where estabelecimento_id = p_estabelecimento_id and produto_id = p_produto_id;
  insert into movimentacoes_estoque_produtos
    (estabelecimento_id, produto_id, usuario_id, tipo, quantidade, motivo, saldo_fisico_resultante)
  values (
    p_estabelecimento_id, p_produto_id, p_usuario_id, p_operacao,
    case when p_operacao = 'entrada' then p_quantidade else abs(v_saldo - v_saldo_anterior) end,
    p_motivo, v_saldo
  );
  return jsonb_build_object('saldoFisico', v_saldo, 'comprometido', v_comprometido, 'disponivel', v_saldo - v_comprometido);
end;
$$;

create or replace function fn_comprometer_estoque_pedido(p_pedido_id uuid, p_status text default 'comprometido')
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item record;
  v_saldo integer;
  v_disponivel integer;
  v_estabelecimento_id uuid;
begin
  if p_status not in ('reservado', 'comprometido') then
    raise exception 'Status de compromisso inválido' using errcode = '22023';
  end if;
  select estabelecimento_id into v_estabelecimento_id from pedidos where id = p_pedido_id;
  if v_estabelecimento_id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;

  for v_item in
    select ip.id as item_id, ip.produto_id, ip.quantidade
    from itens_pedido ip
    join produtos p on p.id = ip.produto_id and p.estabelecimento_id = v_estabelecimento_id
    where ip.pedido_id = p_pedido_id and p.controla_estoque_unidades
    order by ip.produto_id, ip.id
  loop
    if exists (select 1 from estoque_compromissos_produtos where item_pedido_id = v_item.item_id) then
      continue;
    end if;
    select saldo_fisico into v_saldo from estoque_produtos
    where estabelecimento_id = v_estabelecimento_id and produto_id = v_item.produto_id
    for update;
    if not found then
      raise exception 'Estoque unitário não configurado para o produto' using errcode = '23514';
    end if;
    select v_saldo - coalesce(sum(quantidade), 0)::integer into v_disponivel
    from estoque_compromissos_produtos
    where estabelecimento_id = v_estabelecimento_id and produto_id = v_item.produto_id
      and status in ('reservado', 'comprometido');
    if v_disponivel < v_item.quantidade then
      raise exception 'Estoque insuficiente para o produto solicitado' using errcode = '23514';
    end if;
    insert into estoque_compromissos_produtos
      (estabelecimento_id, pedido_id, item_pedido_id, produto_id, quantidade, status)
    values (v_estabelecimento_id, p_pedido_id, v_item.item_id, v_item.produto_id, v_item.quantidade, p_status);
    insert into movimentacoes_estoque_produtos
      (estabelecimento_id, produto_id, pedido_id, tipo, quantidade, motivo, saldo_fisico_resultante)
    values (v_estabelecimento_id, v_item.produto_id, p_pedido_id, 'compromisso', v_item.quantidade, 'Reserva para pedido', v_saldo);
  end loop;
end;
$$;

create or replace function fn_consumir_estoque_pedido(p_pedido_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_compromisso record; v_saldo integer;
begin
  for v_compromisso in
    select * from estoque_compromissos_produtos
    where pedido_id = p_pedido_id and status in ('reservado', 'comprometido')
    order by produto_id, id for update
  loop
    select saldo_fisico into v_saldo from estoque_produtos
    where produto_id = v_compromisso.produto_id and estabelecimento_id = v_compromisso.estabelecimento_id
    for update;
    if v_saldo < v_compromisso.quantidade then
      raise exception 'Saldo físico inconsistente ao consumir estoque' using errcode = '23514';
    end if;
    update estoque_produtos set saldo_fisico = saldo_fisico - v_compromisso.quantidade
    where produto_id = v_compromisso.produto_id and estabelecimento_id = v_compromisso.estabelecimento_id;
    update estoque_compromissos_produtos set status = 'consumido', atualizado_em = now() where id = v_compromisso.id;
    insert into movimentacoes_estoque_produtos
      (estabelecimento_id, produto_id, pedido_id, tipo, quantidade, motivo, saldo_fisico_resultante)
    values (v_compromisso.estabelecimento_id, v_compromisso.produto_id, p_pedido_id, 'consumo', v_compromisso.quantidade, 'Consumo do pedido', v_saldo - v_compromisso.quantidade);
  end loop;
end;
$$;

create or replace function fn_liberar_estoque_pedido(p_pedido_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_compromisso record; v_saldo integer;
begin
  for v_compromisso in
    select * from estoque_compromissos_produtos
    where pedido_id = p_pedido_id and status in ('reservado', 'comprometido')
    order by produto_id, id for update
  loop
    select saldo_fisico into v_saldo from estoque_produtos
    where produto_id = v_compromisso.produto_id and estabelecimento_id = v_compromisso.estabelecimento_id for update;
    update estoque_compromissos_produtos set status = 'liberado', atualizado_em = now() where id = v_compromisso.id;
    insert into movimentacoes_estoque_produtos
      (estabelecimento_id, produto_id, pedido_id, tipo, quantidade, motivo, saldo_fisico_resultante)
    values (v_compromisso.estabelecimento_id, v_compromisso.produto_id, p_pedido_id, 'liberacao', v_compromisso.quantidade, 'Cancelamento antes do preparo', v_saldo);
  end loop;
end;
$$;

-- Toda inserção de item, inclusive pedidos públicos e adicionais, passa pelo
-- mesmo compromisso transacional. Repetir a chamada pelo serviço é seguro:
-- a unicidade por item impede uma segunda reserva.
create or replace function comprometer_estoque_ao_inserir_item() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform fn_comprometer_estoque_pedido(new.pedido_id, 'comprometido');
  return new;
end;
$$;
drop trigger if exists trg_itens_pedido_compromete_estoque_produto on itens_pedido;
create trigger trg_itens_pedido_compromete_estoque_produto
  after insert on itens_pedido
  for each row execute function comprometer_estoque_ao_inserir_item();

create or replace function fn_cardapio_publico(p_slug text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
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
    'pix', (select case when cp.ativo then jsonb_build_object('modo', cp.modo) else null end from configuracoes_pix cp where cp.estabelecimento_id = e.id),
    'banners', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'url', b.url, 'ordem', b.ordem, 'enquadramento', b.enquadramento) order by b.ordem) from banners_cardapio b where b.estabelecimento_id = e.id and b.ativo), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'tamanho', p.tamanho, 'descricao', p.descricao,
        'imagemUrl', p.imagem_url, 'categoriaNome', coalesce(c.nome, 'Geral'), 'precoVenda', p.preco_venda,
        'controlaEstoqueUnidades', p.controla_estoque_unidades,
        'estoqueDisponivel', case when p.controla_estoque_unidades then fn_disponibilidade_produto(e.id, p.id) else null end
      ) order by coalesce(c.ordem_exibicao, 0), p.nome, p.tamanho)
      from produtos p left join categorias_produto c on c.id = p.categoria_id
      where p.estabelecimento_id = e.id and p.ativo
    ), '[]'::jsonb)
  )
  from estabelecimentos e
  where e.slug = p_slug and e.ativo;
$$;

create or replace function fn_disponibilidade_produtos_publico(p_slug text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(jsonb_object_agg(p.id::text, case when p.controla_estoque_unidades then fn_disponibilidade_produto(e.id, p.id) else null end), '{}'::jsonb)
  from estabelecimentos e
  join produtos p on p.estabelecimento_id = e.id and p.ativo
  where e.slug = p_slug and e.ativo;
$$;

alter table estoque_produtos enable row level security;
alter table movimentacoes_estoque_produtos enable row level security;
alter table estoque_compromissos_produtos enable row level security;
alter table pedidos_idempotencia enable row level security;
create policy tenant_isolation on estoque_produtos
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on movimentacoes_estoque_produtos
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on estoque_compromissos_produtos
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on pedidos_idempotencia
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

revoke all on function fn_disponibilidade_produto(uuid, uuid) from public;
revoke all on function fn_movimentar_estoque_produto(uuid, uuid, text, integer, uuid, text) from public;
revoke all on function fn_comprometer_estoque_pedido(uuid, text) from public;
revoke all on function fn_consumir_estoque_pedido(uuid) from public;
revoke all on function fn_liberar_estoque_pedido(uuid) from public;
revoke all on function fn_disponibilidade_produtos_publico(text) from public;
grant execute on function fn_disponibilidade_produto(uuid, uuid) to ohfome_app;
grant execute on function fn_movimentar_estoque_produto(uuid, uuid, text, integer, uuid, text) to ohfome_app;
grant execute on function fn_comprometer_estoque_pedido(uuid, text) to ohfome_app;
grant execute on function fn_consumir_estoque_pedido(uuid) to ohfome_app;
grant execute on function fn_liberar_estoque_pedido(uuid) to ohfome_app;
grant execute on function fn_disponibilidade_produtos_publico(text) to ohfome_app;

commit;
