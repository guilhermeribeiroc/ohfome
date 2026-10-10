begin;

-- Reforça as invariantes que não podem depender somente da interface.
-- Esta migration aborta se encontrar dados antigos inconsistentes; não tenta
-- adivinhar qual valor o restaurante pretendia manter.

do $$
begin
  if exists (
    select 1 from pedidos
    where forma_pagamento = 'misto'
      and (pagamento_dividido is null
        or jsonb_typeof(pagamento_dividido) is distinct from 'array'
        or jsonb_array_length(case when jsonb_typeof(pagamento_dividido) = 'array' then pagamento_dividido else '[]'::jsonb end) <> 2)
  ) then
    raise exception 'Migration 032 abortada: há pedidos com pagamento misto sem exatamente duas partes válidas.';
  end if;

  if exists (
    select 1 from pedidos
    where forma_pagamento is distinct from 'misto' and pagamento_dividido is not null
  ) then
    raise exception 'Migration 032 abortada: há detalhes de pagamento dividido em pedidos que não são mistos.';
  end if;

  if exists (
    select 1 from itens_pedido ip
    join pedidos p on p.id = ip.pedido_id
    join produtos pr on pr.id = ip.produto_id
    where p.estabelecimento_id <> pr.estabelecimento_id
  ) then
    raise exception 'Migration 032 abortada: há itens de pedido usando produtos de outro estabelecimento.';
  end if;

  if exists (
    select 1 from produto_insumos pi
    join produtos p on p.id = pi.produto_id
    join insumos i on i.id = pi.insumo_id
    where p.estabelecimento_id <> i.estabelecimento_id
  ) then
    raise exception 'Migration 032 abortada: há fichas técnicas cruzando estabelecimentos.';
  end if;
end;
$$;

alter table pedidos drop constraint if exists chk_pedido_pagamento_dividido;
alter table pedidos drop constraint if exists pedidos_pagamento_dividido_check;
alter table pedidos add constraint chk_pedido_pagamento_dividido check (
  (forma_pagamento = 'misto'
    and pagamento_dividido is not null
    and jsonb_typeof(pagamento_dividido) = 'array'
    and jsonb_array_length(case when jsonb_typeof(pagamento_dividido) = 'array' then pagamento_dividido else '[]'::jsonb end) = 2)
  or (forma_pagamento is distinct from 'misto' and pagamento_dividido is null)
);

create unique index if not exists uq_pedidos_id_estabelecimento on pedidos(id, estabelecimento_id);
create unique index if not exists uq_produtos_id_estabelecimento on produtos(id, estabelecimento_id);
create unique index if not exists uq_insumos_id_estabelecimento on insumos(id, estabelecimento_id);

alter table itens_pedido add column if not exists estabelecimento_id uuid;
create or replace function preencher_tenant_item_pedido() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.estabelecimento_id is null then
    select estabelecimento_id into new.estabelecimento_id from pedidos where id = new.pedido_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_itens_pedido_tenant on itens_pedido;
create trigger trg_itens_pedido_tenant before insert or update of pedido_id, estabelecimento_id
  on itens_pedido for each row execute function preencher_tenant_item_pedido();
update itens_pedido ip set estabelecimento_id = p.estabelecimento_id
from pedidos p where p.id = ip.pedido_id and ip.estabelecimento_id is null;
alter table itens_pedido alter column estabelecimento_id set not null;
alter table itens_pedido drop constraint if exists fk_itens_pedido_pedido_tenant;
alter table itens_pedido drop constraint if exists fk_itens_pedido_produto_tenant;
alter table itens_pedido add constraint fk_itens_pedido_pedido_tenant
  foreign key (pedido_id, estabelecimento_id) references pedidos(id, estabelecimento_id) on delete cascade;
alter table itens_pedido add constraint fk_itens_pedido_produto_tenant
  foreign key (produto_id, estabelecimento_id) references produtos(id, estabelecimento_id);

alter table produto_insumos add column if not exists estabelecimento_id uuid;
create or replace function preencher_tenant_produto_insumo() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.estabelecimento_id is null then
    select estabelecimento_id into new.estabelecimento_id from produtos where id = new.produto_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_produto_insumos_tenant on produto_insumos;
create trigger trg_produto_insumos_tenant before insert or update of produto_id, estabelecimento_id
  on produto_insumos for each row execute function preencher_tenant_produto_insumo();
update produto_insumos pi set estabelecimento_id = p.estabelecimento_id
from produtos p where p.id = pi.produto_id and pi.estabelecimento_id is null;
alter table produto_insumos alter column estabelecimento_id set not null;
alter table produto_insumos drop constraint if exists fk_produto_insumos_produto_tenant;
alter table produto_insumos drop constraint if exists fk_produto_insumos_insumo_tenant;
alter table produto_insumos add constraint fk_produto_insumos_produto_tenant
  foreign key (produto_id, estabelecimento_id) references produtos(id, estabelecimento_id) on delete cascade;
alter table produto_insumos add constraint fk_produto_insumos_insumo_tenant
  foreign key (insumo_id, estabelecimento_id) references insumos(id, estabelecimento_id) on delete restrict;

-- Rate limit persistente, compartilhado entre processos/replicas. A chave
-- guardada é hash do usuário normalizado, nunca o nome em texto claro.
create table if not exists api_rate_limits (
  escopo text not null,
  chave_hash text not null,
  janela_inicio timestamptz not null,
  contagem integer not null check (contagem > 0),
  primary key (escopo, chave_hash)
);

create or replace function fn_consumir_rate_limit(
  p_escopo text,
  p_chave_hash text,
  p_limite integer,
  p_janela_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contagem integer;
begin
  insert into api_rate_limits (escopo, chave_hash, janela_inicio, contagem)
  values (p_escopo, p_chave_hash, now(), 1)
  on conflict (escopo, chave_hash) do update
    set janela_inicio = case
          when api_rate_limits.janela_inicio <= now() - make_interval(secs => p_janela_segundos) then now()
          else api_rate_limits.janela_inicio
        end,
        contagem = case
          when api_rate_limits.janela_inicio <= now() - make_interval(secs => p_janela_segundos) then 1
          else api_rate_limits.contagem + 1
        end
  returning contagem into v_contagem;

  delete from api_rate_limits where janela_inicio < now() - interval '1 day';

  return v_contagem <= p_limite;
end;
$$;

revoke all on function fn_consumir_rate_limit(text, text, integer, integer) from public;
grant execute on function fn_consumir_rate_limit(text, text, integer, integer) to ohfome_app;

-- Elimina somente contadores expirados; a operação é limitada por escopo.
create or replace function fn_limpar_rate_limits(p_escopo text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from api_rate_limits
  where escopo = p_escopo and janela_inicio < now() - interval '1 day';
$$;
revoke all on function fn_limpar_rate_limits(text) from public;
grant execute on function fn_limpar_rate_limits(text) to ohfome_app;

commit;
