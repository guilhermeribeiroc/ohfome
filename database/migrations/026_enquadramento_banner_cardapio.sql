-- Permite escolher qual parte da foto do banner fica visivel no recorte
-- (a imagem sempre preenche a faixa larga do topo do cardapio; sem isso,
-- fotos com o assunto fora do centro ficam cortadas de um jeito ruim).
alter table banners_cardapio
  add column if not exists enquadramento text not null default 'centro'
  check (enquadramento in ('topo', 'centro', 'base'));

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
        'precoVenda', p.preco_venda
      ) order by coalesce(c.ordem_exibicao, 0), p.nome, p.tamanho)
      from produtos p
      left join categorias_produto c on c.id = p.categoria_id
      where p.estabelecimento_id = e.id and p.ativo
    ), '[]'::jsonb)
  )
  from estabelecimentos e
  where e.slug = p_slug and e.ativo;
$$;
