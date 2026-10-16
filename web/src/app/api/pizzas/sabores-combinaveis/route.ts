import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

// Todas as pizzas ativas do estabelecimento com seus tamanhos e sabores. Serve ao
// "meio a meio" entre produtos diferentes (ex.: metade Pizza Salgada, metade Pizza Doce):
// o segundo sabor pode vir de qualquer pizza que tenha o mesmo tamanho (pelo nome).
export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const [produtos, tamanhos, sabores, precos] = await Promise.all([
      client.query(`select id, nome from produtos where tipo_produto = 'pizza' and ativo order by nome`),
      client.query(`select produto_id as "produtoId", nome, preco_sabor_unico as "precoSaborUnico", permite_meio_a_meio as "permiteMeioAMeio" from pizza_tamanhos where ativo order by ordem, nome`),
      client.query(`select s.id, s.produto_id as "produtoId", s.nome, s.acrescimo, s.permite_meio_a_meio as "permiteMeioAMeio" from pizza_sabores s join produtos p on p.id = s.produto_id and p.ativo where s.ativo order by s.ordem, s.nome`),
      client.query(`select sp.sabor_id as "saborId", pt.nome as tamanho, sp.preco from pizza_sabor_precos sp join pizza_tamanhos pt on pt.id = sp.tamanho_id`),
    ]);
    const precosPorSabor = new Map<string, Record<string, number>>();
    for (const linha of precos.rows) precosPorSabor.set(linha.saborId, { ...precosPorSabor.get(linha.saborId), [linha.tamanho]: Number(linha.preco) });
    return produtos.rows.map((produto) => ({
      produtoId: produto.id as string,
      produtoNome: produto.nome as string,
      tamanhos: tamanhos.rows.filter((tamanho) => tamanho.produtoId === produto.id).map((tamanho) => ({ nome: tamanho.nome as string, precoSaborUnico: Number(tamanho.precoSaborUnico), permiteMeioAMeio: tamanho.permiteMeioAMeio as boolean })),
      sabores: sabores.rows.filter((sabor) => sabor.produtoId === produto.id).map((sabor) => ({ id: sabor.id as string, nome: sabor.nome as string, acrescimo: Number(sabor.acrescimo), permiteMeioAMeio: sabor.permiteMeioAMeio as boolean, precos: precosPorSabor.get(sabor.id) ?? {} })),
    })).filter((produto) => produto.sabores.length > 0);
  });
  return NextResponse.json(resultado);
}
