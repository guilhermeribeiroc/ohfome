import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

type GrupoInput = { nome?: unknown; minimoSelecoes?: unknown; maximoSelecoes?: unknown; definePreco?: unknown; ativo?: unknown; opcoes?: unknown };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  // Leitura liberada a quem atende: o balcão e o delivery precisam das perguntas (pão etc.).
  const { id } = await params;
  const grupos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(`select g.id, g.nome, g.minimo_selecoes as "minimoSelecoes", g.maximo_selecoes as "maximoSelecoes", g.define_preco as "definePreco", g.ativo, g.ordem,
      coalesce((select json_agg(json_build_object('id', o.id, 'nome', o.nome, 'acrescimo', o.acrescimo, 'ativo', o.ativo, 'ordem', o.ordem) order by o.ordem, o.nome) from produto_opcoes o where o.grupo_id = g.id), '[]') as opcoes
      from produto_grupos_opcoes g where g.produto_id = $1 order by g.ordem, g.nome`, [id]);
    return rows;
  });
  return NextResponse.json(grupos);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();
  const { id: produtoId } = await params;
  const body = await request.json().catch(() => null);
  const grupos = Array.isArray(body?.grupos) ? body.grupos as GrupoInput[] : null;
  if (!grupos) return NextResponse.json({ erro: "Opções inválidas." }, { status: 400 });
  if (grupos.length > 20) return NextResponse.json({ erro: "Máximo de 20 grupos por produto." }, { status: 400 });
  try {
    await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: produto } = await client.query(`select id from produtos where id = $1`, [produtoId]);
      if (!produto[0]) throw Object.assign(new Error("Produto não encontrado."), { status: 404 });
      await client.query(`delete from produto_grupos_opcoes where produto_id = $1`, [produtoId]);
      const precosDefinidos: number[] = [];
      for (const [indice, bruto] of grupos.entries()) {
        const nome = typeof bruto?.nome === "string" ? bruto.nome.trim() : "";
        const definePreco = bruto?.definePreco === true;
        // Pergunta que define o preço exige exatamente uma resposta.
        const minimo = definePreco ? 1 : Number(bruto?.minimoSelecoes ?? 0); const maximo = definePreco ? 1 : Number(bruto?.maximoSelecoes ?? 1);
        const opcoes = Array.isArray(bruto?.opcoes) ? bruto.opcoes : [];
        if (nome.length < 2 || !Number.isInteger(minimo) || !Number.isInteger(maximo) || minimo < 0 || maximo < 1 || minimo > maximo || opcoes.length < 1 || opcoes.length > 30) throw Object.assign(new Error("Revise nome, limites e opções de cada grupo."), { status: 400 });
        const { rows } = await client.query(`insert into produto_grupos_opcoes (estabelecimento_id, produto_id, nome, minimo_selecoes, maximo_selecoes, define_preco, ativo, ordem) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [sessao.estabelecimentoId, produtoId, nome, minimo, maximo, definePreco, bruto?.ativo !== false, indice]);
        for (const [ordem, opcaoBruta] of opcoes.entries()) {
          const opcao = opcaoBruta as Record<string, unknown>; const nomeOpcao = typeof opcao.nome === "string" ? opcao.nome.trim() : ""; const acrescimo = Number(opcao.acrescimo ?? 0);
          if (!nomeOpcao || !Number.isFinite(acrescimo) || acrescimo < 0) throw Object.assign(new Error("Opção inválida."), { status: 400 });
          if (definePreco && !(acrescimo > 0)) throw Object.assign(new Error(`Informe o preço do sanduíche com "${nomeOpcao}".`), { status: 400 });
          if (definePreco && opcao.ativo !== false) precosDefinidos.push(acrescimo);
          await client.query(`insert into produto_opcoes (estabelecimento_id, grupo_id, nome, acrescimo, ativo, ordem) values ($1,$2,$3,$4,$5,$6)`, [sessao.estabelecimentoId, rows[0].id, nomeOpcao, acrescimo, opcao.ativo !== false, ordem]);
        }
      }
      // O preço de exibição do produto vira o menor preço entre as opções ("a partir de"), em preço manual para a margem não sobrescrever.
      if (precosDefinidos.length) await client.query(`update produtos set preco_venda = $2, modo_precificacao = 'preco_manual', updated_at = now() where id = $1`, [produtoId, Math.min(...precosDefinidos)]);
    });
    return GET(request, { params: Promise.resolve({ id: produtoId }) });
  } catch (erro) { const status = (erro as { status?: number }).status ?? 500; return NextResponse.json({ erro: status < 500 ? (erro as Error).message : "Não foi possível salvar as opções." }, { status }); }
}
