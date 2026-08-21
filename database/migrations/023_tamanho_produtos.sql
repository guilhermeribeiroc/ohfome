-- Tamanho opcional P/M/G no produto e snapshot nos itens do pedido.

do $$
begin
  create type tamanho_produto as enum ('P', 'M', 'G');
exception
  when duplicate_object then null;
end;
$$;

alter table produtos add column if not exists tamanho tamanho_produto;
alter table itens_pedido add column if not exists tamanho tamanho_produto;

-- Preserva o tamanho atual nos pedidos que já existem.
update itens_pedido ip
set tamanho = p.tamanho
from produtos p
where p.id = ip.produto_id;

-- Todo novo item guarda o tamanho vigente do produto. Assim, uma alteração
-- futura no cadastro não muda comandas e históricos já emitidos.
create function copiar_tamanho_produto_no_item() returns trigger as $$
begin
  if new.tamanho is null then
    select tamanho into new.tamanho from produtos where id = new.produto_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_itens_pedido_tamanho on itens_pedido;
create trigger trg_itens_pedido_tamanho
  before insert on itens_pedido
  for each row execute function copiar_tamanho_produto_no_item();

-- Mantém o cardápio público atualizado com o tamanho cadastrado.
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
      select jsonb_agg(jsonb_build_object('id', b.id, 'url', b.url, 'ordem', b.ordem) order by b.ordem)
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

-- O acompanhamento do cliente também usa o snapshot do item.
create or replace function fn_pedido_publico_status(p_slug text, p_pedido_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'status', p.status,
    'formaRecebimento', p.forma_recebimento,
    'formaPagamento', p.forma_pagamento,
    'pagamentoStatus', p.pagamento_status,
    'pixExpiraEm', px.expira_em,
    'createdAt', p.created_at,
    'notificadoEm', p.notificado_em,
    'notificadoMensagem', p.notificado_mensagem,
    'estabelecimentoNome', e.nome,
    'itens', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'produtoNome', pr.nome || case when ip.tamanho is not null then ' (' || ip.tamanho::text || ')' else '' end,
         'produtoTamanho', ip.tamanho,
         'quantidade', ip.quantidade
       ) order by ip.created_at)
       from itens_pedido ip join produtos pr on pr.id = ip.produto_id
       where ip.pedido_id = p.id),
      '[]'::jsonb
    ),
    'historico', coalesce(
      (select jsonb_agg(jsonb_build_object('status', h.status_novo, 'em', h.created_at) order by h.created_at)
       from historico_status_pedido h where h.pedido_id = p.id),
      '[]'::jsonb
    )
  )
  from pedidos p
  join estabelecimentos e on e.id = p.estabelecimento_id
  left join pagamentos_pix px on px.pedido_id = p.id
  where e.slug = p_slug and p.id = p_pedido_id and p.origem = 'app';
$$;
