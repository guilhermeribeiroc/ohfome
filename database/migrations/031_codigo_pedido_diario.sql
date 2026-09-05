-- O numero do pedido (pedidos.codigo) passa a reiniciar em 1 a cada dia
-- (hora de Brasilia), em vez de crescer para sempre por estabelecimento.
-- Facilita o cliente e a equipe reconhecerem o pedido de cabeca ("pedido 4"
-- em vez de "pedido 187"). Mesmo fuso ja usado em dataNaZonaAtual()
-- (web/src/app/api/financeiro/route.ts) para definir "hoje".

alter table estabelecimentos add column if not exists codigo_pedido_data date;

-- Marca "hoje" como ja processado pra quem ja tem pedidos hoje sob o esquema
-- antigo — sem isso, o primeiro pedido depois da migration tentaria voltar
-- pro codigo 1 e colidiria com o pedido 1 que ja existe hoje. O reinicio
-- diario de verdade so passa a valer a partir de amanha.
update estabelecimentos set codigo_pedido_data = (now() at time zone 'America/Fortaleza')::date
where codigo_pedido_data is null;

-- A unicidade antiga era so (estabelecimento_id, codigo); agora o codigo se
-- repete entre dias diferentes, entao a unicidade passa a valer por dia.
alter table pedidos drop constraint if exists uq_pedidos_estabelecimento_codigo;
create unique index uq_pedidos_estabelecimento_dia_codigo
  on pedidos (estabelecimento_id, ((created_at at time zone 'America/Fortaleza')::date), codigo);

create or replace function fn_atribuir_codigo_pedido() returns trigger as $$
declare
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  if new.codigo is null then
    update estabelecimentos
    set proximo_codigo_pedido = case when codigo_pedido_data is distinct from v_hoje then 2 else proximo_codigo_pedido + 1 end,
        codigo_pedido_data = v_hoje
    where id = new.estabelecimento_id
    returning proximo_codigo_pedido - 1 into new.codigo;
  end if;
  return new;
end;
$$ language plpgsql;
