import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";

const STATUS_VALIDOS = ["novo", "em_preparo", "pronto", "saiu_para_entrega", "finalizado", "cancelado"];
const TRANSICOES: Record<string, string[]> = {
  novo: ["em_preparo", "cancelado"],
  em_preparo: ["pronto", "cancelado"],
  pronto: ["saiu_para_entrega", "finalizado", "cancelado"],
  saiu_para_entrega: ["finalizado", "cancelado"],
  finalizado: [],
  cancelado: [],
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;
  const entregadorId = typeof body?.entregadorId === "string" ? body.entregadorId : null;

  if (!STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ erro: "Status inválido." }, { status: 400 });
  }
  const podeAtualizarPedido = sessao.role === "admin"
    || sessaoPodeAcessarModulo(sessao, "balcao")
    || ((status === "em_preparo" || status === "pronto") && sessaoPodeAcessarModulo(sessao, "cozinha"))
    || ((status === "saiu_para_entrega" || status === "finalizado") && sessaoPodeAcessarModulo(sessao, "delivery"));
  if (!podeAtualizarPedido) return respostaAcessoNegado();

  const pedido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows: existentes } = await client.query(
      `select status, tipo from pedidos where id = $1 for update`,
      [id]
    );
    const statusAnterior = existentes[0]?.status as string | undefined;
    if (!statusAnterior) return null;
    if (!TRANSICOES[statusAnterior]?.includes(status)) {
      return { conflito: true as const, id, status: statusAnterior };
    }

    if (status === "saiu_para_entrega") {
      if (existentes[0].tipo !== "delivery" || !entregadorId) {
        throw Object.assign(new Error("Selecione um entregador ativo antes de enviar o pedido."), { status: 400 });
      }
      const { rows: entregadorRows } = await client.query(
        `select id from entregadores where id = $1 and ativo for update`, [entregadorId]
      );
      if (!entregadorRows[0]) throw Object.assign(new Error("Entregador inválido ou inativo."), { status: 409 });
      const { rows: entregaRows } = await client.query(
        `update entregas set entregador_id = $1, status = 'em_rota', saiu_em = coalesce(saiu_em, now())
         where pedido_id = $2 and status = 'aguardando'
         returning id`,
        [entregadorId, id]
      );
      if (!entregaRows[0]) throw Object.assign(new Error("A entrega não está aguardando despacho."), { status: 409 });
    }
    const { rows } = await client.query(
      `update pedidos set status = $1 where id = $2 and status = $3 returning id, status`,
      [status, id, statusAnterior]
    );
    const atualizado = rows[0] ?? null;
    if (!atualizado) return null;

    if (status === "finalizado") {
      await client.query(`select fn_consumir_estoque_pedido($1)`, [id]);
      const { rows: entregas } = await client.query(
        `update entregas set status = 'entregue', entregue_em = coalesce(entregue_em, now())
         where pedido_id = $1 and status not in ('entregue', 'cancelada')
         returning entregador_id`,
        [id]
      );
      void entregas;
    }

    if (status === "cancelado") {
      if (statusAnterior === "novo") await client.query(`select fn_liberar_estoque_pedido($1)`, [id]);
      else await client.query(`select fn_consumir_estoque_pedido($1)`, [id]);
      // Sem isso a entrega ficava orfa: sumia do Kanban mas continuava
      // "aguardando"/"em_rota" no Delivery, deixando a equipe marcar como
      // entregue um pedido que ja tinha sido cancelado (e essa venda nunca
      // aparecia no financeiro, porque o pedido nunca virava "finalizado").
      const { rows: entregas } = await client.query(
        `update entregas set status = 'cancelada'
         where pedido_id = $1 and status not in ('entregue', 'cancelada')
         returning entregador_id`,
        [id]
      );
      void entregas;
    }

    if (status === "finalizado" || status === "cancelado") {
      // Fecha a comanda (e libera a mesa, via trigger) assim que nenhum
      // pedido dela sobrar pendente no Kanban. Sem isso a mesa nunca
      // desocupava sozinha: nada no sistema fechava a comanda automaticamente.
      const { rows: comandaRows } = await client.query(
        `select cm.id from pedidos p join comandas cm on cm.id = p.comanda_id
         where p.id = $1 and cm.status = 'aberta'`,
        [id]
      );
      const comandaId = comandaRows[0]?.id as string | undefined;
      if (comandaId) {
        const { rows: pendentes } = await client.query(
          `select 1 from pedidos where comanda_id = $1 and status not in ('finalizado', 'cancelado') limit 1`,
          [comandaId]
        );
        if (pendentes.length === 0) {
          await client.query(`update comandas set status = 'fechada', fechada_em = now() where id = $1`, [comandaId]);
        }
      }
    }

    return atualizado ? { ...atualizado, conflito: false as const } : null;
  });

  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  if (pedido.conflito) return NextResponse.json({ erro: "Esta mudança de status não é permitida." }, { status: 409 });
  return NextResponse.json(pedido);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
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
