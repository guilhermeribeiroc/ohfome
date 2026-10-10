import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

interface ItemEntrada {
  nome: string;
  tamanho: "P" | "M" | "G" | null;
  descricao: string;
  precoVenda: number;
  categoriaNome: string;
}

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();

  const body = await request.json().catch(() => null);
  const itensBrutos = Array.isArray(body?.itens) ? body.itens : [];
  if (itensBrutos.length === 0) return NextResponse.json({ erro: "Nenhum item para criar." }, { status: 400 });
  if (itensBrutos.length > 100) return NextResponse.json({ erro: "Envie no máximo 100 itens por vez." }, { status: 400 });

  const itens: ItemEntrada[] = itensBrutos.map((item: Record<string, unknown>) => ({
    nome: typeof item?.nome === "string" ? item.nome.trim() : "",
    tamanho: item?.tamanho === "P" || item?.tamanho === "M" || item?.tamanho === "G" ? item.tamanho : null,
    descricao: typeof item?.descricao === "string" ? item.descricao.trim() : "",
    precoVenda: Number(item?.precoVenda),
    categoriaNome: typeof item?.categoriaNome === "string" ? item.categoriaNome.trim() : "",
  }));

  if (itens.some((item) => item.nome.length < 2 || !Number.isFinite(item.precoVenda) || item.precoVenda < 0)) {
    return NextResponse.json({ erro: "Um ou mais itens têm nome ou preço inválido." }, { status: 400 });
  }

  const estabelecimentoId = sessao.estabelecimentoId;
  const criados = await comEstabelecimento(estabelecimentoId, async (client) => {
    const cacheCategorias = new Map<string, string>();
    const { rows: existentes } = await client.query<{ id: string; nome: string }>(
      "select id, nome from categorias_produto where estabelecimento_id = $1",
      [estabelecimentoId]
    );
    for (const categoria of existentes) cacheCategorias.set(categoria.nome.trim().toLowerCase(), categoria.id);

    async function categoriaId(nome: string): Promise<string | null> {
      if (!nome) return null;
      const chave = nome.toLowerCase();
      if (cacheCategorias.has(chave)) return cacheCategorias.get(chave)!;
      const { rows } = await client.query<{ id: string }>(
        `insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
         values ($1, $2, (select coalesce(max(ordem_exibicao), -1) + 1 from categorias_produto where estabelecimento_id = $1))
         on conflict (estabelecimento_id, nome) do update set nome = excluded.nome
         returning id`,
        [estabelecimentoId, nome]
      );
      const id = rows[0].id;
      cacheCategorias.set(chave, id);
      return id;
    }

    const resultado = [];
    for (const item of itens) {
      const catId = await categoriaId(item.categoriaNome);
      const { rows } = await client.query(
        `insert into produtos (estabelecimento_id, categoria_id, nome, tamanho, descricao, modo_precificacao, preco_custo, margem_percentual, preco_venda)
         values ($1, $2, $3, $4, $5, 'preco_manual', 0, 0, $6)
         returning
           id, nome, tamanho, descricao, imagem_url as "imagemUrl",
           coalesce((select nome from categorias_produto where id = $2), 'Geral') as "categoriaNome",
           modo_precificacao as "modoPrecificacao", preco_custo as "precoCusto",
           margem_percentual as "margemPercentual", preco_venda as "precoVenda", ativo`,
        [estabelecimentoId, catId, item.nome, item.tamanho, item.descricao || null, item.precoVenda]
      );
      resultado.push(rows[0]);
    }
    return resultado;
  });

  return NextResponse.json({ produtos: criados }, { status: 201 });
}
