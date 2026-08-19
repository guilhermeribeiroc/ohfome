import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const mesas = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select id, numero, capacidade, status from mesas order by numero`
    );
    return rows;
  });

  return NextResponse.json(mesas);
}

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const numero = Number(body?.numero);
  const capacidade = Number(body?.capacidade ?? 4);

  if (!Number.isInteger(numero) || numero <= 0) return NextResponse.json({ erro: "Número de mesa inválido." }, { status: 400 });
  if (!Number.isInteger(capacidade) || capacidade <= 0) return NextResponse.json({ erro: "Capacidade inválida." }, { status: 400 });

  try {
    const mesa = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        `insert into mesas (estabelecimento_id, numero, capacidade) values ($1, $2, $3)
         returning id, numero, capacidade, status`,
        [sessao.estabelecimentoId, numero, capacidade]
      );
      return rows[0];
    });
    return NextResponse.json(mesa, { status: 201 });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return NextResponse.json({ erro: "Já existe uma mesa com esse número." }, { status: 409 });
    }
    throw erro;
  }
}
