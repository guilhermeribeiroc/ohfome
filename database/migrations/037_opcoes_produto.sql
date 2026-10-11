begin;

create table produto_grupos_opcoes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  minimo_selecoes integer not null default 0 check (minimo_selecoes >= 0),
  maximo_selecoes integer not null default 1 check (maximo_selecoes >= 1 and maximo_selecoes >= minimo_selecoes),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, estabelecimento_id)
);

create table produto_opcoes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  grupo_id uuid not null references produto_grupos_opcoes(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 80),
  acrescimo numeric(10,2) not null default 0 check (acrescimo >= 0),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, estabelecimento_id)
);

create table itens_pedido_opcoes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  item_pedido_id uuid not null references itens_pedido(id) on delete cascade,
  grupo_nome text not null,
  opcao_nome text not null,
  acrescimo numeric(10,2) not null check (acrescimo >= 0),
  created_at timestamptz not null default now()
);

create index idx_produto_grupos_opcoes_produto on produto_grupos_opcoes(produto_id, ordem);
create index idx_produto_opcoes_grupo on produto_opcoes(grupo_id, ordem);
create index idx_itens_pedido_opcoes_item on itens_pedido_opcoes(item_pedido_id);

alter table produto_grupos_opcoes enable row level security;
alter table produto_opcoes enable row level security;
alter table itens_pedido_opcoes enable row level security;
create policy tenant_isolation on produto_grupos_opcoes using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid) with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on produto_opcoes using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid) with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
create policy tenant_isolation on itens_pedido_opcoes using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid) with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
grant select, insert, update, delete on produto_grupos_opcoes, produto_opcoes, itens_pedido_opcoes to ohfome_app;

commit;
