import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  const podeConsultar = sessao.role === "admin" || sessao.role === "balcao" || sessaoPodeAcessarModulo(sessao, "delivery");
  if (!podeConsultar) return respostaAcessoNegado();

  const entregadores = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select e.id, e.nome, e.veiculo, e.telefone, e.ativo,
              count(en.id) filter (where en.status = 'em_rota')::integer as "cargaAtiva",
              (e.ativo and count(en.id) filter (where en.status = 'em_rota') = 0) as disponivel
       from entregadores e
       left join entregas en on en.entregador_id = e.id and en.status = 'em_rota'
       group by e.id
       order by e.nome`
    );
    return rows;
  });

  return NextResponse.json(entregadores);
}

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeAcessarModulo(sessao, "delivery")) return respostaAcessoNegado();

  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const veiculo = typeof body?.veiculo === "string" ? body.veiculo.trim() || null : null;
  const telefone = typeof body?.telefone === "string" ? body.telefone.trim() || null : null;

  if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome do entregador." }, { status: 400 });

  const entregador = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `insert into entregadores (estabelecimento_id, nome, veiculo, telefone)
       values ($1, $2, $3, $4)
       returning id, nome, veiculo, telefone, ativo, true as disponivel, 0::integer as "cargaAtiva"`,
      [sessao.estabelecimentoId, nome, veiculo, telefone]
    );
    return rows[0];
  });

  return NextResponse.json(entregador, { status: 201 });
}
