import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

type TamanhoInput = { nome?: unknown; precoSaborUnico?: unknown; precoMeioAMeio?: unknown; ativo?: unknown };
type SaborInput = { nome?: unknown; descricao?: unknown; acrescimo?: unknown; ativo?: unknown };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  const { id } = await params;
  const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(`select regra_meio_a_meio as "regraMeioAMeio" from produto_configuracoes_pizza where produto_id = $1`, [id]);
    if (!rows[0]) return null;
    const [tamanhos, sabores] = await Promise.all([
      client.query(`select id, nome, preco_sabor_unico as "precoSaborUnico", preco_meio_a_meio as "precoMeioAMeio", ativo, ordem from pizza_tamanhos where produto_id = $1 order by ordem, nome`, [id]),
      client.query(`select id, nome, descricao, acrescimo, ativo, ordem from pizza_sabores where produto_id = $1 order by ordem, nome`, [id]),
    ]);
    return { ...rows[0], tamanhos: tamanhos.rows, sabores: sabores.rows };
  });
  return NextResponse.json(resultado ?? { regraMeioAMeio: "maior_valor", tamanhos: [], sabores: [] });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();
  const { id: produtoId } = await params;
  const body = await request.json().catch(() => null);
  const regra = body?.regraMeioAMeio;
  const tamanhos = Array.isArray(body?.tamanhos) ? body.tamanhos as TamanhoInput[] : null;
  const sabores = Array.isArray(body?.sabores) ? body.sabores as SaborInput[] : null;
  if (!tamanhos || !sabores || !["maior_valor", "media", "preco_fixo"].includes(regra) || tamanhos.length < 1 || tamanhos.length > 10 || sabores.length < 1 || sabores.length > 60) return NextResponse.json({ erro: "Informe regra, ao menos um tamanho e um sabor." }, { status: 400 });
  try {
    await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: produto } = await client.query(`select id from produtos where id = $1`, [produtoId]);
      if (!produto[0]) throw Object.assign(new Error("Produto não encontrado."), { status: 404 });
      for (const tamanho of tamanhos) {
        const nome = typeof tamanho.nome === "string" ? tamanho.nome.trim() : "";
        const preco = Number(tamanho.precoSaborUnico); const fixo = tamanho.precoMeioAMeio === null || tamanho.precoMeioAMeio === undefined || tamanho.precoMeioAMeio === "" ? null : Number(tamanho.precoMeioAMeio);
        if (!nome || nome.length > 40 || !Number.isFinite(preco) || preco < 0 || (fixo !== null && (!Number.isFinite(fixo) || fixo < 0))) throw Object.assign(new Error("Revise os tamanhos e preços."), { status: 400 });
        if (regra === "preco_fixo" && fixo === null) throw Object.assign(new Error("Informe o preço meio a meio de cada tamanho."), { status: 400 });
      }
      for (const sabor of sabores) { const nome = typeof sabor.nome === "string" ? sabor.nome.trim() : ""; const acrescimo = Number(sabor.acrescimo ?? 0); if (nome.length < 2 || nome.length > 80 || !Number.isFinite(acrescimo) || acrescimo < 0) throw Object.assign(new Error("Revise os sabores e acréscimos."), { status: 400 }); }
      await client.query(`update produtos set tipo_produto = 'pizza', tamanho = null where id = $1`, [produtoId]);
      await client.query(`insert into produto_configuracoes_pizza (produto_id, estabelecimento_id, regra_meio_a_meio) values ($1,$2,$3) on conflict (produto_id) do update set regra_meio_a_meio = excluded.regra_meio_a_meio, updated_at = now()`, [produtoId, sessao.estabelecimentoId, regra]);
      await client.query(`delete from pizza_tamanhos where produto_id = $1`, [produtoId]);
      await client.query(`delete from pizza_sabores where produto_id = $1`, [produtoId]);
      for (const [ordem, tamanho] of tamanhos.entries()) await client.query(`insert into pizza_tamanhos (produto_id, estabelecimento_id, nome, preco_sabor_unico, preco_meio_a_meio, ativo, ordem) values ($1,$2,$3,$4,$5,$6,$7)`, [produtoId, sessao.estabelecimentoId, (tamanho.nome as string).trim(), Number(tamanho.precoSaborUnico), tamanho.precoMeioAMeio === null || tamanho.precoMeioAMeio === undefined || tamanho.precoMeioAMeio === "" ? null : Number(tamanho.precoMeioAMeio), tamanho.ativo !== false, ordem]);
      for (const [ordem, sabor] of sabores.entries()) await client.query(`insert into pizza_sabores (produto_id, estabelecimento_id, nome, descricao, acrescimo, ativo, ordem) values ($1,$2,$3,$4,$5,$6,$7)`, [produtoId, sessao.estabelecimentoId, (sabor.nome as string).trim(), typeof sabor.descricao === "string" ? sabor.descricao.trim() || null : null, Number(sabor.acrescimo ?? 0), sabor.ativo !== false, ordem]);
    });
    return GET(request, { params: Promise.resolve({ id: produtoId }) });
  } catch (erro) { const status = (erro as { status?: number }).status ?? 500; return NextResponse.json({ erro: status < 500 ? (erro as Error).message : "Não foi possível salvar a pizza." }, { status }); }
}
