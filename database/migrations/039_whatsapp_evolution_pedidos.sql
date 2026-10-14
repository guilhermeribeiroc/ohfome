begin;

-- Conexao/automacao WhatsApp (Evolution API) por estabelecimento. A instancia
-- e criada uma vez e reaproveitada em reconexoes; a automacao comeca
-- desativada e só pode ligar depois de haver conexao.
alter table estabelecimentos add column whatsapp_instancia text unique;
alter table estabelecimentos add column whatsapp_automacao_ativa boolean not null default false;

-- Snapshot do consentimento no momento do pedido: nunca inferir de
-- clientes.notificar_pedido (perfil pode mudar depois do pedido existir).
alter table pedidos add column whatsapp_consentimento boolean not null default false;

-- Outbox: uma linha por (pedido, status) a notificar. Sem telefone nem corpo
-- da mensagem — so o necessario pro worker montar e rastrear o envio.
create table notificacoes_whatsapp_pedido (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  pedido_id uuid not null references pedidos(id) on delete cascade,
  status_pedido pedido_status not null,
  fila text not null default 'pending' check (fila in ('pending', 'accepted', 'failed', 'uncertain', 'ignored')),
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  lease_until timestamptz,
  provider_message_id text,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pedido_id, status_pedido)
);

create index idx_notificacoes_whatsapp_estabelecimento on notificacoes_whatsapp_pedido(estabelecimento_id);
create index idx_notificacoes_whatsapp_claim on notificacoes_whatsapp_pedido(proxima_tentativa_em)
  where fila = 'pending';

alter table notificacoes_whatsapp_pedido enable row level security;
create policy tenant_isolation on notificacoes_whatsapp_pedido
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

create trigger trg_notificacoes_whatsapp_updated_at
  before update on notificacoes_whatsapp_pedido
  for each row execute function set_updated_at();

-- Enfileira uma notificacao por transicao de status (inclui o insert, que
-- cobre "pedido recebido"). So gera evento quando ha cliente com telefone,
-- consentimento gravado no PEDIDO (nunca no perfil do cliente) e a
-- automacao do estabelecimento esta ativa. Falha ao notificar nunca pode
-- desfazer o pedido, por isso o insert e feito aqui mesmo, na mesma
-- transacao da mudanca de status, mas sem nenhuma chamada externa.
create function enfileirar_notificacao_whatsapp() returns trigger as $$
declare
  v_automacao_ativa boolean;
  v_telefone text;
begin
  if new.status = 'cancelado' or new.cliente_id is null or not new.whatsapp_consentimento then
    return new;
  end if;

  select e.whatsapp_automacao_ativa into v_automacao_ativa
  from estabelecimentos e where e.id = new.estabelecimento_id;

  if not coalesce(v_automacao_ativa, false) then
    return new;
  end if;

  select c.telefone into v_telefone from clientes c where c.id = new.cliente_id;
  if v_telefone is null or length(v_telefone) < 10 then
    return new;
  end if;

  insert into notificacoes_whatsapp_pedido (estabelecimento_id, pedido_id, status_pedido)
  values (new.estabelecimento_id, new.id, new.status)
  on conflict (pedido_id, status_pedido) do nothing;

  return new;
end;
$$ language plpgsql;

create trigger trg_pedidos_notificacao_whatsapp
  after insert or update of status on pedidos
  for each row execute function enfileirar_notificacao_whatsapp();

-- Desativar a automacao ignora pendencias existentes (mantendo o historico);
-- reativar nao reenvia retroativamente, pois so novas transicoes passam pelo
-- trigger acima.
create function fn_whatsapp_desativar_automacao(p_estabelecimento_id uuid) returns void
language sql
security invoker
set search_path = public
as $$
  update notificacoes_whatsapp_pedido
  set fila = 'ignored'
  where estabelecimento_id = p_estabelecimento_id and fila = 'pending';
$$;

-- Claim em lote entre estabelecimentos para o worker: roda com privilegio do
-- dono (bypassa RLS, que e por-tenant) mas devolve apenas os campos minimos
-- necessarios para o worker buscar o resto por tenant (via comEstabelecimento,
-- respeitando RLS de novo). Nenhum segredo, telefone ou corpo de mensagem
-- passa por aqui.
create function fn_whatsapp_claim_notificacoes(p_limite integer default 20)
returns table (id uuid, estabelecimento_id uuid, pedido_id uuid, status_pedido pedido_status, tentativas integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update notificacoes_whatsapp_pedido n
  set lease_until = now() + interval '2 minutes',
      tentativas = n.tentativas + 1
  from (
    select n2.id
    from notificacoes_whatsapp_pedido n2
    where n2.fila = 'pending'
      and n2.proxima_tentativa_em <= now()
      and (n2.lease_until is null or n2.lease_until < now())
    order by n2.created_at
    limit p_limite
    for update skip locked
  ) claimed
  where n.id = claimed.id
  returning n.id, n.estabelecimento_id, n.pedido_id, n.status_pedido, n.tentativas;
end;
$$;

revoke all on function fn_whatsapp_claim_notificacoes(integer) from public;
grant execute on function fn_whatsapp_claim_notificacoes(integer) to ohfome_app;
grant execute on function fn_whatsapp_desativar_automacao(uuid) to ohfome_app;
grant select, insert, update on notificacoes_whatsapp_pedido to ohfome_app;

-- fn_criar_pedido_publico: grava o snapshot de consentimento no pedido (alem
-- do perfil do cliente, que continua servindo outros fluxos). Mesma
-- assinatura de 029_pagamento_dividido.sql, so muda o corpo.
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
  p_email text,
  p_pagamento_dividido jsonb default null
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
  v_misto boolean := p_forma_pagamento = 'misto';
  v_parte jsonb;
  v_parte_forma text;
  v_parte_valor numeric(10,2);
  v_soma_partes numeric(10,2) := 0;
  v_valor_pix numeric(10,2);
begin
  select id into v_estabelecimento_id from estabelecimentos where slug = p_slug and ativo;
  if v_estabelecimento_id is null then
    raise exception 'Estabelecimento não encontrado' using errcode = 'P0002';
  end if;

  if p_forma_recebimento not in ('entrega', 'retirada') then
    raise exception 'Forma de recebimento inválida' using errcode = '22023';
  end if;
  if p_forma_pagamento not in ('cartao', 'dinheiro', 'pix', 'misto') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  if p_forma_pagamento = 'cartao' and p_tipo_cartao not in ('credito', 'debito') then
    raise exception 'Informe crédito ou débito' using errcode = '22023';
  end if;
  if p_forma_pagamento = 'cartao' then
    v_troco_para := null;
  end if;

  if v_misto then
    if p_pagamento_dividido is null or jsonb_array_length(p_pagamento_dividido) <> 2 then
      raise exception 'Pagamento dividido precisa de exatamente 2 partes' using errcode = '22023';
    end if;
    if (p_pagamento_dividido -> 0 ->> 'forma') = (p_pagamento_dividido -> 1 ->> 'forma') then
      raise exception 'As duas partes do pagamento dividido precisam ser formas diferentes' using errcode = '22023';
    end if;
    for v_parte in select jsonb_array_elements(p_pagamento_dividido) loop
      v_parte_forma := v_parte ->> 'forma';
      v_parte_valor := (v_parte ->> 'valor')::numeric;
      if v_parte_forma not in ('cartao', 'dinheiro', 'pix') then
        raise exception 'Forma inválida no pagamento dividido' using errcode = '22023';
      end if;
      if v_parte_valor is null or v_parte_valor <= 0 then
        raise exception 'Valor inválido no pagamento dividido' using errcode = '22023';
      end if;
      if v_parte_forma = 'cartao' and (v_parte ->> 'tipoCartao') not in ('credito', 'debito') then
        raise exception 'Informe crédito ou débito na parte em cartão' using errcode = '22023';
      end if;
      v_soma_partes := v_soma_partes + v_parte_valor;
      if v_parte_forma = 'pix' then
        v_valor_pix := v_parte_valor;
      end if;
    end loop;
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

  if p_forma_pagamento = 'pix' or v_valor_pix is not null then
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

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, cliente_id, observacoes, forma_recebimento, forma_pagamento, tipo_cartao, troco_para, pagamento_dividido, taxa_entrega, pagamento_status, whatsapp_consentimento)
  values (
    v_estabelecimento_id,
    case when p_forma_recebimento = 'entrega' then 'delivery'::pedido_tipo else 'balcao'::pedido_tipo end,
    'app', 'novo', v_enviar_cozinha, case when v_enviar_cozinha then now() else null end,
    v_cliente_id, v_observacoes, p_forma_recebimento, p_forma_pagamento,
    case when p_forma_pagamento = 'cartao' then p_tipo_cartao else null end,
    v_troco_para,
    case when v_misto then p_pagamento_dividido else null end,
    v_taxa_entrega, 'pendente', coalesce(p_notificar_pedido, false)
  )
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
  if v_misto and abs(v_soma_partes - v_total) > 0.01 then
    raise exception 'A soma do pagamento dividido não bate com o total do pedido' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_pedido_id,
    'codigo', v_codigo,
    'estabelecimentoId', v_estabelecimento_id,
    'notificar', p_notificar_pedido,
    'taxaEntrega', v_taxa_entrega,
    'total', v_total,
    'pixModo', case when p_forma_pagamento = 'pix' or v_valor_pix is not null then v_pix_modo else null end,
    'valorPix', v_valor_pix,
    'aguardandoPagamento', not v_enviar_cozinha
  );
end;
$$;

revoke all on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid, text, jsonb) from public;
grant execute on function fn_criar_pedido_publico(text, text, text, text, text, text, text, text, numeric, jsonb, text, boolean, uuid, text, jsonb) to ohfome_app;

-- fn_adicionar_itens_pedido_publico: o pedido adicional herda o consentimento
-- do pedido original (mesmo cliente, mesmo pedido em andamento) — nao e
-- inferencia do perfil, e continuacao do mesmo consentimento já dado.
create or replace function fn_adicionar_itens_pedido_publico(
  p_slug text,
  p_pedido_id uuid,
  p_itens jsonb,
  p_observacoes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estabelecimento_id uuid;
  v_status text;
  v_forma_recebimento text;
  v_forma_pagamento text;
  v_tipo pedido_tipo;
  v_cliente_id uuid;
  v_consentimento boolean;
  v_endereco text;
  v_bairro text;
  v_novo_pedido_id uuid;
  v_codigo int;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade int;
  v_preco numeric(10,2);
  v_item_observacoes text;
  v_observacoes text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_total numeric(10,2);
begin
  select p.estabelecimento_id, p.status::text, p.forma_recebimento, p.forma_pagamento, p.tipo, p.cliente_id, p.whatsapp_consentimento
    into v_estabelecimento_id, v_status, v_forma_recebimento, v_forma_pagamento, v_tipo, v_cliente_id, v_consentimento
  from pedidos p
  join estabelecimentos e on e.id = p.estabelecimento_id
  where e.slug = p_slug and p.id = p_pedido_id and p.origem = 'app';

  if v_estabelecimento_id is null then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_status in ('finalizado', 'cancelado')
     or (v_forma_recebimento = 'entrega' and v_status = 'saiu_para_entrega')
     or (v_forma_recebimento = 'retirada' and v_status = 'pronto') then
    raise exception 'Não é mais possível adicionar itens a este pedido' using errcode = '22023';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum item informado' using errcode = '22023';
  end if;

  if v_forma_recebimento = 'entrega' then
    select endereco, bairro into v_endereco, v_bairro from entregas where pedido_id = p_pedido_id;
  end if;

  insert into pedidos (
    estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em,
    cliente_id, observacoes, forma_recebimento, forma_pagamento, pagamento_status, pedido_pai_id, whatsapp_consentimento
  )
  values (
    v_estabelecimento_id, v_tipo, 'app', 'novo', true, now(),
    v_cliente_id, v_observacoes, v_forma_recebimento, v_forma_pagamento, 'pendente', p_pedido_id, coalesce(v_consentimento, false)
  )
  returning id, codigo into v_novo_pedido_id, v_codigo;

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
    values (v_novo_pedido_id, v_produto_id, v_quantidade, v_preco, v_item_observacoes);
  end loop;

  select total into v_total from pedidos where id = v_novo_pedido_id;

  return jsonb_build_object('id', v_novo_pedido_id, 'codigo', v_codigo, 'total', v_total);
end;
$$;

commit;
