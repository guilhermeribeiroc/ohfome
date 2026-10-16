import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const FUSO = "America/Fortaleza";

function hoje() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

function dataValida(data: string | null): data is string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  return new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) === data;
}

interface LinhaEntrega {
  entregadorId: string | null;
  entregadorNome: string | null;
  entregaId: string;
  pedidoCodigo: number;
  bairro: string | null;
  taxa: string;
  total: string;
  em: string;
}

// Fechamento de entregas por entregador: só entregas concluídas (status "entregue")
// de pedidos não cancelados, agrupadas por quem entregou, dentro do período.
export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeAcessarModulo(sessao, "delivery")) return respostaAcessoNegado();

  const padrao = hoje();
  const inicioParam = request.nextUrl.searchParams.get("inicio");
  const fimParam = request.nextUrl.searchParams.get("fim");
  if ((inicioParam && !dataValida(inicioParam)) || (fimParam && !dataValida(fimParam))) {
    return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
  }
  const inicio = inicioParam ?? fimParam ?? padrao;
  const fim = fimParam ?? inicioParam ?? padrao;
  if (inicio > fim) return NextResponse.json({ erro: "A data inicial é maior que a final." }, { status: 400 });

  const linhas = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query<LinhaEntrega>(
      `select en.entregador_id as "entregadorId", ed.nome as "entregadorNome", en.id as "entregaId",
              p.codigo as "pedidoCodigo", en.bairro, p.taxa_entrega as taxa, p.total,
              coalesce(en.entregue_em, en.saiu_em, en.created_at) as em
         from entregas en
         join pedidos p on p.id = en.pedido_id
         left join entregadores ed on ed.id = en.entregador_id
        where en.status = 'entregue' and p.status <> 'cancelado'
          and (coalesce(en.entregue_em, en.saiu_em, en.created_at) at time zone '${FUSO}')::date between $1::date and $2::date
        order by ed.nome nulls last, coalesce(en.entregue_em, en.saiu_em, en.created_at)`,
      [inicio, fim]
    );
    return rows;
  });

  const grupos = new Map<string, { entregadorId: string | null; entregadorNome: string; quantidade: number; totalTaxas: number; totalPedidos: number; entregas: { id: string; pedidoCodigo: number; bairro: string | null; taxa: number; total: number; em: string }[] }>();
  for (const linha of linhas) {
    const chave = linha.entregadorId ?? "sem-entregador";
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = { entregadorId: linha.entregadorId, entregadorNome: linha.entregadorNome ?? "Sem entregador", quantidade: 0, totalTaxas: 0, totalPedidos: 0, entregas: [] };
      grupos.set(chave, grupo);
    }
    const taxa = Number(linha.taxa) || 0;
    const total = Number(linha.total) || 0;
    grupo.quantidade += 1;
    grupo.totalTaxas += taxa;
    grupo.totalPedidos += total;
    grupo.entregas.push({ id: linha.entregaId, pedidoCodigo: linha.pedidoCodigo, bairro: linha.bairro, taxa, total, em: new Date(linha.em).toISOString() });
  }
  const entregadores = [...grupos.values()].map((grupo) => ({
    ...grupo,
    totalTaxas: Math.round(grupo.totalTaxas * 100) / 100,
    totalPedidos: Math.round(grupo.totalPedidos * 100) / 100,
  }));
  return NextResponse.json({ inicio, fim, entregadores });
}
