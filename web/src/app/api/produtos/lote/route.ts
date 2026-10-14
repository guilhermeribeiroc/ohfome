import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

interface ItemEntrada {
  nome: string;
  tamanho: "P" | "M" | "G" | null;
  descricao: string;
  precoVenda: number;
  categoriaNome: string;
  tiposPao: string[];
}
interface PizzaEntrada {
  nome: string; categoriaNome: string; descricao: string; regraMeioAMeio: "maior_valor" | "media" | "preco_fixo";
  tamanhos: { nome: string; precoSaborUnico: number; precoMeioAMeio: number | null }[];
  sabores: { nome: string; descricao: string; acrescimo: number }[];
}

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();

  const body = await request.json().catch(() => null);
  const itensBrutos = Array.isArray(body?.itens) ? body.itens : [];
  const pizzasBrutas = Array.isArray(body?.pizzas) ? body.pizzas : [];
  if (itensBrutos.length + pizzasBrutas.length === 0) return NextResponse.json({ erro: "Nenhum item para criar." }, { status: 400 });
  if (itensBrutos.length + pizzasBrutas.length > 100) return NextResponse.json({ erro: "Envie no máximo 100 itens por vez." }, { status: 400 });

  const itens: ItemEntrada[] = itensBrutos.map((item: Record<string, unknown>) => ({
    nome: typeof item?.nome === "string" ? item.nome.trim() : "",
    tamanho: item?.tamanho === "P" || item?.tamanho === "M" || item?.tamanho === "G" ? item.tamanho : null,
    descricao: typeof item?.descricao === "string" ? item.descricao.trim() : "",
    precoVenda: Number(item?.precoVenda),
    categoriaNome: typeof item?.categoriaNome === "string" ? item.categoriaNome.trim() : "",
    tiposPao: Array.isArray(item?.tiposPao)
      ? Array.from(new Set(item.tiposPao.map((tipo: unknown) => (typeof tipo === "string" ? tipo.trim() : "")).filter((tipo: string) => tipo.length >= 2)))
      : [],
  }));

  if (itens.some((item) => item.nome.length < 2 || !Number.isFinite(item.precoVenda) || item.precoVenda < 0)) {
    return NextResponse.json({ erro: "Um ou mais itens têm nome ou preço inválido." }, { status: 400 });
  }
  const pizzas: PizzaEntrada[] = pizzasBrutas.map((pizza: Record<string, unknown>) => ({
    nome: typeof pizza?.nome === "string" ? pizza.nome.trim() : "",
    categoriaNome: typeof pizza?.categoriaNome === "string" ? pizza.categoriaNome.trim() : "",
    descricao: typeof pizza?.descricao === "string" ? pizza.descricao.trim() : "",
    regraMeioAMeio: pizza?.regraMeioAMeio === "media" || pizza?.regraMeioAMeio === "preco_fixo" ? pizza.regraMeioAMeio : "maior_valor",
    tamanhos: (Array.isArray(pizza?.tamanhos) ? pizza.tamanhos : []).map((tamanho: Record<string, unknown>) => ({ nome: typeof tamanho?.nome === "string" ? tamanho.nome.trim() : "", precoSaborUnico: Number(tamanho?.precoSaborUnico), precoMeioAMeio: tamanho?.precoMeioAMeio === null || tamanho?.precoMeioAMeio === undefined ? null : Number(tamanho.precoMeioAMeio) })),
    sabores: (Array.isArray(pizza?.sabores) ? pizza.sabores : []).map((sabor: Record<string, unknown>) => ({ nome: typeof sabor?.nome === "string" ? sabor.nome.trim() : "", descricao: typeof sabor?.descricao === "string" ? sabor.descricao.trim() : "", acrescimo: Number(sabor?.acrescimo ?? 0) })),
  }));
  if (pizzas.some((pizza) => pizza.nome.length < 2 || !pizza.categoriaNome || !pizza.tamanhos.length || !pizza.sabores.length || pizza.tamanhos.some((tamanho) => !tamanho.nome || !Number.isFinite(tamanho.precoSaborUnico) || tamanho.precoSaborUnico < 0 || (tamanho.precoMeioAMeio !== null && (!Number.isFinite(tamanho.precoMeioAMeio) || tamanho.precoMeioAMeio < 0))) || (pizza.regraMeioAMeio === "preco_fixo" && pizza.tamanhos.some((tamanho) => tamanho.precoMeioAMeio === null)) || pizza.sabores.some((sabor) => sabor.nome.length < 2 || !Number.isFinite(sabor.acrescimo) || sabor.acrescimo < 0))) return NextResponse.json({ erro: "Revise tamanhos, sabores e preços das pizzas." }, { status: 400 });

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
      if (item.tiposPao.length > 0) {
        const { rows: grupoRows } = await client.query<{ id: string }>(
          `insert into produto_grupos_opcoes (estabelecimento_id, produto_id, nome, minimo_selecoes, maximo_selecoes, ativo, ordem) values ($1,$2,'Pão',1,1,true,0) returning id`,
          [estabelecimentoId, rows[0].id]
        );
        for (const [ordem, tipoPao] of item.tiposPao.entries()) {
          await client.query(
            `insert into produto_opcoes (estabelecimento_id, grupo_id, nome, acrescimo, ativo, ordem) values ($1,$2,$3,0,true,$4)`,
            [estabelecimentoId, grupoRows[0].id, tipoPao, ordem]
          );
        }
      }
      resultado.push(rows[0]);
    }
    for (const pizza of pizzas) {
      const catId = await categoriaId(pizza.categoriaNome);
      const { rows } = await client.query(`insert into produtos (estabelecimento_id, categoria_id, nome, descricao, modo_precificacao, preco_custo, margem_percentual, preco_venda, tipo_produto) values ($1,$2,$3,$4,'preco_manual',0,0,$5,'pizza') returning id, nome, descricao`, [estabelecimentoId, catId, pizza.nome, pizza.descricao || null, Math.min(...pizza.tamanhos.map((tamanho) => tamanho.precoSaborUnico))]);
      const produto = rows[0];
      await client.query(`insert into produto_configuracoes_pizza (produto_id, estabelecimento_id, regra_meio_a_meio) values ($1,$2,$3)`, [produto.id, estabelecimentoId, pizza.regraMeioAMeio]);
      for (const [ordem, tamanho] of pizza.tamanhos.entries()) await client.query(`insert into pizza_tamanhos (produto_id, estabelecimento_id, nome, preco_sabor_unico, preco_meio_a_meio, ordem) values ($1,$2,$3,$4,$5,$6)`, [produto.id, estabelecimentoId, tamanho.nome, tamanho.precoSaborUnico, tamanho.precoMeioAMeio, ordem]);
      for (const [ordem, sabor] of pizza.sabores.entries()) await client.query(`insert into pizza_sabores (produto_id, estabelecimento_id, nome, descricao, acrescimo, ordem) values ($1,$2,$3,$4,$5,$6)`, [produto.id, estabelecimentoId, sabor.nome, sabor.descricao || null, sabor.acrescimo, ordem]);
      resultado.push(produto);
    }
    return resultado;
  });

  return NextResponse.json({ produtos: criados }, { status: 201 });
}
