import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const ficha = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select
         pi.insumo_id as "insumoId",
         i.nome as "insumoNome",
         i.unidade_medida as "unidadeMedida",
         pi.quantidade_necessaria as "quantidadeNecessaria"
       from produto_insumos pi
       join insumos i on i.id = pi.insumo_id
       where pi.produto_id = $1
       order by i.nome`,
      [id]
    );
    return rows;
  });

  return NextResponse.json(ficha);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const insumoId = body?.insumoId;
  const quantidadeNecessaria = Number(body?.quantidadeNecessaria);

  if (typeof insumoId !== "string" || !Number.isFinite(quantidadeNecessaria) || quantidadeNecessaria <= 0) {
    return NextResponse.json({ erro: "Selecione um insumo e uma quantidade válida." }, { status: 400 });
  }

  const item = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    // produto_id e insumo_id sao verificados pela RLS de produtos/insumos:
    // se algum for de outro estabelecimento, a FK ainda aceitaria o insert
    // (produto_insumos nao tem RLS propria), entao confirmamos aqui antes.
    const { rows: dono } = await client.query(
      `select
         (select id from produtos where id = $1) as produto,
         (select id from insumos where id = $2) as insumo`,
      [id, insumoId]
    );
    if (!dono[0].produto || !dono[0].insumo) return null;

    const { rows } = await client.query(
      `insert into produto_insumos (produto_id, insumo_id, quantidade_necessaria)
       values ($1, $2, $3)
       on conflict (produto_id, insumo_id) do update set quantidade_necessaria = excluded.quantidade_necessaria
       returning insumo_id as "insumoId", quantidade_necessaria as "quantidadeNecessaria"`,
      [id, insumoId, quantidadeNecessaria]
    );
    const { rows: comNome } = await client.query(
      `select nome as "insumoNome", unidade_medida as "unidadeMedida" from insumos where id = $1`,
      [insumoId]
    );
    return { ...rows[0], ...comNome[0] };
  });

  if (!item) return NextResponse.json({ erro: "Produto ou insumo não encontrado." }, { status: 404 });
  return NextResponse.json(item, { status: 201 });
}
