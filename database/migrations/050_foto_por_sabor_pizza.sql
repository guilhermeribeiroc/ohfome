begin;

-- Foto por sabor de pizza: no cardápio digital cada sabor é um item e passa a ter a sua foto
-- (se não tiver, usa a do produto).
alter table pizza_sabores add column if not exists imagem_url text;

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
    'pix', (
      select case when cp.ativo then jsonb_build_object('modo', cp.modo) else null end
      from configuracoes_pix cp where cp.estabelecimento_id = e.id
    ),
    'banners', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'url', b.url, 'ordem', b.ordem, 'enquadramento', b.enquadramento) order by b.ordem)
      from banners_cardapio b
      where b.estabelecimento_id = e.id and b.ativo
    ), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'tamanho', p.tamanho,
        'descricao', p.descricao,
        'imagemUrl', p.imagem_url,
        'categoriaNome', coalesce(c.nome, 'Geral'),
        'precoVenda', p.preco_venda,
        'tipoProduto', p.tipo_produto,
        'controlaEstoqueUnidades', p.controla_estoque_unidades,
        'estoqueDisponivel', case when p.controla_estoque_unidades then fn_disponibilidade_produto(e.id, p.id) else null end,
        'grupoOpcoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id,
            'nome', g.nome,
            'minimoSelecoes', g.minimo_selecoes,
            'maximoSelecoes', g.maximo_selecoes,
            'definePreco', g.define_preco,
            'opcoes', coalesce((
              select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'acrescimo', o.acrescimo) order by o.ordem, o.nome)
              from produto_opcoes o where o.grupo_id = g.id and o.ativo
            ), '[]'::jsonb)
          ) order by g.ordem, g.nome)
          from produto_grupos_opcoes g
          where g.produto_id = p.id and g.ativo
        ), '[]'::jsonb),
        'pizza', case when p.tipo_produto = 'pizza' then (
          select jsonb_build_object(
            'regraMeioAMeio', pcp.regra_meio_a_meio,
            'tamanhos', coalesce((
              select jsonb_agg(jsonb_build_object('id', pt.id, 'nome', pt.nome, 'precoSaborUnico', pt.preco_sabor_unico, 'precoMeioAMeio', pt.preco_meio_a_meio, 'permiteMeioAMeio', pt.permite_meio_a_meio) order by pt.ordem)
              from pizza_tamanhos pt where pt.produto_id = p.id and pt.ativo
            ), '[]'::jsonb),
            'sabores', coalesce((
              select jsonb_agg(jsonb_build_object('id', ps.id, 'nome', ps.nome, 'descricao', ps.descricao, 'acrescimo', ps.acrescimo, 'permiteMeioAMeio', ps.permite_meio_a_meio, 'imagemUrl', ps.imagem_url,
                'precos', coalesce((select jsonb_object_agg(sp.tamanho_id::text, sp.preco) from pizza_sabor_precos sp where sp.sabor_id = ps.id), '{}'::jsonb)) order by ps.ordem, ps.nome)
              from pizza_sabores ps where ps.produto_id = p.id and ps.ativo
            ), '[]'::jsonb)
          )
          from produto_configuracoes_pizza pcp where pcp.produto_id = p.id
        ) else null end
      ) order by coalesce(c.ordem_exibicao, 0), p.nome, p.tamanho)
      from produtos p
      left join categorias_produto c on c.id = p.categoria_id
      where p.estabelecimento_id = e.id and p.ativo
    ), '[]'::jsonb)
  )
  from estabelecimentos e
  where e.slug = p_slug and e.ativo;
$$;

commit;
