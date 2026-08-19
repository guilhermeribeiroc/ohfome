import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const todos = new URL(request.url).searchParams.get("todos") === "1";

  const produtos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select
         p.id, p.nome, p.descricao, p.imagem_url as "imagemUrl",
         p.categoria_id as "categoriaId",
         coalesce(c.nome, 'Geral') as "categoriaNome",
         p.modo_precificacao as "modoPrecificacao",
         p.preco_custo as "precoCusto",
         p.margem_percentual as "margemPercentual",
         p.preco_venda as "precoVenda",
         p.ativo
       from produtos p
       left join categorias_produto c on c.id = p.categoria_id
       where ($1 or p.ativo)
       order by c.ordem_exibicao, p.nome`,
      [todos]
    );
    return rows;
  });

  return NextResponse.json(produtos);
}

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const descricao = typeof body?.descricao === "string" ? body.descricao.trim() : null;
  const imagemUrl = typeof body?.imagemUrl === "string" ? body.imagemUrl.trim() || null : null;
  const categoriaId = typeof body?.categoriaId === "string" ? body.categoriaId : null;
  const modoPrecificacao = body?.modoPrecificacao === "preco_manual" ? "preco_manual" : "margem";
  const precoCusto = Number(body?.precoCusto ?? 0);
  const margemPercentual = Number(body?.margemPercentual ?? 0);
  const precoVenda = Number(body?.precoVenda ?? 0);

  if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome do produto." }, { status: 400 });
  if (!Number.isFinite(precoCusto) || precoCusto < 0 || !Number.isFinite(margemPercentual) || margemPercentual < 0 || !Number.isFinite(precoVenda) || precoVenda < 0) {
    return NextResponse.json({ erro: "Preço de custo/margem inválidos." }, { status: 400 });
  }

  const produto = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `insert into produtos (estabelecimento_id, categoria_id, nome, descricao, imagem_url, modo_precificacao, preco_custo, margem_percentual, preco_venda)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning
         id, nome, descricao, imagem_url as "imagemUrl",
         coalesce((select nome from categorias_produto where id = $2), 'Geral') as "categoriaNome",
         modo_precificacao as "modoPrecificacao",
         preco_custo as "precoCusto",
         margem_percentual as "margemPercentual",
         preco_venda as "precoVenda",
         ativo`,
      [sessao.estabelecimentoId, categoriaId, nome, descricao, imagemUrl, modoPrecificacao, precoCusto, margemPercentual, precoVenda]
    );
    return rows[0];
  });

  return NextResponse.json(produto, { status: 201 });
}
