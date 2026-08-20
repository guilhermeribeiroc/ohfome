-- Fila duravel para os tickets enviados pela estacao de cozinha via QZ Tray.

create table if not exists impressao_jobs (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  pedido_id uuid not null references pedidos(id) on delete cascade,
  tipo text not null default 'cozinha' check (tipo in ('cozinha')),
  origem text not null default 'automatico' check (origem in ('automatico', 'reimpressao')),
  status text not null default 'pendente' check (status in ('pendente', 'imprimindo', 'impresso', 'falhou')),
  tentativas integer not null default 0 check (tentativas >= 0),
  reservado_em timestamptz,
  impresso_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists idx_impressao_jobs_fila
  on impressao_jobs(estabelecimento_id, status, created_at);

create unique index if not exists uq_impressao_jobs_automatico
  on impressao_jobs(pedido_id)
  where origem = 'automatico' and tipo = 'cozinha';

create or replace function enfileirar_impressao_cozinha() returns trigger as $$
begin
  if new.enviado_cozinha and (tg_op = 'INSERT' or not old.enviado_cozinha) then
    insert into impressao_jobs (estabelecimento_id, pedido_id, tipo, origem)
    values (new.estabelecimento_id, new.id, 'cozinha', 'automatico')
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pedidos_impressao_cozinha on pedidos;
create trigger trg_pedidos_impressao_cozinha
  after insert or update of enviado_cozinha on pedidos
  for each row execute function enfileirar_impressao_cozinha();

alter table impressao_jobs enable row level security;
drop policy if exists tenant_isolation on impressao_jobs;
create policy tenant_isolation on impressao_jobs
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

grant select, insert, update, delete on impressao_jobs to ohfome_app;
