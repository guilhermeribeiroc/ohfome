import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const STATUS_VALIDOS = ["novo", "em_preparo", "pronto", "saiu_para_entrega", "finalizado", "cancelado"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;

  if (!STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ erro: "Status inválido." }, { status: 400 });
  }

  const pedido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `update pedidos set status = $1 where id = $2 returning id, status`,
      [status, id]
    );
    const atualizado = rows[0] ?? null;
    if (!atualizado) return null;

    if (status === "saiu_para_entrega") {
      await client.query(
        `update entregas set status = 'em_rota', saiu_em = coalesce(saiu_em, now())
         where pedido_id = $1 and status = 'aguardando'`,
        [id]
      );
    }

    if (status === "finalizado") {
      const { rows: entregas } = await client.query(
        `update entregas set status = 'entregue', entregue_em = coalesce(entregue_em, now())
         where pedido_id = $1 and status not in ('entregue', 'cancelada')
         returning entregador_id`,
        [id]
      );
      const entregadoresIds = entregas.map((entrega) => entrega.entregador_id).filter((entregadorId): entregadorId is string => typeof entregadorId === "string");
      if (entregadoresIds.length) await client.query("update entregadores set disponivel = true where id = any($1::uuid[])", [entregadoresIds]);
    }

    return atualizado;
  });

  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  return NextResponse.json(pedido);
}
