import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";
import { montarRelatorioCsv, nomeArquivoRelatorio, type MovimentoRelatorio, type VendaRelatorio } from "@/lib/relatorio-financeiro";

const FUSO = "America/Fortaleza";
const LIMITE_VENDAS = 20_000;

function hoje() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

function dataValida(data: string | null): data is string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  return new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) === data;
}

// Relatório de fechamento de caixa em CSV. Mesmas regras do financeiro da tela:
// pedidos finalizados pela data de criação (fuso de Fortaleza).
export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!(await sessaoEhAdministrador(sessao))) return NextResponse.json({ erro: "Apenas administradores podem baixar o relatório financeiro." }, { status: 403 });

  const padrao = hoje();
  const inicioParam = request.nextUrl.searchParams.get("inicio");
  const fimParam = request.nextUrl.searchParams.get("fim");
  if ((inicioParam && !dataValida(inicioParam)) || (fimParam && !dataValida(fimParam))) return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
  const inicio = inicioParam ?? fimParam ?? padrao;
  const fim = fimParam ?? inicioParam ?? padrao;
  const dias = (new Date(`${fim}T12:00:00Z`).getTime() - new Date(`${inicio}T12:00:00Z`).getTime()) / 86_400_000;
  if (inicio > fim || dias > 366) return NextResponse.json({ erro: "Selecione um período válido de até 12 meses." }, { status: 400 });

  const dados = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const [estabelecimento, vendas, movimentos, fixos] = await Promise.all([
      client.query<{ nome: string }>("select nome from estabelecimentos where id = $1", [sessao.estabelecimentoId]),
      client.query(
        `select p.codigo, p.tipo, p.created_at as "createdAt", m.numero as "mesaNumero", coalesce(c.nome, p.cliente_nome_avulso) as "clienteNome",
                p.forma_pagamento as "formaPagamento", p.tipo_cartao as "tipoCartao", p.pagamento_dividido as "pagamentoDividido",
                p.total, p.taxa_entrega as "taxaEntrega", px.taxa as "taxaPix", px.valor_liquido as "valorLiquidoPix",
                coalesce((select sum(ip.quantidade * coalesce(pr.preco_custo, 0)) from itens_pedido ip left join produtos pr on pr.id = ip.produto_id where ip.pedido_id = p.id), 0) as "custoProdutos"
           from pedidos p
           left join comandas cm on cm.id = p.comanda_id
           left join mesas m on m.id = cm.mesa_id
           left join clientes c on c.id = p.cliente_id
           left join pagamentos_pix px on px.pedido_id = p.id and px.status = 'pago'
          where p.status = 'finalizado' and (p.created_at at time zone '${FUSO}')::date between $1::date and $2::date
          order by p.created_at
          limit ${LIMITE_VENDAS}`,
        [inicio, fim]
      ),
      client.query(
        `select to_char(data_movimento, 'YYYY-MM-DD') as "dataMovimento", tipo, categoria, descricao, valor
           from movimentacoes_financeiras where data_movimento between $1::date and $2::date order by data_movimento, created_at`,
        [inicio, fim]
      ),
      client.query<{ total: string }>(
        `select coalesce(sum(cf.valor_mensal / extract(day from (date_trunc('month', dias.dia) + interval '1 month - 1 day'))), 0) as total
           from custos_fixos cf cross join generate_series($1::date, $2::date, interval '1 day') as dias(dia) where cf.ativo`,
        [inicio, fim]
      ),
    ]);
    return { estabelecimento: estabelecimento.rows[0]?.nome ?? "Estabelecimento", vendas: vendas.rows, movimentos: movimentos.rows, custosFixos: Number(fixos.rows[0]?.total ?? 0) };
  });

  const numero = (valor: unknown) => Number(valor) || 0;
  const vendas: VendaRelatorio[] = dados.vendas.map((venda) => ({
    ...venda,
    createdAt: new Date(venda.createdAt).toISOString(),
    total: numero(venda.total),
    taxaEntrega: numero(venda.taxaEntrega),
    custoProdutos: numero(venda.custoProdutos),
    taxaPix: venda.taxaPix === null ? null : numero(venda.taxaPix),
    valorLiquidoPix: venda.valorLiquidoPix === null ? null : numero(venda.valorLiquidoPix),
  }));
  const movimentos: MovimentoRelatorio[] = dados.movimentos.map((movimento) => ({ ...movimento, valor: numero(movimento.valor) }));
  const emitidoEm = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(",", "");

  const csv = montarRelatorioCsv({ estabelecimento: dados.estabelecimento, inicio, fim, emitidoEm, vendas, movimentos, custosFixosPeriodo: dados.custosFixos });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivoRelatorio(inicio, fim)}"`,
      "Cache-Control": "no-store",
    },
  });
}
