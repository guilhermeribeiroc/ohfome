import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const entregadorId = body?.entregadorId;
  const status = body?.status;

  try {
    const entrega = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      if (typeof entregadorId === "string") {
        const { rows } = await client.query(
          `update entregas set entregador_id = $1, status = 'em_rota', saiu_em = now()
           where id = $2 and status = 'aguardando'
           returning id, status, pedido_id`,
          [entregadorId, id]
        );
        if (rows.length === 0) return null;
        await client.query(`update entregadores set disponivel = false where id = $1`, [entregadorId]);
        // Mantem o pedido coerente com a entrega: ao sair para entrega, o
        // Kanban do balcao/cozinha reflete o mesmo estagio.
        await client.query(
          `update pedidos set status = 'saiu_para_entrega'
           where id = $1 and status not in ('saiu_para_entrega', 'finalizado', 'cancelado')`,
          [rows[0].pedido_id]
        );
        return rows[0];
      }

      if (status === "em_rota") {
        const { rows } = await client.query(
          `update entregas set status = 'em_rota', saiu_em = now()
           where id = $1 and status = 'aguardando'
           returning id, status, pedido_id`,
          [id]
        );
        if (rows.length === 0) return null;
        await client.query(
          `update pedidos set status = 'saiu_para_entrega'
           where id = $1 and status not in ('saiu_para_entrega', 'finalizado', 'cancelado')`,
          [rows[0].pedido_id]
        );
        return rows[0];
      }

      if (status === "aguardando") {
        const { rows: entregaAnterior } = await client.query("select entregador_id from entregas where id = $1", [id]);
        const { rows } = await client.query(
          `update entregas set status = 'aguardando', entregador_id = null, saiu_em = null
           where id = $1 and status <> 'cancelada'
           returning id, status, entregador_id, pedido_id`,
          [id]
        );
        if (rows.length === 0) return null;
        if (entregaAnterior[0]?.entregador_id) await client.query("update entregadores set disponivel = true where id = $1", [entregaAnterior[0].entregador_id]);
        await client.query(
          `update pedidos set status = 'pronto' where id = $1 and status <> 'cancelado'`,
          [rows[0].pedido_id]
        );
        return rows[0];
      }

      if (status === "entregue") {
        const { rows } = await client.query(
          `update entregas set status = 'entregue', entregue_em = now()
           where id = $1
           returning id, status, entregador_id, pedido_id`,
          [id]
        );
        if (rows.length === 0) return null;
        if (rows[0].entregador_id) {
          await client.query(`update entregadores set disponivel = true where id = $1`, [rows[0].entregador_id]);
        }
        await client.query(
          `update pedidos set status = 'finalizado' where id = $1 and status <> 'cancelado'`,
          [rows[0].pedido_id]
        );
        return rows[0];
      }

      throw Object.assign(new Error("Ação inválida."), { status: 400 });
    });

    if (!entrega) return NextResponse.json({ erro: "Entrega não encontrada ou já atribuída." }, { status: 404 });
    return NextResponse.json(entrega);
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? 500;
    return NextResponse.json({ erro: (erro as Error).message ?? "Erro inesperado." }, { status });
  }
}
