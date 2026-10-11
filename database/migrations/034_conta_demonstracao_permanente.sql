begin;

-- A conta demonstrativa é a única que pode usar uma credencial de testes do
-- Mercado Pago. A separação fica no banco para que um erro de aplicação não
-- exponha nem reutilize essa credencial em outro estabelecimento.
alter table estabelecimentos
  add column if not exists demonstracao boolean not null default false;

alter table mercado_pago_conexoes
  add column if not exists ambiente text not null default 'producao';

alter table mercado_pago_conexoes
  drop constraint if exists chk_mercado_pago_conexoes_ambiente;
alter table mercado_pago_conexoes
  add constraint chk_mercado_pago_conexoes_ambiente
  check (ambiente in ('producao', 'teste'));

-- Tokens de teste não participam do OAuth e, portanto, não têm refresh nem
-- expiração OAuth. Conexões de produção continuam preenchendo esses campos.
alter table mercado_pago_conexoes
  alter column refresh_token_cifrado drop not null,
  alter column token_expira_em drop not null;

-- Mapa técnico da carga demo: impede que uma nova execução atualize um
-- produto criado manualmente apenas por ter o mesmo nome.
create table if not exists demonstracao_referencias (
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  tipo text not null,
  chave text not null,
  entidade_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (estabelecimento_id, tipo, chave)
);

drop trigger if exists trg_demonstracao_referencias_updated_at on demonstracao_referencias;
create trigger trg_demonstracao_referencias_updated_at
  before update on demonstracao_referencias
  for each row execute function set_updated_at();

alter table demonstracao_referencias enable row level security;
drop policy if exists tenant_isolation on demonstracao_referencias;
create policy tenant_isolation on demonstracao_referencias
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);
grant select, insert, update, delete on demonstracao_referencias to ohfome_app;

create or replace function validar_conexao_mercado_pago_teste()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.ambiente = 'teste' and not exists (
    select 1
      from estabelecimentos e
     where e.id = new.estabelecimento_id
       and e.demonstracao
       and e.slug = 'restauranteteste'
  ) then
    raise exception 'Credencial Mercado Pago de teste só pode ser usada pela conta demonstrativa restauranteteste'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.ambiente = 'teste'
     and new.estabelecimento_id is distinct from old.estabelecimento_id then
    raise exception 'Uma credencial Mercado Pago de teste não pode ser movida entre estabelecimentos'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_conexao_mercado_pago_teste on mercado_pago_conexoes;
create trigger trg_validar_conexao_mercado_pago_teste
  before insert or update on mercado_pago_conexoes
  for each row execute function validar_conexao_mercado_pago_teste();

create or replace function proteger_estabelecimento_demo_mercado_pago_teste()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
      from mercado_pago_conexoes mp
     where mp.estabelecimento_id = new.id
       and mp.ambiente = 'teste'
  ) and (not new.demonstracao or new.slug <> 'restauranteteste') then
    raise exception 'Não é possível remover a identidade demonstrativa enquanto existir credencial Mercado Pago de teste'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_estabelecimento_demo_mercado_pago_teste on estabelecimentos;
create trigger trg_proteger_estabelecimento_demo_mercado_pago_teste
  before update of demonstracao, slug on estabelecimentos
  for each row execute function proteger_estabelecimento_demo_mercado_pago_teste();

commit;
