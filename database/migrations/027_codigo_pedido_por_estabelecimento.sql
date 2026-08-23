-- codigo de pedidos.pedidos era um serial GLOBAL (compartilhado por TODOS os
-- estabelecimentos do sistema) desde o inicio. Na pratica isso significa que
-- o primeiro pedido de um restaurante novo sai com um numero de ticket
-- absurdo (ex.: #54), refletindo quantos pedidos ja existem no OhFome
-- inteiro, e nao quantos aquele restaurante ja fez. Passa a ser sequencial
-- por estabelecimento: cada um comeca do 1 e conta so os proprios pedidos.

alter table estabelecimentos add column if not exists proximo_codigo_pedido integer not null default 1;

-- Preserva a numeracao atual de quem ja esta em producao (nao reseta
-- ninguem que ja tem pedidos ativos com ticket impresso, comanda em mesa
-- etc. — so estabelecimentos daqui pra frente comecam do 1 de verdade).
update estabelecimentos e
set proximo_codigo_pedido = coalesce((select max(p.codigo) from pedidos p where p.estabelecimento_id = e.id), 0) + 1;

alter table pedidos drop constraint if exists pedidos_codigo_key;
alter table pedidos alter column codigo drop default;
alter table pedidos add constraint uq_pedidos_estabelecimento_codigo unique (estabelecimento_id, codigo);

create or replace function fn_atribuir_codigo_pedido() returns trigger as $$
begin
  if new.codigo is null then
    update estabelecimentos set proximo_codigo_pedido = proximo_codigo_pedido + 1
    where id = new.estabelecimento_id
    returning proximo_codigo_pedido - 1 into new.codigo;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pedidos_atribui_codigo on pedidos;
create trigger trg_pedidos_atribui_codigo
  before insert on pedidos
  for each row execute function fn_atribuir_codigo_pedido();
