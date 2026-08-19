import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const TIPOS = ["entrada", "saida", "ajuste", "perda"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const tipo = body?.tipo;
  const quantidade = Number(body?.quantidade);
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim() || null : null;

  if (!TIPOS.includes(tipo)) return NextResponse.json({ erro: "Tipo de movimentação inválido." }, { status: 400 });
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return NextResponse.json({ erro: "Quantidade precisa ser maior que zero." }, { status: 400 });
  }

  try {
    const insumo = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      // A tabela insumos e RLS-protegida: se o id nao for deste estabelecimento
      // isso ja retorna vazio e barra antes de gravar a movimentacao.
      const { rows: existe } = await client.query(`select id from insumos where id = $1`, [id]);
      if (existe.length === 0) return null;

      await client.query(
        `insert into movimentacoes_estoque (insumo_id, tipo, quantidade, motivo, usuario_id)
         values ($1, $2, $3, $4, $5)`,
        [id, tipo, quantidade, motivo, sessao.usuarioId]
      );

      const { rows } = await client.query(
        `select
           id, nome,
           unidade_medida as "unidadeMedida",
           quantidade_estoque as "quantidadeEstoque",
           quantidade_minima as "quantidadeMinima",
           custo_unitario as "custoUnitario",
           fornecedor
         from insumos where id = $1`,
        [id]
      );
      return rows[0];
    });

    if (!insumo) return NextResponse.json({ erro: "Insumo não encontrado." }, { status: 404 });
    return NextResponse.json(insumo, { status: 201 });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23514") {
      return NextResponse.json({ erro: "Estoque insuficiente para essa saída." }, { status: 409 });
    }
    throw erro;
  }
}
