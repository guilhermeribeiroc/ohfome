import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const PEDIDO_IMPRESSAO_SELECT = `
  select
    j.id, j.pedido_id as "pedidoId", j.status, j.tentativas, j.erro, j.created_at as "createdAt",
    json_build_object(
      'id', p.id,
      'codigo', p.codigo,
      'tipo', p.tipo,
      'origem', p.origem,
      'status', p.status,
      'total', p.total,
      'taxaEntrega', p.taxa_entrega,
      'observacoes', p.observacoes,
      'formaRecebimento', p.forma_recebimento,
      'formaPagamento', p.forma_pagamento,
      'tipoCartao', p.tipo_cartao,
      'trocoPara', p.troco_para,
      'pagamentoStatus', p.pagamento_status,
      'createdAt', p.created_at,
      'mesaNumero', m.numero,
      'clienteNome', c.nome,
      'clienteTelefone', c.telefone,
      'enderecoEntrega', e.endereco,
      'estabelecimentoNome', est.nome,
      'usuarioNome', u.nome,
      'itens', coalesce((
        select json_agg(json_build_object(
          'id', ip.id,
          'produtoId', ip.produto_id,
          'produtoNome', pr.nome,
          'quantidade', ip.quantidade,
          'precoUnitario', ip.preco_unitario,
          'observacoes', ip.observacoes,
          'status', ip.status
        ) order by ip.created_at)
        from itens_pedido ip
        join produtos pr on pr.id = ip.produto_id
        where ip.pedido_id = p.id
      ), '[]'::json)
    ) as pedido
  from impressao_jobs j
  join pedidos p on p.id = j.pedido_id
  join estabelecimentos est on est.id = p.estabelecimento_id
  left join comandas cm on cm.id = p.comanda_id
  left join mesas m on m.id = cm.mesa_id
  left join clientes c on c.id = p.cliente_id
  left join entregas e on e.pedido_id = p.id
  left join usuarios u on u.id = p.usuario_id
`;

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const jobs = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    // Se a maquina caiu depois de reservar um ticket, libera-o novamente.
    await client.query(
      `update impressao_jobs
       set status = 'pendente', reservado_em = null, erro = 'A reserva anterior expirou.'
       where status = 'imprimindo' and reservado_em < now() - interval '2 minutes'`
    );

    const { rows } = await client.query(
      `${PEDIDO_IMPRESSAO_SELECT}
       where j.status = 'pendente'
       order by j.created_at asc
       limit 20`
    );
    return rows;
  });

  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const pedidoId = typeof body?.pedidoId === "string" ? body.pedidoId : "";
  if (!pedidoId) return NextResponse.json({ erro: "Informe o pedido para reimprimir." }, { status: 400 });

  const job = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `insert into impressao_jobs (estabelecimento_id, pedido_id, tipo, origem)
       select estabelecimento_id, id, 'cozinha', 'reimpressao'
       from pedidos
       where id = $1
       returning id, pedido_id as "pedidoId", status, tentativas, erro, created_at as "createdAt"`,
      [pedidoId]
    );
    return rows[0] ?? null;
  });

  if (!job) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  return NextResponse.json(job, { status: 201 });
}
