import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; insumoId: string }> }
) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id, insumoId } = await params;
  const removido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `delete from produto_insumos
       where produto_id = $1 and insumo_id = $2
         and produto_id in (select id from produtos)
       returning produto_id`,
      [id, insumoId]
    );
    return rows[0] ?? null;
  });

  if (!removido) return NextResponse.json({ erro: "Vínculo não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
