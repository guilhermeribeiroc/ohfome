import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const insumos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select
         id, nome,
         unidade_medida as "unidadeMedida",
         quantidade_estoque as "quantidadeEstoque",
         quantidade_minima as "quantidadeMinima",
         custo_unitario as "custoUnitario",
         fornecedor
       from insumos
       order by nome`
    );
    return rows;
  });

  return NextResponse.json(insumos);
}

const UNIDADES = ["kg", "g", "l", "ml", "un", "cx", "pct"];

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const unidadeMedida = body?.unidadeMedida;
  const quantidadeMinima = Number(body?.quantidadeMinima ?? 0);
  const custoUnitario = Number(body?.custoUnitario ?? 0);
  const fornecedor = typeof body?.fornecedor === "string" ? body.fornecedor.trim() || null : null;

  if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome do insumo." }, { status: 400 });
  if (!UNIDADES.includes(unidadeMedida)) return NextResponse.json({ erro: "Unidade de medida inválida." }, { status: 400 });
  if (!Number.isFinite(quantidadeMinima) || quantidadeMinima < 0 || !Number.isFinite(custoUnitario) || custoUnitario < 0) {
    return NextResponse.json({ erro: "Valores numéricos inválidos." }, { status: 400 });
  }

  const insumo = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `insert into insumos (estabelecimento_id, nome, unidade_medida, quantidade_minima, custo_unitario, fornecedor)
       values ($1, $2, $3, $4, $5, $6)
       returning
         id, nome,
         unidade_medida as "unidadeMedida",
         quantidade_estoque as "quantidadeEstoque",
         quantidade_minima as "quantidadeMinima",
         custo_unitario as "custoUnitario",
         fornecedor`,
      [sessao.estabelecimentoId, nome, unidadeMedida, quantidadeMinima, custoUnitario, fornecedor]
    );
    return rows[0];
  });

  return NextResponse.json(insumo, { status: 201 });
}
