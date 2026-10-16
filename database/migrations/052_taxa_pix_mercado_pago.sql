begin;

-- Taxa que o Mercado Pago cobra do estabelecimento em cada Pix automático e o
-- valor que efetivamente cai na conta. Antes o financeiro só enxergava o bruto
-- (pedidos.total), então o valor recebido nunca batia com o faturamento.
-- Preenchido quando o pagamento é confirmado (e retroativamente, pelo
-- financeiro, nos pagamentos que já existiam).
alter table pagamentos_pix
  add column if not exists taxa numeric(10, 2) check (taxa is null or taxa >= 0),
  add column if not exists valor_liquido numeric(10, 2) check (valor_liquido is null or valor_liquido >= 0),
  add column if not exists taxa_tentativas smallint not null default 0;

commit;
