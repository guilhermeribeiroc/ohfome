begin;

alter table produtos add column tipo_produto text not null default 'padrao'
  check (tipo_produto in ('padrao', 'pizza'));

create table produto_configuracoes_pizza (
  produto_id uuid primary key references produtos(id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  regra_meio_a_meio text not null default 'maior_valor'
    check (regra_meio_a_meio in ('maior_valor', 'media', 'preco_fixo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (produto_id, estabelecimento_id)
);

create table pizza_tamanhos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produto_configuracoes_pizza(produto_id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 40),
  preco_sabor_unico numeric(10,2) not null check (preco_sabor_unico >= 0),
  preco_meio_a_meio numeric(10,2) check (preco_meio_a_meio >= 0),
  ativo boolean not null default true,
  ordem integer not null default 0,
  unique (id, estabelecimento_id)
);

create table pizza_sabores (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produto_configuracoes_pizza(produto_id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  descricao text,
  acrescimo numeric(10,2) not null default 0 check (acrescimo >= 0),
  ativo boolean not null default true,
  ordem integer not null default 0,
  unique (id, estabelecimento_id)
);

create table itens_pedido_pizza (
  item_pedido_id uuid primary key references itens_pedido(id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  tamanho_nome text not null,
  sabor_um_nome text not null,
  sabor_dois_nome text,
  regra_meio_a_meio text check (regra_meio_a_meio in ('maior_valor', 'media', 'preco_fixo')),
  preco_calculado numeric(10,2) not null check (preco_calculado >= 0),
  created_at timestamptz not null default now()
);

create index idx_pizza_tamanhos_produto on pizza_tamanhos(produto_id, ordem);
create index idx_pizza_sabores_produto on pizza_sabores(produto_id, ordem);

alter table produto_configuracoes_pizza enable row level security;
alter table pizza_tamanhos enable row level security;
alter table pizza_sabores enable row level security;
alter table itens_pedido_pizza enable row level security;
create policy tenant_isolation on produto_configuracoes_pizza using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid) with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on pizza_tamanhos using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid) with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on pizza_sabores using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid) with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on itens_pedido_pizza using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid) with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
grant select, insert, update, delete on produto_configuracoes_pizza, pizza_tamanhos, pizza_sabores, itens_pedido_pizza to ohfome_app;

commit;
