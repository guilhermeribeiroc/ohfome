-- Personalização visual do banner do cardápio público.
alter table estabelecimentos
  add column if not exists cardapio_banner_modo text not null default 'padrao'
  check (cardapio_banner_modo in ('padrao', 'fixo', 'carrossel'));

create table if not exists banners_cardapio (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  url text not null,
  ordem smallint not null default 0 check (ordem >= 0 and ordem < 20),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estabelecimento_id, ordem)
);

create trigger trg_banners_cardapio_updated_at
  before update on banners_cardapio
  for each row execute function set_updated_at();

create index if not exists idx_banners_cardapio_estabelecimento
  on banners_cardapio(estabelecimento_id, ordem);

alter table banners_cardapio enable row level security;
drop policy if exists tenant_isolation on banners_cardapio;
create policy tenant_isolation on banners_cardapio
  using (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid)
  with check (estabelecimento_id = current_setting('app.estabelecimento_id', true)::uuid);

grant select, insert, update, delete on banners_cardapio to ohfome_app;

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
