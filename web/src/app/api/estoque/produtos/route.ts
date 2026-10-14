import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();

  const produtos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select p.id as "produtoId", p.nome, p.tamanho, p.imagem_url as "imagemUrl", p.controla_estoque_unidades as "controlaEstoqueUnidades",
              p.categoria_id as "categoriaId", coalesce(c.nome, 'Geral') as "categoriaNome",
              ep.saldo_fisico as "saldoFisico",
              coalesce(sum(ec.quantidade) filter (where ec.status in ('reservado', 'comprometido')), 0)::integer as comprometido,
              coalesce(ep.saldo_fisico, 0) - coalesce(sum(ec.quantidade) filter (where ec.status in ('reservado', 'comprometido')), 0)::integer as disponivel
       from produtos p
       left join categorias_produto c on c.id = p.categoria_id
       left join estoque_produtos ep on ep.produto_id = p.id and ep.estabelecimento_id = p.estabelecimento_id
       left join estoque_compromissos_produtos ec on ec.produto_id = p.id and ec.estabelecimento_id = p.estabelecimento_id
       group by p.id, p.categoria_id, c.nome, ep.saldo_fisico
       order by c.nome, p.nome, p.tamanho`,
    );
    return rows;
  });
  return NextResponse.json(produtos);
}

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();

  const body = await request.json().catch(() => null);
  const produtoId = typeof body?.produtoId === "string" ? body.produtoId : "";
  const acao = body?.acao;
  if (!produtoId) return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });

  try {
    const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      if (acao === "configurar") {
        const ativo = body?.ativo === true;
        const saldoInicial = Number(body?.saldoInicial ?? 0);
        if (!Number.isInteger(saldoInicial) || saldoInicial < 0) throw Object.assign(new Error("Informe uma contagem inicial inteira e não negativa."), { status: 400 });
        const { rows: produtoRows } = await client.query(`select id from produtos where id = $1 for update`, [produtoId]);
        if (!produtoRows[0]) throw Object.assign(new Error("Produto não encontrado."), { status: 404 });
        if (ativo) {
          const { rows: receita } = await client.query(`select 1 from produto_insumos where produto_id = $1 limit 1`, [produtoId]);
          if (receita.length) throw Object.assign(new Error("Remova a ficha técnica antes de ativar o estoque por unidade."), { status: 409 });
          await client.query(`update produtos set controla_estoque_unidades = true where id = $1`, [produtoId]);
          await client.query(`insert into estoque_produtos (produto_id, estabelecimento_id, saldo_fisico) values ($1, $2, 0) on conflict do nothing`, [produtoId, sessao.estabelecimentoId]);
          if (saldoInicial > 0) await client.query(`select fn_movimentar_estoque_produto($1, $2, 'entrada', $3, $4, 'Contagem inicial')`, [sessao.estabelecimentoId, produtoId, saldoInicial, sessao.usuarioId]);
        } else {
          const { rows: abertos } = await client.query(`select 1 from estoque_compromissos_produtos where produto_id = $1 and status in ('reservado', 'comprometido') limit 1`, [produtoId]);
          if (abertos.length) throw Object.assign(new Error("Conclua ou cancele os pedidos comprometidos antes de desativar."), { status: 409 });
          await client.query(`update produtos set controla_estoque_unidades = false where id = $1`, [produtoId]);
        }
        return { ok: true };
      }

      if (acao === "entrada" || acao === "ajuste") {
        const quantidade = Number(body?.quantidade);
        const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 300) || null : null;
        if (!Number.isInteger(quantidade) || quantidade < 0) throw Object.assign(new Error("Informe uma quantidade inteira não negativa."), { status: 400 });
        const { rows } = await client.query(
          `select fn_movimentar_estoque_produto($1, $2, $3, $4, $5, $6) as resultado`,
          [sessao.estabelecimentoId, produtoId, acao, quantidade, sessao.usuarioId, motivo]
        );
        return rows[0]?.resultado;
      }
      throw Object.assign(new Error("Ação inválida."), { status: 400 });
    });
    return NextResponse.json(resultado);
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? ((erro as { code?: string }).code === "23514" ? 409 : 500);
    if (status === 500) console.error("POST /api/estoque/produtos", erro);
    return NextResponse.json({ erro: status === 500 ? "Não foi possível atualizar o estoque." : (erro as Error).message }, { status });
  }
}
