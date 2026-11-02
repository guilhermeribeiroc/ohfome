import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeUsarCrediario } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

// Clientes com crediário e quanto cada um deve hoje. Quem deve fica primeiro.
export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeUsarCrediario(sessao)) return respostaAcessoNegado();

  const clientes = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select c.id, c.nome, c.telefone, c.limite_crediario as "limiteCrediario",
              coalesce(v.compras, 0) as compras, coalesce(pg.pago, 0) as pago,
              coalesce(v.compras, 0) - coalesce(pg.pago, 0) as saldo,
              v.ultima_compra as "ultimaCompra", pg.ultimo_pagamento as "ultimoPagamento"
         from clientes c
         left join (select cliente_id, sum(total) as compras, max(created_at) as ultima_compra from pedidos
                     where forma_pagamento = 'crediario' and status <> 'cancelado' group by cliente_id) v on v.cliente_id = c.id
         left join (select cliente_id, sum(valor) as pago, max(created_at) as ultimo_pagamento
                      from crediario_pagamentos group by cliente_id) pg on pg.cliente_id = c.id
        where c.crediario or coalesce(v.compras, 0) <> 0 or coalesce(pg.pago, 0) <> 0
        order by (coalesce(v.compras, 0) - coalesce(pg.pago, 0)) desc, c.nome asc`
    );
    return rows.map((linha) => ({
      ...linha,
      compras: Number(linha.compras), pago: Number(linha.pago), saldo: Number(linha.saldo),
      limiteCrediario: linha.limiteCrediario === null ? null : Number(linha.limiteCrediario),
    }));
  });
  return NextResponse.json({
    clientes,
    totalAReceber: clientes.reduce((soma, cliente) => soma + Math.max(0, cliente.saldo), 0),
  });
}
