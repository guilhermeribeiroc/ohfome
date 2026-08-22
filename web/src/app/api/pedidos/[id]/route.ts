import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { sessaoEhAdministrador } from "@/lib/admin-auth";
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

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!(await sessaoEhAdministrador(sessao))) {
    return NextResponse.json({ erro: "Apenas administradores podem excluir pedidos." }, { status: 403 });
  }

  const { id } = await params;

  const removido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    // entregas/estoque/whatsapp guardam o pedido_id sem cascade (preservam
    // historico mesmo se o pedido some), entao precisam ser desvinculados
    // antes do delete para nao esbarrar na foreign key.
    await client.query("delete from entregas where pedido_id = $1", [id]);
    await client.query("update movimentacoes_estoque set pedido_id = null where pedido_id = $1", [id]);
    await client.query("update whatsapp_mensagens set pedido_id = null where pedido_id = $1", [id]);
    const { rows } = await client.query("delete from pedidos where id = $1 returning id", [id]);
    return rows[0] ?? null;
  });

  if (!removido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
