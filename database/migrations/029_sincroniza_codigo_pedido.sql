-- Corrige contadores que possam ter ficado atrás de pedidos já existentes.
-- Não reduz um contador adiantado, portanto nunca reutiliza um ticket.
update estabelecimentos e
set proximo_codigo_pedido = greatest(
  e.proximo_codigo_pedido,
  coalesce((select max(p.codigo) from pedidos p where p.estabelecimento_id = e.id), 0) + 1
);

-- Cada novo pedido trava o estabelecimento e escolhe o maior valor entre o
-- contador persistido e o último ticket existente. Assim, importações ou
-- ajustes manuais antigos não voltam a causar colisão de código.
create or replace function fn_atribuir_codigo_pedido() returns trigger as $$
declare
  v_proximo_codigo integer;
  v_ultimo_codigo integer;
begin
  if new.codigo is null then
    select proximo_codigo_pedido
    into v_proximo_codigo
    from estabelecimentos
    where id = new.estabelecimento_id
    for update;

    select coalesce(max(codigo), 0)
    into v_ultimo_codigo
    from pedidos
    where estabelecimento_id = new.estabelecimento_id;

    new.codigo := greatest(v_proximo_codigo, v_ultimo_codigo + 1);

    update estabelecimentos
    set proximo_codigo_pedido = new.codigo + 1
    where id = new.estabelecimento_id;
  end if;
  return new;
end;
$$ language plpgsql;
