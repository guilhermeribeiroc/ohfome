begin;

-- Crediário (fiado) para clientes fixos.
--  * clientes.crediario liga o crediário para o cliente; limite_crediario é opcional (vazio = sem limite).
--  * Forma de pagamento 'crediario' nos pedidos: a venda conta na hora, mas o dinheiro só entra quando o
--    cliente paga (crediario_pagamentos, aceita pagamento parcial).
--  * O saldo de cada cliente = pedidos no crediário (não cancelados) - pagamentos recebidos. Não é guardado:
--    é calculado, então continua certo mesmo se o pedido for editado ou cancelado.

alter table clientes add column if not exists crediario boolean not null default false;
alter table clientes add column if not exists limite_crediario numeric(10, 2);
alter table clientes drop constraint if exists clientes_limite_crediario_check;
alter table clientes add constraint clientes_limite_crediario_check check (limite_crediario is null or limite_crediario > 0);

-- Aceita 'crediario' na forma de pagamento do pedido (apaga o check antigo, qualquer que seja o nome).
do $$
declare
  v_nome text;
begin
  for v_nome in
    select c.conname from pg_constraint c
    where c.conrelid = 'pedidos'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%forma_pagamento%' and pg_get_constraintdef(c.oid) like '%''misto''%'
      and pg_get_constraintdef(c.oid) not like '%pagamento_dividido%'
  loop
    execute format('alter table pedidos drop constraint %I', v_nome);
  end loop;
end $$;

alter table pedidos add constraint pedidos_forma_pagamento_check
  check (forma_pagamento is null or forma_pagamento in ('cartao', 'dinheiro', 'pix', 'misto', 'crediario'));

create table if not exists crediario_pagamentos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete restrict,
  valor numeric(10, 2) not null check (valor > 0),
  forma_pagamento text not null check (forma_pagamento in ('dinheiro', 'pix', 'cartao')),
  observacao text,
  usuario_id uuid references usuarios(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_crediario_pagamentos_cliente on crediario_pagamentos(estabelecimento_id, cliente_id, created_at desc);

alter table crediario_pagamentos enable row level security;
drop policy if exists tenant_isolation on crediario_pagamentos;
create policy tenant_isolation on crediario_pagamentos
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
grant select, insert, update, delete on crediario_pagamentos to ohfome_app;

commit;
