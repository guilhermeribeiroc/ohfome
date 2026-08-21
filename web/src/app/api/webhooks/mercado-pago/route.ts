import { NextResponse, type NextRequest } from "next/server";
import { comEstabelecimento, queryPublico } from "@/lib/db";
import { consultarOrdemMercadoPago, dadosPagamento, pagamentoAprovado, validarAssinaturaWebhook } from "@/lib/mercado-pago";

type EventoMercadoPago = { data?: { id?: string }; type?: string };

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null) as EventoMercadoPago | null;
  const orderIdDaUrl = request.nextUrl.searchParams.get("data.id");
  const orderId = orderIdDaUrl ?? corpo?.data?.id;
  if (!orderId || !validarAssinaturaWebhook({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: orderIdDaUrl,
  })) return NextResponse.json({ erro: "Assinatura de webhook inválida." }, { status: 401 });

  const linhas = await queryPublico<{ fn_estabelecimento_por_order_mercado_pago: string | null }>(
    "select fn_estabelecimento_por_order_mercado_pago($1)", [orderId]
  );
  const estabelecimentoId = linhas[0]?.fn_estabelecimento_por_order_mercado_pago;
  // A notificação pode chegar antes da transação local gravar a order, ou
  // ser de outro recurso Mercado Pago; nesses casos não há nada a processar.
  if (!estabelecimentoId) return NextResponse.json({ recebido: true });

  try {
    await comEstabelecimento(estabelecimentoId, async (client) => {
      const { rows } = await client.query<{
        pedidoId: string;
        valor: number;
        status: string;
      }>(`select pedido_id as "pedidoId", valor, status from pagamentos_pix
          where order_id = $1 for update`, [orderId]);
      const local = rows[0];
      if (!local || local.status === "pago" || local.status === "estornado") return;

      const ordem = await consultarOrdemMercadoPago(client, estabelecimentoId, orderId);
      const remoto = dadosPagamento(ordem);
      if (ordem.external_reference !== local.pedidoId || Math.abs(remoto.valor - local.valor) > 0.009) {
        throw new Error("A cobrança recebida não corresponde ao pedido local.");
      }

      if (pagamentoAprovado(ordem)) {
        await client.query(`update pagamentos_pix set status = 'pago', payment_id = coalesce($2, payment_id), confirmado_em = now(), detalhe_erro = null
          where order_id = $1`, [orderId, remoto.paymentId]);
        const { rows: liberados } = await client.query(`update pedidos
          set pagamento_status = 'pago', enviado_cozinha = true, enviado_cozinha_em = coalesce(enviado_cozinha_em, now())
          where id = $1 and enviado_cozinha = false and forma_pagamento = 'pix'
          returning id`, [local.pedidoId]);
        if (liberados[0]) await client.query("select baixar_estoque_pedido_confirmado($1::uuid)", [local.pedidoId]);
        return;
      }

      const statusRemoto = String(remoto.status).toLowerCase();
      const expirado = ["cancelled", "canceled", "rejected", "expired"].includes(statusRemoto);
      if (expirado) {
        await client.query(`update pagamentos_pix set status = $2, payment_id = coalesce($3, payment_id), detalhe_erro = $4 where order_id = $1`,
          [orderId, statusRemoto === "expired" ? "expirado" : "falhou", remoto.paymentId, `Status Mercado Pago: ${statusRemoto}`]);
        await client.query(`update pedidos set pagamento_status = 'falhou'
          where id = $1 and enviado_cozinha = false`, [local.pedidoId]);
      }
    });
    return NextResponse.json({ recebido: true });
  } catch (erro) {
    console.error("Webhook Mercado Pago", erro);
    return NextResponse.json({ erro: "Não foi possível processar a notificação." }, { status: 500 });
  }
}
