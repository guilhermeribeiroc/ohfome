import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

function normalizarBusca(valor: string) {
  return valor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  const podeBuscar = sessao.role === "admin" || sessaoPodeAcessarModulo(sessao, "balcao") || sessaoPodeAcessarModulo(sessao, "delivery");
  if (!podeBuscar) return respostaAcessoNegado();

  const termo = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const normalizado = normalizarBusca(termo);
  if (normalizado.length < 2) return NextResponse.json([]);

  const clientes = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select id, nome, telefone, endereco, ponto_referencia as "pontoReferencia"
       from clientes
       where regexp_replace(translate(lower(nome), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g') like $1
          or regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') like $1
       order by nome asc, created_at desc
       limit 12`,
      [`%${normalizado}%`]
    );
    return rows;
  });
  return NextResponse.json(clientes);
}
