import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const colunas: string[] = [];
  const valores: unknown[] = [];
  function set(coluna: string, valor: unknown) {
    valores.push(valor);
    colunas.push(`${coluna} = $${valores.length}`);
  }

  if (typeof body.nome === "string") {
    if (body.nome.trim().length < 2) return NextResponse.json({ erro: "Nome muito curto." }, { status: 400 });
    set("nome", body.nome.trim());
  }
  if (typeof body.veiculo === "string") set("veiculo", body.veiculo.trim() || null);
  if (typeof body.telefone === "string") set("telefone", body.telefone.trim() || null);
  if (typeof body.disponivel === "boolean") set("disponivel", body.disponivel);

  if (colunas.length === 0) return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });

  valores.push(id);
  const entregador = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `update entregadores set ${colunas.join(", ")} where id = $${valores.length}
       returning id, nome, veiculo, telefone, disponivel`,
      valores
    );
    return rows[0] ?? null;
  });

  if (!entregador) return NextResponse.json({ erro: "Entregador não encontrado." }, { status: 404 });
  return NextResponse.json(entregador);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  try {
    const entregador = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(`delete from entregadores where id = $1 returning id`, [id]);
      return rows[0] ?? null;
    });
    if (!entregador) return NextResponse.json({ erro: "Entregador não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23503") {
      return NextResponse.json({ erro: "Esse entregador já tem entregas no histórico e não pode ser excluído." }, { status: 409 });
    }
    throw erro;
  }
}
