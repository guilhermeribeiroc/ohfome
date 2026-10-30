-- Controle manual do cardápio: além da pausa, o dono pode forçar "aberto"
-- ignorando os turnos. A pausa continua prevalecendo sobre tudo.
create or replace function fn_disponibilidade_cardapio(p_estabelecimento_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with estado as (
    select valor
    from estado_aplicacao
    where estabelecimento_id = p_estabelecimento_id
      and chave = 'horario_funcionamento'
  ), agora as (
    select now() at time zone 'America/Fortaleza' as local
  ), dados as (
    select
      (select valor from estado) as valor,
      exists(select 1 from estado) as configurado,
      (select local from agora) as local
  ), turno_atual as (
    select 1
    from dados d,
      jsonb_array_elements(coalesce(d.valor->'turnos'->((extract(dow from d.local)::int)::text), '[]'::jsonb)) turno
    where d.local::time >= (turno->>'inicio')::time
      and d.local::time < (turno->>'fim')::time
  )
  select jsonb_build_object(
    'configurado', d.configurado,
    'aberto', case
      when coalesce((d.valor->>'pausado')::boolean, false) then false
      when coalesce((d.valor->>'forcarAberto')::boolean, false) then true
      when not d.configurado then true
      else exists(select 1 from turno_atual)
    end,
    'pausado', coalesce((d.valor->>'pausado')::boolean, false),
    'forcarAberto', coalesce((d.valor->>'forcarAberto')::boolean, false),
    'motivo', case
      when coalesce((d.valor->>'pausado')::boolean, false)
        then coalesce(nullif(btrim(d.valor->>'mensagemPausa'), ''), 'Não estamos recebendo pedidos no momento.')
      when coalesce((d.valor->>'forcarAberto')::boolean, false) then null
      when d.configurado and not exists(select 1 from turno_atual)
        then 'Restaurante fechado no momento.'
      else null
    end,
    'turnos', coalesce(d.valor->'turnos', '{}'::jsonb)
  )
  from dados d;
$$;

revoke all on function fn_disponibilidade_cardapio(uuid) from public;
grant execute on function fn_disponibilidade_cardapio(uuid) to ohfome_app;
