import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const RETORNO = `
  id, nome, tamanho, descricao, imagem_url as "imagemUrl",
  coalesce((select nome from categorias_produto where id = produtos.categoria_id), 'Geral') as "categoriaNome",
  modo_precificacao as "modoPrecificacao",
  preco_custo as "precoCusto",
  margem_percentual as "margemPercentual",
  preco_venda as "precoVenda",
  ativo
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
  if (typeof body.descricao === "string") set("descricao", body.descricao.trim() || null);
  if (body.imagemUrl === null || typeof body.imagemUrl === "string") set("imagem_url", typeof body.imagemUrl === "string" ? body.imagemUrl.trim() || null : null);
  if (body.categoriaId === null || typeof body.categoriaId === "string") set("categoria_id", body.categoriaId);
  if (body.tamanho === null || body.tamanho === "P" || body.tamanho === "M" || body.tamanho === "G") set("tamanho", body.tamanho);
  if (typeof body.ativo === "boolean") set("ativo", body.ativo);

  if (body.modoPrecificacao !== undefined) {
    const modoPrecificacao = body.modoPrecificacao;
    const precoCusto = Number(body.precoCusto);
    const margemPercentual = Number(body.margemPercentual);
    const precoVenda = Number(body.precoVenda);
    if (
      (modoPrecificacao !== "margem" && modoPrecificacao !== "preco_manual") ||
      !Number.isFinite(precoCusto) ||
      precoCusto < 0 ||
      !Number.isFinite(margemPercentual) ||
      margemPercentual < -100 ||
      !Number.isFinite(precoVenda) ||
      precoVenda < 0
    ) {
      return NextResponse.json({ erro: "Dados de precificação inválidos." }, { status: 400 });
    }
    set("modo_precificacao", modoPrecificacao);
    set("preco_custo", precoCusto);
    set("margem_percentual", margemPercentual);
    set("preco_venda", precoVenda);
  }

  if (colunas.length === 0) return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });

  valores.push(id);
  const produto = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `update produtos set ${colunas.join(", ")} where id = $${valores.length} returning ${RETORNO}`,
      valores
    );
    return rows[0] ?? null;
  });

  if (!produto) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  return NextResponse.json(produto);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  // Soft delete: produtos ja usados em pedidos anteriores nao podem sumir
  // (quebraria o historico), entao so desativa e some do cardapio ativo.
  const produto = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(`update produtos set ativo = false where id = $1 returning id`, [id]);
    return rows[0] ?? null;
  });

  if (!produto) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
