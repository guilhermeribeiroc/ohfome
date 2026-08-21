-- Horários e pausa manual do cardápio. Sem configuração salva, mantemos o
-- cardápio aberto para não interromper restaurantes existentes.
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
      when not d.configurado then true
      when coalesce((d.valor->>'pausado')::boolean, false) then false
      else exists(select 1 from turno_atual)
    end,
    'pausado', coalesce((d.valor->>'pausado')::boolean, false),
    'motivo', case
      when coalesce((d.valor->>'pausado')::boolean, false)
        then coalesce(nullif(btrim(d.valor->>'mensagemPausa'), ''), 'Não estamos recebendo pedidos no momento.')
      when d.configurado and not exists(select 1 from turno_atual)
        then 'Estamos fechados no momento.'
      else null
    end,
    'turnos', coalesce(d.valor->'turnos', '{}'::jsonb)
  )
  from dados d;
$$;

revoke all on function fn_disponibilidade_cardapio(uuid) from public;
grant execute on function fn_disponibilidade_cardapio(uuid) to ohfome_app;

create or replace function fn_disponibilidade_cardapio_publico(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select fn_disponibilidade_cardapio(e.id)
  from estabelecimentos e
  where e.slug = p_slug and e.ativo;
$$;

revoke all on function fn_disponibilidade_cardapio_publico(text) from public;
grant execute on function fn_disponibilidade_cardapio_publico(text) to ohfome_app;

create or replace function fn_cardapio_publico(p_slug text)
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
    'bannerModo', e.cardapio_banner_modo,
    'disponibilidade', fn_disponibilidade_cardapio(e.id),
    'pix', (
      select case when cp.ativo then jsonb_build_object('modo', cp.modo) else null end
      from configuracoes_pix cp where cp.estabelecimento_id = e.id
    ),
    'banners', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'url', b.url, 'ordem', b.ordem) order by b.ordem)
      from banners_cardapio b
      where b.estabelecimento_id = e.id and b.ativo
    ), '[]'::jsonb),
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
grant execute on function fn_cardapio_publico(text) to ohfome_app;
