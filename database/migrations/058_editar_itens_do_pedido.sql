begin;

-- Editar um pedido já feito: remover item e mudar a quantidade, mantendo o histórico (o item removido fica com
-- status 'cancelado', e o total do pedido ignora itens cancelados) e devolvendo o estoque.
-- "Trocar" é remover + acrescentar. Quando o pedido já foi para a cozinha, a comanda reimpressa leva um AVISO
-- (ex.: "RETIRAR: 1X GUARANA 1L") no topo.

alter table impressao_jobs add column if not exists aviso text;

do $$
declare
  v_nome text;
begin
  for v_nome in
    select c.conname from pg_constraint c
    where c.conrelid = 'impressao_jobs'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%reimpressao%'
  loop
    execute format('alter table impressao_jobs drop constraint %I', v_nome);
  end loop;
end $$;

alter table impressao_jobs
  add constraint impressao_jobs_origem_check check (origem in ('automatico', 'reimpressao', 'acrescimo', 'alteracao'));

-- Remove (cancela) UM item do pedido: estoque por unidade volta e os insumos da ficha técnica também.
create or replace function fn_cancelar_item_pedido(p_item_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item record;
  v_comp record;
begin
  select ip.id, ip.pedido_id, ip.produto_id, ip.quantidade, ip.status, ip.estabelecimento_id
    into v_item
  from itens_pedido ip where ip.id = p_item_id for update;
  if not found then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  if v_item.status = 'cancelado' then return; end if;

  update itens_pedido set status = 'cancelado' where id = p_item_id;

  for v_comp in
    select * from estoque_compromissos_produtos
    where item_pedido_id = p_item_id and status in ('reservado', 'comprometido') for update
  loop
    update estoque_compromissos_produtos set status = 'liberado', atualizado_em = now() where id = v_comp.id;
    insert into movimentacoes_estoque_produtos (estabelecimento_id, produto_id, pedido_id, tipo, quantidade, motivo, saldo_fisico_resultante)
    values (v_comp.estabelecimento_id, v_comp.produto_id, v_item.pedido_id, 'liberacao', v_comp.quantidade, 'Item removido do pedido',
            (select saldo_fisico from estoque_produtos where produto_id = v_comp.produto_id and estabelecimento_id = v_comp.estabelecimento_id));
  end loop;

  insert into movimentacoes_estoque (insumo_id, tipo, quantidade, motivo, pedido_id)
  select pi.insumo_id, 'entrada', pi.quantidade_necessaria * v_item.quantidade, 'Item removido do pedido', v_item.pedido_id
  from produto_insumos pi where pi.produto_id = v_item.produto_id;

  perform recalcular_totais_pedido(v_item.pedido_id);
end;
$$;

-- Muda a quantidade de UM item (1 ou mais), acertando o estoque pela diferença.
create or replace function fn_alterar_quantidade_item(p_item_id uuid, p_quantidade integer)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item record;
  v_delta integer;
  v_comp record;
  v_saldo integer;
  v_outros integer;
begin
  if p_quantidade is null or p_quantidade < 1 then
    raise exception 'A quantidade precisa ser 1 ou mais. Para tirar o item, use remover.' using errcode = '22023';
  end if;
  select ip.id, ip.pedido_id, ip.produto_id, ip.quantidade, ip.status, ip.estabelecimento_id
    into v_item
  from itens_pedido ip where ip.id = p_item_id for update;
  if not found then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  if v_item.status = 'cancelado' then raise exception 'Este item já foi removido.' using errcode = '22023'; end if;
  v_delta := p_quantidade - v_item.quantidade;
  if v_delta = 0 then return; end if;

  select * into v_comp from estoque_compromissos_produtos
  where item_pedido_id = p_item_id and status in ('reservado', 'comprometido') for update;
  if found then
    if v_delta > 0 then
      select saldo_fisico into v_saldo from estoque_produtos
      where produto_id = v_comp.produto_id and estabelecimento_id = v_comp.estabelecimento_id for update;
      select coalesce(sum(quantidade), 0)::integer into v_outros from estoque_compromissos_produtos
      where estabelecimento_id = v_comp.estabelecimento_id and produto_id = v_comp.produto_id
        and status in ('reservado', 'comprometido') and item_pedido_id <> p_item_id;
      if v_saldo - v_outros < p_quantidade then
        raise exception 'Estoque insuficiente para o produto solicitado' using errcode = '23514';
      end if;
    end if;
    update estoque_compromissos_produtos set quantidade = p_quantidade, atualizado_em = now() where id = v_comp.id;
  end if;

  update itens_pedido set quantidade = p_quantidade where id = p_item_id;

  insert into movimentacoes_estoque (insumo_id, tipo, quantidade, motivo, pedido_id)
  select pi.insumo_id, case when v_delta > 0 then 'saida'::movimentacao_tipo else 'entrada'::movimentacao_tipo end,
         pi.quantidade_necessaria * abs(v_delta), 'Quantidade alterada no pedido', v_item.pedido_id
  from produto_insumos pi where pi.produto_id = v_item.produto_id and pi.quantidade_necessaria > 0;

  perform recalcular_totais_pedido(v_item.pedido_id);
end;
$$;

commit;
