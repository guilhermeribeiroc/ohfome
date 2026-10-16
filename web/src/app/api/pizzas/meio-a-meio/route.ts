import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

// Configuração do meio a meio para TODAS as pizzas do estabelecimento de uma vez.
// Tamanhos e sabores são agrupados pelo nome (P, M, G, Calabresa...): mudar "P" aqui
// muda o "P" de todas as pizzas que o têm, sem abrir produto por produto.

type Item = { nome?: unknown; permite?: unknown };
const REGRAS_GLOBAIS = ["maior_valor", "media"];

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const agrupar = (tabela: "pizza_tamanhos" | "pizza_sabores") => client.query(
      `select min(t.nome) as nome, bool_and(t.permite_meio_a_meio) as permite, bool_or(t.permite_meio_a_meio) as algum, count(distinct t.produto_id)::int as pizzas
       from ${tabela} t join produtos p on p.id = t.produto_id and p.ativo
       where t.estabelecimento_id = $1 and t.ativo
       group by lower(t.nome) order by min(t.ordem), min(t.nome)`,
      [sessao.estabelecimentoId]
    );
    const [tamanhos, sabores, regras, pizzas] = await Promise.all([
      agrupar("pizza_tamanhos"),
      agrupar("pizza_sabores"),
      client.query(`select c.regra_meio_a_meio as regra from produto_configuracoes_pizza c join produtos p on p.id = c.produto_id and p.ativo where c.estabelecimento_id = $1 group by c.regra_meio_a_meio`, [sessao.estabelecimentoId]),
      client.query(`select count(*)::int as total from produto_configuracoes_pizza c join produtos p on p.id = c.produto_id and p.ativo where c.estabelecimento_id = $1`, [sessao.estabelecimentoId]),
    ]);
    return {
      totalPizzas: pizzas.rows[0]?.total ?? 0,
      // null = pizzas com regras diferentes entre si (ou preço próprio por tamanho).
      regraMeioAMeio: regras.rows.length === 1 && REGRAS_GLOBAIS.includes(regras.rows[0].regra) ? regras.rows[0].regra : null,
      tamanhos: tamanhos.rows,
      sabores: sabores.rows,
    };
  });
  return NextResponse.json(resultado);
}

function itensValidos(valor: unknown): { nome: string; permite: boolean }[] | null {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.length > 300) return null;
  const itens: { nome: string; permite: boolean }[] = [];
  for (const bruto of valor as Item[]) {
    const nome = typeof bruto?.nome === "string" ? bruto.nome.trim() : "";
    if (!nome || nome.length > 80 || typeof bruto?.permite !== "boolean") return null;
    itens.push({ nome, permite: bruto.permite });
  }
  return itens;
}

export async function PUT(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();
  const body = await request.json().catch(() => null);
  const tamanhos = itensValidos(body?.tamanhos);
  const sabores = itensValidos(body?.sabores);
  const regra = body?.regraMeioAMeio;
  if (!tamanhos || !sabores || (regra !== undefined && !REGRAS_GLOBAIS.includes(regra))) return NextResponse.json({ erro: "Dados de meio a meio inválidos." }, { status: 400 });

  await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const aplicar = async (tabela: "pizza_tamanhos" | "pizza_sabores", itens: { nome: string; permite: boolean }[]) => {
      if (!itens.length) return;
      await client.query(
        `update ${tabela} t set permite_meio_a_meio = x.permite
         from unnest($1::text[], $2::boolean[]) as x(nome, permite)
         where lower(t.nome) = lower(x.nome) and t.estabelecimento_id = $3`,
        [itens.map((item) => item.nome), itens.map((item) => item.permite), sessao.estabelecimentoId]
      );
    };
    await aplicar("pizza_tamanhos", tamanhos);
    await aplicar("pizza_sabores", sabores);
    if (regra) await client.query(`update produto_configuracoes_pizza set regra_meio_a_meio = $1, updated_at = now() where estabelecimento_id = $2`, [regra, sessao.estabelecimentoId]);
  });
  return GET(request);
}
