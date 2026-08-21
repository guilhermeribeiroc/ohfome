-- O cardápio pode consultar a cobrança do próprio pedido quando um webhook
-- atrasar. Estes campos ficam somente dentro da rota; nunca são enviados ao
-- navegador na resposta pública.
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
    'estabelecimentoIdInterno', p.estabelecimento_id,
    'pixOrderIdInterno', px.order_id,
    'createdAt', p.created_at,
    'notificadoEm', p.notificado_em,
    'notificadoMensagem', p.notificado_mensagem,
    'estabelecimentoNome', e.nome,
    'itens', coalesce(
      (select jsonb_agg(jsonb_build_object('produtoNome', pr.nome, 'quantidade', ip.quantidade) order by ip.created_at)
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
