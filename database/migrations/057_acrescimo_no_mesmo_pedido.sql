begin;

-- Acrescentar itens a um pedido já feito (delivery, retirada, balcão) passa a ser dentro do MESMO
-- pedido: mesmo número, um card, uma entrega. Cada item guarda em qual "rodada" entrou
-- (1 = pedido original, 2 = primeiro acréscimo...), e a comanda de acréscimo imprime só a rodada nova.

alter table itens_pedido add column if not exists rodada integer not null default 1 check (rodada >= 1);

alter table impressao_jobs add column if not exists rodada integer not null default 1 check (rodada >= 1);

-- A comanda de acréscimo é um tipo novo de trabalho na fila de impressão.
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
  add constraint impressao_jobs_origem_check check (origem in ('automatico', 'reimpressao', 'acrescimo'));

commit;
