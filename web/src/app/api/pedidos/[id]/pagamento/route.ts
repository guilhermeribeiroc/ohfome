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
  if (forma !== "dinheiro" && forma !== "cartao" && forma !== "pix") {
    return NextResponse.json({ erro: "Forma de pagamento inválida." }, { status: 400 });
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
      const { rows: grupo } = await client.query<{ id: string; total: string; pixAutomatico: boolean }>(
        `select p.id, p.total,
                exists (select 1 from pagamentos_pix px where px.pedido_id = p.id) as "pixAutomatico"
           from pedidos p
          where (p.id = $1 or p.pedido_pai_id = $1) and p.status <> 'cancelado'
          for update of p`,
        [raiz]
      );
      if (grupo.some((linha) => linha.pixAutomatico)) {
        return { erro: "Este pedido foi pago pelo Pix automático e a forma de pagamento não pode ser alterada.", status: 409 };
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
            set forma_pagamento = $2, tipo_cartao = $3, troco_para = $4, pagamento_dividido = null
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
