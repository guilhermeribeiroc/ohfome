do $$ begin
  create type financeiro_movimento_tipo as enum ('entrada', 'saida');
exception when duplicate_object then null;
end $$;

create table if not exists movimentacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  tipo financeiro_movimento_tipo not null,
  categoria text not null,
  descricao text not null,
  valor numeric(12, 2) not null check (valor > 0),
  data_movimento date not null default current_date,
  usuario_id uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_movimentacoes_financeiras_data on movimentacoes_financeiras(data_movimento desc);
create index if not exists idx_movimentacoes_financeiras_tipo on movimentacoes_financeiras(tipo, data_movimento desc);

create table if not exists custos_fixos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  descricao text not null,
  valor_mensal numeric(12, 2) not null check (valor_mensal > 0),
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_custos_fixos_updated_at on custos_fixos;
create trigger trg_custos_fixos_updated_at
  before update on custos_fixos
  for each row execute function set_updated_at();
