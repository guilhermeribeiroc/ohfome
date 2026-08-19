import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const categorias = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(`select id, nome from categorias_produto order by ordem_exibicao, nome`);
    return rows;
  });

  return NextResponse.json(categorias);
}

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  if (nome.length < 2) return NextResponse.json({ erro: "Nome da categoria muito curto." }, { status: 400 });

  try {
    const categoria = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        `insert into categorias_produto (estabelecimento_id, nome) values ($1, $2) returning id, nome`,
        [sessao.estabelecimentoId, nome]
      );
      return rows[0];
    });
    return NextResponse.json(categoria, { status: 201 });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return NextResponse.json({ erro: "Já existe uma categoria com esse nome." }, { status: 409 });
    }
    throw erro;
  }
}
