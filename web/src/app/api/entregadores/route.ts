import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const entregadores = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select id, nome, veiculo, telefone, disponivel from entregadores order by nome`
    );
    return rows;
  });

  return NextResponse.json(entregadores);
}

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const veiculo = typeof body?.veiculo === "string" ? body.veiculo.trim() || null : null;
  const telefone = typeof body?.telefone === "string" ? body.telefone.trim() || null : null;

  if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome do entregador." }, { status: 400 });

  const entregador = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `insert into entregadores (estabelecimento_id, nome, veiculo, telefone)
       values ($1, $2, $3, $4)
       returning id, nome, veiculo, telefone, disponivel`,
      [sessao.estabelecimentoId, nome, veiculo, telefone]
    );
    return rows[0];
  });

  return NextResponse.json(entregador, { status: 201 });
}
