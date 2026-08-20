-- ============================================================================
-- OhFome — Schema PostgreSQL
-- Plataforma multi-tenant de gestao para redes de estabelecimentos de comida
-- (churrascarias, pizzarias, hamburguerias, etc): pedidos, mesas/garcom,
-- estoque/precificacao e delivery, com dados isolados por estabelecimento.
-- Requer PostgreSQL 14+
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists unaccent; -- usado para gerar o slug do cardapio publico

-- ============================================================================
-- ENUMS
-- ============================================================================

-- 'entregador' = motoboy/entregador cadastrado em entregadores (pode ou nao
-- ter login). 'delivery' = usuario que opera o painel/dashboard de delivery.
-- 'site' = usuario que administra o cardapio digital/pedidos do site.
create type user_role as enum (
  'admin', 'garcom', 'cozinha', 'balcao', 'estoque', 'delivery', 'site', 'entregador', 'caixa'
);

create type mesa_status as enum ('livre', 'ocupada', 'aguardando_conta', 'reservada');

create type comanda_status as enum ('aberta', 'fechada');

create type pedido_tipo as enum ('mesa', 'balcao', 'delivery');

create type pedido_origem as enum ('presencial', 'whatsapp', 'telefone', 'app');

create type pedido_status as enum (
  'novo', 'em_preparo', 'pronto', 'saiu_para_entrega', 'finalizado', 'cancelado'
);

create type item_pedido_status as enum ('pendente', 'em_preparo', 'pronto', 'entregue', 'cancelado');

create type unidade_medida as enum ('kg', 'g', 'l', 'ml', 'un', 'cx', 'pct');

create type movimentacao_tipo as enum ('entrada', 'saida', 'ajuste', 'perda');

create type modo_precificacao as enum ('margem', 'preco_manual');

create type entrega_status as enum ('aguardando', 'em_rota', 'entregue', 'cancelada');

create type destino_preparo as enum ('cozinha', 'balcao');

create type financeiro_movimento_tipo as enum ('entrada', 'saida');

create type tipo_estabelecimento as enum (
  'churrascaria', 'pizzaria', 'hamburgueria', 'japonesa', 'padaria_cafeteria', 'sorveteria', 'outro'
);

create type modulo_sistema as enum ('balcao', 'cozinha', 'garcom', 'estoque', 'delivery', 'site');

-- ============================================================================
-- FUNCOES DE APOIO
-- ============================================================================

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- ESTABELECIMENTOS (tenants) — cada rede/restaurante cadastrado na OhFome.
-- Toda tabela abaixo marcada com estabelecimento_id pertence a um unico
-- estabelecimento; os dados de um nunca aparecem para outro.
-- ============================================================================

create table estabelecimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo tipo_estabelecimento not null,
  tipo_comida text not null,
  -- usado na URL publica do cardapio digital: ohfome.app/cardapio/<slug>
  slug text not null unique,
  logo_url text,
  whatsapp_atendimento text,
  onboarding_concluido boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_estabelecimentos_updated_at
  before update on estabelecimentos
  for each row execute function set_updated_at();

-- Modulos que o estabelecimento contratou/ativou (balcao, cozinha, garcom,
-- estoque, delivery). A presenca da linha indica que o modulo esta ativo;
-- o app so exibe navegacao e permite acesso aos modulos aqui listados.
create table estabelecimento_modulos (
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  modulo modulo_sistema not null,
  ativado_em timestamptz not null default now(),
  primary key (estabelecimento_id, modulo)
);

-- Configuracoes/estado por estabelecimento (ex.: alerta sonoro ligado,
-- horario de funcionamento, mensagem padrao do WhatsApp).
create table estado_aplicacao (
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  chave text not null,
  valor jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (estabelecimento_id, chave)
);

-- ============================================================================
-- USUARIOS (equipe: garcom, cozinha, balcao, entregador, admin, caixa)
-- ============================================================================

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null,
  -- O usuario identifica a conta no login, sem exigir a escolha do
  -- estabelecimento. E unico em toda a plataforma.
  usuario text unique not null,
  -- Mantido opcionalmente para contato e compatibilidade com contas antigas.
  email text unique,
  senha_hash text not null,
  telefone text,
  role user_role not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_usuarios_estabelecimento on usuarios(estabelecimento_id);

create trigger trg_usuarios_updated_at
  before update on usuarios
  for each row execute function set_updated_at();

-- ============================================================================
-- FINANCEIRO
-- ============================================================================

create table movimentacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  tipo financeiro_movimento_tipo not null,
  categoria text not null,
  descricao text not null,
  valor numeric(12, 2) not null check (valor > 0),
  data_movimento date not null default current_date,
  usuario_id uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index idx_movimentacoes_financeiras_estabelecimento on movimentacoes_financeiras(estabelecimento_id, data_movimento desc);
create index idx_movimentacoes_financeiras_tipo on movimentacoes_financeiras(estabelecimento_id, tipo, data_movimento desc);

create table custos_fixos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  categoria text not null,
  descricao text not null,
  valor_mensal numeric(12, 2) not null check (valor_mensal > 0),
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_custos_fixos_estabelecimento on custos_fixos(estabelecimento_id);

create trigger trg_custos_fixos_updated_at
  before update on custos_fixos
  for each row execute function set_updated_at();

-- ============================================================================
-- MESAS
-- ============================================================================

create table mesas (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  numero integer not null,
  capacidade integer not null default 4 check (capacidade > 0),
  status mesa_status not null default 'livre',
  posicao_x integer, -- coordenadas para o layout visual do salao
  posicao_y integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estabelecimento_id, numero)
);

create index idx_mesas_estabelecimento on mesas(estabelecimento_id);

create trigger trg_mesas_updated_at
  before update on mesas
  for each row execute function set_updated_at();

-- Uma comanda representa a "visita" de uma mesa: abre quando o primeiro
-- pedido e lancado e fecha quando a conta e paga. Permite varias rodadas
-- de pedidos na mesma mesa sem perder o historico consolidado.
create table comandas (
  id uuid primary key default gen_random_uuid(),
  mesa_id uuid not null references mesas(id),
  garcom_id uuid references usuarios(id),
  status comanda_status not null default 'aberta',
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  valor_total numeric(10, 2) not null default 0
);

create index idx_comandas_mesa_status on comandas(mesa_id, status);

-- Garante no maximo uma comanda aberta por mesa ao mesmo tempo
create unique index uq_comandas_mesa_aberta on comandas(mesa_id) where status = 'aberta';

-- ============================================================================
-- CARDAPIO / PRODUTOS
-- ============================================================================

create table categorias_produto (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null,
  ordem_exibicao integer not null default 0,
  unique (estabelecimento_id, nome)
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  categoria_id uuid references categorias_produto(id),
  nome text not null,
  descricao text,
  imagem_url text,
  -- --- precificacao inteligente ---
  -- modo 'margem': preco_custo + margem_percentual definem preco_venda
  -- modo 'preco_manual': preco_venda e definido a mao e a margem e recalculada
  modo_precificacao modo_precificacao not null default 'margem',
  preco_custo numeric(10, 2) not null default 0 check (preco_custo >= 0),
  margem_percentual numeric(6, 2) not null default 0 check (margem_percentual >= 0),
  preco_venda numeric(10, 2) not null default 0 check (preco_venda >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_produtos_estabelecimento on produtos(estabelecimento_id);
create index idx_produtos_categoria on produtos(categoria_id);

-- Calculadora automatica de precificacao: recalcula o campo que nao foi
-- editado diretamente pelo usuario, conforme o modo escolhido.
--  - modo = 'margem'        -> preco_venda = preco_custo * (1 + margem/100)
--  - modo = 'preco_manual'  -> margem_percentual = (preco_venda - preco_custo) / preco_custo * 100
create function calcular_precificacao() returns trigger as $$
begin
  if new.modo_precificacao = 'margem' then
    new.preco_venda := round(new.preco_custo * (1 + new.margem_percentual / 100.0), 2);
  else
    if new.preco_custo > 0 then
      new.margem_percentual := round((new.preco_venda - new.preco_custo) / new.preco_custo * 100.0, 2);
    else
      new.margem_percentual := 0;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_produtos_precificacao
  before insert or update of preco_custo, margem_percentual, preco_venda, modo_precificacao
  on produtos
  for each row execute function calcular_precificacao();

create trigger trg_produtos_updated_at
  before update on produtos
  for each row execute function set_updated_at();

-- ============================================================================
-- ESTOQUE / INSUMOS
-- ============================================================================

create table insumos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null,
  unidade_medida unidade_medida not null,
  quantidade_estoque numeric(12, 3) not null default 0 check (quantidade_estoque >= 0),
  quantidade_minima numeric(12, 3) not null default 0 check (quantidade_minima >= 0),
  custo_unitario numeric(10, 4) not null default 0 check (custo_unitario >= 0),
  fornecedor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_insumos_estabelecimento on insumos(estabelecimento_id);

create trigger trg_insumos_updated_at
  before update on insumos
  for each row execute function set_updated_at();

-- Ficha tecnica: quais insumos (e em que quantidade) compoem um produto do cardapio.
create table produto_insumos (
  produto_id uuid not null references produtos(id) on delete cascade,
  insumo_id uuid not null references insumos(id) on delete restrict,
  quantidade_necessaria numeric(12, 3) not null check (quantidade_necessaria > 0),
  primary key (produto_id, insumo_id)
);

-- Recalcula automaticamente o custo do produto somando o custo dos insumos
-- da ficha tecnica, sempre que a receita ou o custo de um insumo mudar.
create function recalcular_custo_produto(p_produto_id uuid) returns void as $$
begin
  update produtos
  set preco_custo = coalesce((
    select sum(pi.quantidade_necessaria * i.custo_unitario)
    from produto_insumos pi
    join insumos i on i.id = pi.insumo_id
    where pi.produto_id = p_produto_id
  ), 0)
  where id = p_produto_id;
end;
$$ language plpgsql;

create function trg_recalcular_custo_from_receita() returns trigger as $$
begin
  perform recalcular_custo_produto(coalesce(new.produto_id, old.produto_id));
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_produto_insumos_custo
  after insert or update or delete on produto_insumos
  for each row execute function trg_recalcular_custo_from_receita();

create function trg_recalcular_custo_from_insumo() returns trigger as $$
begin
  if new.custo_unitario is distinct from old.custo_unitario then
    perform recalcular_custo_produto(pi.produto_id)
    from produto_insumos pi
    where pi.insumo_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_insumos_custo_propaga
  after update of custo_unitario on insumos
  for each row execute function trg_recalcular_custo_from_insumo();

-- Historico de todas as movimentacoes de estoque (entradas, saidas, ajustes, perdas)
create table movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references insumos(id),
  tipo movimentacao_tipo not null,
  quantidade numeric(12, 3) not null check (quantidade > 0),
  motivo text,
  pedido_id uuid, -- referencia opcional adicionada apos criacao de pedidos (fk abaixo)
  usuario_id uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index idx_movimentacoes_insumo on movimentacoes_estoque(insumo_id, created_at desc);

-- Aplica a movimentacao ao saldo do insumo automaticamente
create function aplicar_movimentacao_estoque() returns trigger as $$
declare
  v_saldo numeric(12, 3);
begin
  if new.tipo = 'entrada' then
    update insumos set quantidade_estoque = quantidade_estoque + new.quantidade where id = new.insumo_id;
  else
    update insumos
    set quantidade_estoque = quantidade_estoque - new.quantidade
    where id = new.insumo_id and quantidade_estoque >= new.quantidade
    returning quantidade_estoque into v_saldo;
    if not found then
      raise exception 'Estoque insuficiente para o insumo %', new.insumo_id using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_movimentacoes_aplica
  after insert on movimentacoes_estoque
  for each row execute function aplicar_movimentacao_estoque();

-- ============================================================================
-- CLIENTES (delivery)
-- ============================================================================

create table clientes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null,
  telefone text not null,
  endereco text,
  ponto_referencia text,
  cpf text,
  notificar_pedido boolean not null default false,
  created_at timestamptz not null default now(),
  unique (estabelecimento_id, telefone)
);

create index idx_clientes_estabelecimento on clientes(estabelecimento_id);

-- ============================================================================
-- PEDIDOS
-- ============================================================================

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  codigo serial unique, -- numero curto e legivel para exibir no painel/cozinha
  tipo pedido_tipo not null,
  origem pedido_origem not null default 'presencial',
  status pedido_status not null default 'novo',
  enviado_cozinha boolean not null default false,
  enviado_cozinha_em timestamptz,
  destino_preparo destino_preparo,
  comanda_id uuid references comandas(id), -- obrigatorio quando tipo = 'mesa'
  cliente_id uuid references clientes(id), -- usado quando tipo = 'delivery'
  usuario_id uuid references usuarios(id), -- quem lancou o pedido (garcom/balcao)
  observacoes text,
  forma_recebimento text check (forma_recebimento is null or forma_recebimento in ('entrega', 'retirada')),
  forma_pagamento text check (forma_pagamento is null or forma_pagamento in ('cartao', 'dinheiro', 'pix')),
  tipo_cartao text check (tipo_cartao is null or tipo_cartao in ('credito', 'debito')),
  troco_para numeric(10, 2) check (troco_para is null or troco_para > 0),
  pagamento_status text not null default 'pendente' check (pagamento_status in ('pendente', 'pago', 'falhou', 'estornado')),
  notificado_em timestamptz,
  notificado_mensagem text,
  subtotal numeric(10, 2) not null default 0,
  taxa_entrega numeric(10, 2) not null default 0,
  desconto numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_pedido_mesa_comanda check (
    (tipo = 'mesa' and comanda_id is not null) or (tipo <> 'mesa')
  ),
  constraint chk_pedido_delivery_cliente check (
    (tipo = 'delivery' and cliente_id is not null) or (tipo <> 'delivery')
  )
);

alter table movimentacoes_estoque
  add constraint fk_movimentacoes_pedido foreign key (pedido_id) references pedidos(id);

create index idx_pedidos_estabelecimento on pedidos(estabelecimento_id, status);
create index idx_pedidos_status on pedidos(status);
create index idx_pedidos_cozinha on pedidos(enviado_cozinha, status) where enviado_cozinha;
create index idx_pedidos_tipo on pedidos(tipo);
create index idx_pedidos_comanda on pedidos(comanda_id);
create index idx_pedidos_created_at on pedidos(created_at desc);

create trigger trg_pedidos_updated_at
  before update on pedidos
  for each row execute function set_updated_at();

create table itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(10, 2) not null, -- snapshot do preco de venda no momento do pedido
  observacoes text,
  status item_pedido_status not null default 'pendente',
  created_at timestamptz not null default now()
);

create index idx_itens_pedido_pedido on itens_pedido(pedido_id);

-- Auditoria: registra toda mudanca de status de um pedido (alimenta o Kanban)
create table historico_status_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  status_anterior pedido_status,
  status_novo pedido_status not null,
  usuario_id uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create function registrar_historico_status() returns trigger as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into historico_status_pedido (pedido_id, status_anterior, status_novo)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_pedidos_historico
  after insert or update of status on pedidos
  for each row execute function registrar_historico_status();

-- Notifica em tempo real (LISTEN/NOTIFY) o painel de balcao/cozinha a cada
-- pedido novo ou mudanca de status — dispensa dependencia de servico externo
-- de realtime para o Kanban tocar alerta sonoro/visual.
create function notificar_pedido() returns trigger as $$
begin
  perform pg_notify('pedidos_channel', json_build_object(
    'pedido_id', new.id,
    'codigo', new.codigo,
    'tipo', new.tipo,
    'status', new.status,
    'evento', case when tg_op = 'INSERT' then 'novo_pedido' else 'status_alterado' end
  )::text);
  return new;
end;
$$ language plpgsql;

create trigger trg_pedidos_notify
  after insert or update of status on pedidos
  for each row execute function notificar_pedido();

-- Baixa estoque automaticamente com base na ficha tecnica de cada item pedido
create function baixar_estoque_item_pedido() returns trigger as $$
begin
  insert into movimentacoes_estoque (insumo_id, tipo, quantidade, motivo, pedido_id)
  select pi.insumo_id, 'saida', pi.quantidade_necessaria * new.quantidade,
         'Baixa automatica - pedido', new.pedido_id
  from produto_insumos pi
  where pi.produto_id = new.produto_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_itens_pedido_baixa_estoque
  after insert on itens_pedido
  for each row execute function baixar_estoque_item_pedido();

-- Mantem subtotal/total do pedido (e da comanda) sincronizados com os itens
create function recalcular_totais_pedido(p_pedido_id uuid) returns void as $$
declare
  v_subtotal numeric(10, 2);
  v_comanda_id uuid;
begin
  select coalesce(sum(quantidade * preco_unitario), 0) into v_subtotal
  from itens_pedido where pedido_id = p_pedido_id and status <> 'cancelado';

  update pedidos
  set subtotal = v_subtotal,
      total = v_subtotal + taxa_entrega - desconto
  where id = p_pedido_id
  returning comanda_id into v_comanda_id;

  if v_comanda_id is not null then
    update comandas set valor_total = (
      select coalesce(sum(total), 0) from pedidos where comanda_id = v_comanda_id
    ) where id = v_comanda_id;
  end if;
end;
$$ language plpgsql;

create function trg_itens_pedido_totais() returns trigger as $$
begin
  perform recalcular_totais_pedido(coalesce(new.pedido_id, old.pedido_id));
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_itens_pedido_recalcula_totais
  after insert or update of quantidade, preco_unitario, status or delete on itens_pedido
  for each row execute function trg_itens_pedido_totais();

-- Mesa fica ocupada automaticamente quando uma comanda abre, e livre quando fecha
create function sincronizar_status_mesa() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update mesas set status = 'ocupada' where id = new.mesa_id;
  elsif new.status = 'fechada' and old.status = 'aberta' then
    update mesas set status = 'livre' where id = new.mesa_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_comandas_sincroniza_mesa
  after insert or update of status on comandas
  for each row execute function sincronizar_status_mesa();

-- ============================================================================
-- DELIVERY
-- ============================================================================

create table entregadores (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nome text not null,
  -- usuario_id e opcional: nem todo entregador precisa (ou tem) login no
  -- sistema; quando tem, aponta pra conta com role='entregador'.
  usuario_id uuid unique references usuarios(id),
  veiculo text,
  placa text,
  telefone text,
  disponivel boolean not null default true
);

create index idx_entregadores_estabelecimento on entregadores(estabelecimento_id);

create table entregas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references pedidos(id),
  entregador_id uuid references entregadores(id),
  status entrega_status not null default 'aguardando',
  endereco text not null,
  tempo_estimado_min integer,
  saiu_em timestamptz,
  entregue_em timestamptz,
  created_at timestamptz not null default now()
);

create index idx_entregas_status on entregas(status);
create index idx_entregas_entregador on entregas(entregador_id);

-- ============================================================================
-- WHATSAPP (log de mensagens recebidas para rastreabilidade e reprocessamento)
-- ============================================================================

create table whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  telefone_cliente text not null,
  mensagem_raw jsonb not null,
  pedido_id uuid references pedidos(id),
  processado boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_whatsapp_estabelecimento on whatsapp_mensagens(estabelecimento_id);
create index idx_whatsapp_processado on whatsapp_mensagens(processado) where not processado;

-- ============================================================================
-- VIEWS DE APOIO
-- ============================================================================

-- Alerta de estoque baixo (usado pelo modulo de estoque)
create view vw_estoque_baixo as
select id, estabelecimento_id, nome, unidade_medida, quantidade_estoque, quantidade_minima
from insumos
where quantidade_estoque <= quantidade_minima;

-- Painel Kanban: pedidos ativos com dados prontos para exibir nos cards
create view vw_painel_pedidos as
select
  p.id, p.estabelecimento_id, p.codigo, p.tipo, p.origem, p.status, p.total, p.created_at,
  m.numero as mesa_numero,
  c.nome as cliente_nome,
  u.nome as usuario_nome
from pedidos p
left join comandas cm on cm.id = p.comanda_id
left join mesas m on m.id = cm.mesa_id
left join clientes c on c.id = p.cliente_id
left join usuarios u on u.id = p.usuario_id
where p.status not in ('finalizado', 'cancelado')
order by p.created_at asc;

-- ============================================================================
-- ISOLAMENTO POR ESTABELECIMENTO (Row Level Security)
-- ============================================================================
-- Defesa em profundidade: mesmo que uma query do app esqueca o filtro por
-- estabelecimento_id, o Postgres nunca retorna nem grava linhas de outro
-- estabelecimento. A aplicacao define, por conexao/sessao, qual
-- estabelecimento esta autenticado:
--   select set_config('app.estabelecimento_id', '<uuid-do-estabelecimento>', false);
-- Rode isso logo apos autenticar o usuario, antes de qualquer outra query.

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'usuarios', 'mesas', 'categorias_produto', 'produtos', 'insumos',
    'clientes', 'pedidos', 'entregadores', 'movimentacoes_financeiras',
    'custos_fixos', 'whatsapp_mensagens', 'estado_aplicacao', 'estabelecimento_modulos'
  ]
  loop
    execute format('alter table %I enable row level security', tabela);
    execute format(
      'create policy tenant_isolation on %I using (estabelecimento_id = current_setting(''app.estabelecimento_id'', true)::uuid)
       with check (estabelecimento_id = current_setting(''app.estabelecimento_id'', true)::uuid)',
      tabela
    );
  end loop;
end $$;

-- comandas, itens_pedido, entregas, movimentacoes_estoque, produto_insumos e
-- historico_status_pedido nao tem estabelecimento_id proprio: elas so existem
-- presas a uma mesa/pedido/produto/insumo que ja e protegido acima, e o app
-- sempre acessa essas tabelas atraves desse relacionamento (ex.: itens de um
-- pedido buscados por pedido_id, nunca a tabela inteira). Se algum dia forem
-- consultadas isoladamente, adicione estabelecimento_id + policy nelas tambem.

-- A propria tabela estabelecimentos nao tem coluna estabelecimento_id (ela E
-- o tenant), entao usa a coluna id na policy. So enxerga a propria linha.
alter table estabelecimentos enable row level security;

create policy tenant_isolation on estabelecimentos
  using (id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (id = current_setting('app.estabelecimento_id', true)::uuid);

-- ============================================================================
-- AUTENTICACAO
-- ============================================================================
-- Login e cadastro de estabelecimento acontecem ANTES de existir uma sessao
-- com app.estabelecimento_id definido, entao uma query comum bloqueada por
-- RLS nao serviria. As duas funcoes abaixo sao SECURITY DEFINER: rodam com
-- os privilegios de quem as criou (dono das tabelas, que enxerga tudo por
-- ser o owner), mas expoem apenas a operacao especifica e o retorno minimo
-- necessario — a aplicacao nunca ganha acesso irrestrito as tabelas.

-- Busca uma conta pelo usuario (unico em toda a plataforma) para o login.
-- Devolve o hash da senha para o app comparar com bcrypt; nunca a senha em texto.
create function fn_autenticar(p_usuario text)
returns table (
  usuario_id uuid,
  estabelecimento_id uuid,
  nome text,
  senha_hash text,
  role user_role,
  usuario_ativo boolean,
  estabelecimento_ativo boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.estabelecimento_id, u.nome, u.senha_hash, u.role, u.ativo, e.ativo
  from usuarios u
  join estabelecimentos e on e.id = u.estabelecimento_id
  where u.usuario = lower(p_usuario);
$$;

revoke all on function fn_autenticar(text) from public;

-- Cria um estabelecimento novo com seus modulos e usuarios em uma unica
-- transacao atomica. As senhas ja chegam com hash bcrypt (calculado no app,
-- nunca em SQL). p_usuarios: [{nome, usuario, senha_hash, role}, ...]
-- onde o primeiro item deve ser role='admin'.
create function fn_registrar_estabelecimento(
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

  -- Categorias de produto padrao, nichadas pelo tipo do estabelecimento —
  -- poupa o cliente de comecar do zero e ja da uma referencia do que
  -- cadastrar no Cardapio Digital / Estoque.
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

  return v_estabelecimento_id;
end;
$$;

revoke all on function fn_registrar_estabelecimento(text, tipo_estabelecimento, text, modulo_sistema[], jsonb, text) from public;

-- ============================================================================
-- CARDAPIO PUBLICO (cardapio digital, sem autenticacao)
-- ============================================================================
-- Fluxo: cliente final acessa ohfome.app/cardapio/<slug> sem login. Essas
-- funcoes SECURITY DEFINER expoem so o minimo necessario (menu ativo e a
-- criacao de um pedido) — nunca dao acesso direto as tabelas para quem
-- nao esta autenticado.

create function fn_cardapio_publico(p_slug text)
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

revoke all on function fn_cardapio_publico(text) from public;

-- Cria pedido de entrega ou retirada origem='app' a partir do cardapio publico.
-- Preco sempre lido do banco (nunca confia no jsonb de itens do cliente).
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
  p_notificar_pedido boolean default false
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

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para)
  values (v_estabelecimento_id, case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end, 'app', 'novo', true, now(), v_cliente_id, v_observacoes, p_forma_recebimento, p_forma_pagamento, case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end, v_troco_para)
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
    insert into entregas (pedido_id, endereco) values (v_pedido_id, v_endereco);
  end if;

  return jsonb_build_object('id', v_pedido_id, 'codigo', v_codigo, 'notificar', p_notificar_pedido);
end;
$$;

revoke all on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean) from public;

-- Consulta publica de status: usada pela aba de acompanhamento do cliente.
-- So enxerga pedidos com origem='app' (feitos pelo cardapio) do slug pedido,
-- e o proprio uuid do pedido (imprevisivel) funciona como o "token" de acesso.
create function fn_pedido_publico_status(p_slug text, p_pedido_id uuid)
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
  where e.slug = p_slug and p.id = p_pedido_id and p.origem = 'app';
$$;

revoke all on function fn_pedido_publico_status(text, uuid) from public;

-- ============================================================================
-- ROLE DE APLICACAO (privilegio minimo)
-- ============================================================================
-- O backend NUNCA deve se conectar como o superusuario/dono das tabelas —
-- isso pularia todas as policies de RLS acima. Esta role so pode ler/escrever
-- dados sujeitos a RLS e chamar as duas funcoes de autenticacao; nada alem
-- disso (sem DDL, sem acesso a outros bancos, sem bypassrls).
--
-- A senha desta role NAO fica neste arquivo (que pode ir pro controle de
-- versao) — ela e definida separadamente no deploy com:
--   create role ohfome_app login password '<senha-forte-gerada>';
-- Rode esse comando uma vez antes de aplicar as grants abaixo.

grant usage on schema public to ohfome_app;

grant select, insert, update, delete on
  usuarios, mesas, comandas, categorias_produto, produtos, produto_insumos,
  insumos, movimentacoes_estoque, clientes, pedidos, itens_pedido,
  historico_status_pedido, entregadores, entregas, whatsapp_mensagens,
  movimentacoes_financeiras, custos_fixos, estado_aplicacao,
  estabelecimento_modulos
to ohfome_app;

-- estabelecimentos: sem insert/delete direto (so via fn_registrar_estabelecimento);
-- select/update ficam disponiveis e continuam presos pela RLS acima.
grant select, update on estabelecimentos to ohfome_app;

grant select on vw_estoque_baixo, vw_painel_pedidos to ohfome_app;

grant execute on function fn_autenticar(text) to ohfome_app;
grant execute on function fn_registrar_estabelecimento(text, tipo_estabelecimento, text, modulo_sistema[], jsonb, text) to ohfome_app;
grant execute on function fn_cardapio_publico(text) to ohfome_app;
grant execute on function fn_pedido_publico_status(text, uuid) to ohfome_app;
grant execute on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean) to ohfome_app;

-- Colunas serial (ex.: pedidos.codigo) usam uma sequence por baixo; inserir
-- nelas exige USAGE/SELECT na sequence, nao so privilegio na tabela.
grant usage, select on all sequences in schema public to ohfome_app;
