import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const entregas = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select
         en.id,
         p.codigo as "pedidoCodigo",
         c.nome as "clienteNome",
         c.telefone as "clienteTelefone",
         en.entregador_id as "entregadorId",
         en.status,
         en.endereco,
         en.bairro,
         p.observacoes,
         p.forma_pagamento as "formaPagamento",
         p.tipo_cartao as "tipoCartao",
         p.troco_para as "trocoPara",
         p.pagamento_dividido as "pagamentoDividido",
         p.pagamento_status as "pagamentoStatus",
         p.total,
         en.tempo_estimado_min as "tempoEstimadoMin",
         coalesce((
           select json_agg(json_build_object(
             'produtoNome', pr.nome || case when ip.tamanho is not null then ' (' || ip.tamanho::text || ')' else '' end,
             'produtoTamanho', ip.tamanho,
             'quantidade', ip.quantidade,
             'precoUnitario', ip.preco_unitario
           ) order by ip.created_at)
           from itens_pedido ip join produtos pr on pr.id = ip.produto_id
           where ip.pedido_id = p.id
         ), '[]') as itens
       from entregas en
       join pedidos p on p.id = en.pedido_id
       left join clientes c on c.id = p.cliente_id
       where p.status <> 'cancelado'
         and (en.status not in ('entregue', 'cancelada')
              or en.created_at > now() - interval '12 hours')
       order by en.created_at desc`
    );
    return rows;
  });

  return NextResponse.json(entregas);
}
