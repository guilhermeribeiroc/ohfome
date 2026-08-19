import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const UNIDADES = ["kg", "g", "l", "ml", "un", "cx", "pct"];
const RETORNO = `
  id, nome,
  unidade_medida as "unidadeMedida",
  quantidade_estoque as "quantidadeEstoque",
  quantidade_minima as "quantidadeMinima",
  custo_unitario as "custoUnitario",
  fornecedor
`;

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
  if (body.unidadeMedida !== undefined) {
    if (!UNIDADES.includes(body.unidadeMedida)) return NextResponse.json({ erro: "Unidade inválida." }, { status: 400 });
    set("unidade_medida", body.unidadeMedida);
  }
  if (body.quantidadeMinima !== undefined) {
    const v = Number(body.quantidadeMinima);
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ erro: "Estoque mínimo inválido." }, { status: 400 });
    set("quantidade_minima", v);
  }
  if (body.custoUnitario !== undefined) {
    const v = Number(body.custoUnitario);
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ erro: "Custo unitário inválido." }, { status: 400 });
    set("custo_unitario", v);
  }
  if (typeof body.fornecedor === "string") set("fornecedor", body.fornecedor.trim() || null);

  if (colunas.length === 0) return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });

  valores.push(id);
  const insumo = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `update insumos set ${colunas.join(", ")} where id = $${valores.length} returning ${RETORNO}`,
      valores
    );
    return rows[0] ?? null;
  });

  if (!insumo) return NextResponse.json({ erro: "Insumo não encontrado." }, { status: 404 });
  return NextResponse.json(insumo);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  try {
    const insumo = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(`delete from insumos where id = $1 returning id`, [id]);
      return rows[0] ?? null;
    });
    if (!insumo) return NextResponse.json({ erro: "Insumo não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23503") {
      return NextResponse.json(
        { erro: "Esse insumo está na ficha técnica de um produto — remova o vínculo antes de excluir." },
        { status: 409 }
      );
    }
    throw erro;
  }
}
