import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeAcessarModulo(sessao, "delivery")) return respostaAcessoNegado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const entregadorId = typeof body?.entregadorId === "string" ? body.entregadorId : null;
  const status = body?.status;

  try {
    const entrega = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: entregas } = await client.query(
        `select en.id, en.pedido_id as "pedidoId", en.status, p.status as "pedidoStatus"
         from entregas en join pedidos p on p.id = en.pedido_id where en.id = $1 for update`, [id]
      );
      const atual = entregas[0];
      if (!atual) return null;

      if (entregadorId) {
        if (atual.status !== "aguardando" || atual.pedidoStatus !== "pronto") throw Object.assign(new Error("A entrega não está pronta para sair."), { status: 409 });
        const { rows: entregadores } = await client.query(`select id from entregadores where id = $1 and ativo for update`, [entregadorId]);
        if (!entregadores[0]) throw Object.assign(new Error("Entregador inválido ou inativo."), { status: 409 });
        await client.query(`update entregas set entregador_id = $1, status = 'em_rota', saiu_em = now() where id = $2`, [entregadorId, id]);
        await client.query(`update pedidos set status = 'saiu_para_entrega' where id = $1 and status = 'pronto'`, [atual.pedidoId]);
        return { id, status: "em_rota", pedidoId: atual.pedidoId };
      }

      if (status === "em_rota") throw Object.assign(new Error("Selecione um entregador antes de enviar a entrega."), { status: 400 });
      if (status === "aguardando") {
        if (atual.status !== "em_rota") throw Object.assign(new Error("A entrega não pode retornar para aguardando."), { status: 409 });
        await client.query(`update entregas set status = 'aguardando', entregador_id = null, saiu_em = null where id = $1`, [id]);
        await client.query(`update pedidos set status = 'pronto' where id = $1 and status = 'saiu_para_entrega'`, [atual.pedidoId]);
        return { id, status: "aguardando", pedidoId: atual.pedidoId };
      }
      if (status === "entregue") {
        if (atual.status !== "em_rota" || atual.pedidoStatus !== "saiu_para_entrega") throw Object.assign(new Error("A entrega não está em rota."), { status: 409 });
        await client.query(`update entregas set status = 'entregue', entregue_em = coalesce(entregue_em, now()) where id = $1`, [id]);
        await client.query(`update pedidos set status = 'finalizado' where id = $1`, [atual.pedidoId]);
        await client.query(`select fn_consumir_estoque_pedido($1)`, [atual.pedidoId]);
        return { id, status: "entregue", pedidoId: atual.pedidoId };
      }
      throw Object.assign(new Error("Ação inválida."), { status: 400 });
    });
    if (!entrega) return NextResponse.json({ erro: "Entrega não encontrada." }, { status: 404 });
    return NextResponse.json(entrega);
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? 500;
    if (status === 500) console.error("PATCH /api/entregas/[id]", erro);
    return NextResponse.json({ erro: status === 500 ? "Não foi possível atualizar a entrega." : (erro as Error).message }, { status });
  }
}
