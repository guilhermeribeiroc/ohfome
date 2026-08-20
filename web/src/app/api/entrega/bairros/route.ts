import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const bairros = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select id, nome, taxa, ativo from bairros_entrega where estabelecimento_id = $1 order by nome`,
      [sessao.estabelecimentoId]
    );
    return rows;
  });

  return NextResponse.json(bairros);
}

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const taxa = Number(body?.taxa);

  if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome do bairro." }, { status: 400 });
  if (!Number.isFinite(taxa) || taxa < 0) return NextResponse.json({ erro: "Informe uma taxa válida." }, { status: 400 });

  try {
    const bairro = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        `insert into bairros_entrega (estabelecimento_id, nome, taxa, ativo) values ($1, $2, $3, true) returning id, nome, taxa, ativo`,
        [sessao.estabelecimentoId, nome, taxa]
      );
      return rows[0];
    });
    return NextResponse.json(bairro, { status: 201 });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return NextResponse.json({ erro: "Esse bairro já está cadastrado." }, { status: 409 });
    }
    throw erro;
  }
}
