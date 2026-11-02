import { validarPedidoNoCrediario } from "@/lib/crediario";
import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  const podeAlterar = sessao.role === "admin" || sessaoPodeAcessarModulo(sessao, "balcao") || sessaoPodeAcessarModulo(sessao, "delivery");
  if (!podeAlterar) return respostaAcessoNegado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const forma = body?.formaPagamento;
  const tipoCartao = body?.tipoCartao;
  const trocoPara = Number(body?.trocoPara);
  if (forma !== "dinheiro" && forma !== "cartao" && forma !== "pix" && forma !== "misto" && forma !== "crediario") {
    return NextResponse.json({ erro: "Forma de pagamento inválida." }, { status: 400 });
  }
  // Duas formas (ex.: R$ 20 em dinheiro e o resto no cartão): sempre 2 partes, de formas diferentes.
  type Parte = { forma: "dinheiro" | "cartao" | "pix"; valor: number; tipoCartao?: "credito" | "debito"; trocoPara?: number };
  let partes: Parte[] = [];
  if (forma === "misto") {
    const bruto = Array.isArray(body?.partes) ? body.partes : [];
    partes = bruto.map((parte: Record<string, unknown>) => ({
      forma: parte?.forma as Parte["forma"],
      valor: Math.round(Number(parte?.valor) * 100) / 100,
      ...(parte?.forma === "cartao" ? { tipoCartao: parte.tipoCartao as Parte["tipoCartao"] } : {}),
      ...(parte?.forma === "dinheiro" && Number(parte?.trocoPara) > 0 ? { trocoPara: Math.round(Number(parte.trocoPara) * 100) / 100 } : {}),
    }));
    if (partes.length !== 2) return NextResponse.json({ erro: "Escolha exatamente duas formas de pagamento." }, { status: 400 });
    if (partes[0].forma === partes[1].forma) return NextResponse.json({ erro: "As duas formas precisam ser diferentes." }, { status: 400 });
    if (partes.some((parte) => !["dinheiro", "cartao", "pix"].includes(parte.forma) || !Number.isFinite(parte.valor) || parte.valor <= 0)) return NextResponse.json({ erro: "Informe o valor de cada forma." }, { status: 400 });
    if (partes.some((parte) => parte.forma === "cartao" && parte.tipoCartao !== "credito" && parte.tipoCartao !== "debito")) return NextResponse.json({ erro: "Informe crédito ou débito na parte do cartão." }, { status: 400 });
    if (partes.some((parte) => parte.trocoPara !== undefined && parte.trocoPara < parte.valor)) return NextResponse.json({ erro: "O troco precisa ser para um valor igual ou maior que a parte em dinheiro." }, { status: 400 });
  }
  if (forma === "cartao" && tipoCartao !== "credito" && tipoCartao !== "debito") {
    return NextResponse.json({ erro: "Informe crédito ou débito." }, { status: 400 });
  }

  try {
    const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query<{ id: string; tipo: string; status: string; pedidoPaiId: string | null }>(
        `select id, tipo, status, pedido_pai_id as "pedidoPaiId" from pedidos where id = $1 for update`, [id]
      );
      const pedido = rows[0];
      if (!pedido) return { erro: "Pedido não encontrado.", status: 404 };
      if (pedido.status === "cancelado") return { erro: "Pedido cancelado não pode mudar de pagamento.", status: 409 };
      // Um atendimento = o pedido original + os adicionais dele. A forma vale para todos, senão o
      // financeiro mostraria o mesmo cliente pagando de jeitos diferentes.
      const raiz = pedido.pedidoPaiId ?? pedido.id;
      const { rows: grupo } = await client.query<{ id: string; total: string; clienteId: string | null; statusPedido: string; pixAutomatico: boolean }>(
        `select p.id, p.total, p.cliente_id as "clienteId", p.status as "statusPedido",
                exists (select 1 from pagamentos_pix px where px.pedido_id = p.id) as "pixAutomatico"
           from pedidos p
          where (p.id = $1 or p.pedido_pai_id = $1) and p.status <> 'cancelado'
          for update of p`,
        [raiz]
      );
      if (grupo.some((linha) => linha.pixAutomatico)) {
        return { erro: "Este pedido foi pago pelo Pix automático e a forma de pagamento não pode ser alterada.", status: 409 };
      }

      if (forma === "crediario") {
        // Vai para a conta do cliente: precisa de cliente com crediário e respeitar o limite dele.
        const raizDoGrupo = grupo.find((linha) => linha.id === raiz) ?? grupo[0];
        const totalGrupo = grupo.reduce((soma, linha) => soma + Number(linha.total), 0);
        await validarPedidoNoCrediario(client, grupo.map((linha) => linha.id), raizDoGrupo.clienteId, totalGrupo);
        await client.query(
          `update pedidos set forma_pagamento = 'crediario', tipo_cartao = null, troco_para = null, pagamento_dividido = null,
                  pagamento_status = case when status = 'finalizado' then 'pendente' else pagamento_status end
            where id = any($1::uuid[])`,
          [grupo.map((linha) => linha.id)]
        );
        return { ok: true as const, atualizados: grupo.length };
      }
      if (forma === "misto") {
        if (grupo.length > 1) return { erro: "Este pedido tem adicionais separados. Use uma única forma de pagamento nele.", status: 409 };
        const total = Number(grupo[0].total);
        const soma = partes.reduce((acc, parte) => acc + parte.valor, 0);
        if (Math.abs(soma - total) > 0.01) return { erro: `A soma das duas formas (R$ ${soma.toFixed(2).replace(".", ",")}) precisa ser igual ao total do pedido (R$ ${total.toFixed(2).replace(".", ",")}).`, status: 400 };
        await client.query(
          `update pedidos set forma_pagamento = 'misto', tipo_cartao = null, troco_para = null, pagamento_dividido = $2::jsonb,
                pagamento_status = case when status = 'finalizado' and forma_pagamento = 'crediario' then 'pago' else pagamento_status end
            where id = $1`,
          [grupo[0].id, JSON.stringify(partes)]
        );
        return { ok: true as const, atualizados: 1 };
      }

      let troco: number | null = null;
      if (forma === "dinheiro" && Number.isFinite(trocoPara) && trocoPara > 0) {
        const total = grupo.reduce((soma, linha) => soma + Number(linha.total), 0);
        if (trocoPara < total) {
          return { erro: `O troco precisa ser para um valor igual ou maior que o total (R$ ${total.toFixed(2).replace(".", ",")}).`, status: 400 };
        }
        troco = trocoPara;
      }

      await client.query(
        `update pedidos
            set forma_pagamento = $2, tipo_cartao = $3, troco_para = $4, pagamento_dividido = null,
                pagamento_status = case when status = 'finalizado' and forma_pagamento = 'crediario' then 'pago' else pagamento_status end
          where id = any($1::uuid[])`,
        [grupo.map((linha) => linha.id), forma, forma === "cartao" ? tipoCartao : null, troco]
      );
      return { ok: true as const, atualizados: grupo.length };
    });

    if ("erro" in resultado) return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
    return NextResponse.json(resultado);
  } catch (erro) {
    console.error("PATCH /api/pedidos/[id]/pagamento", erro);
    return NextResponse.json({ erro: "Não foi possível alterar a forma de pagamento." }, { status: 500 });
  }
}
