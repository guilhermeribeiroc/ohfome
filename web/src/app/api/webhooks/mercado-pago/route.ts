import { NextResponse, type NextRequest } from "next/server";
import { comEstabelecimento, queryPublico } from "@/lib/db";
import { sincronizarCobrancaPixMercadoPago, validarAssinaturaWebhook } from "@/lib/mercado-pago";

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
      await sincronizarCobrancaPixMercadoPago(client, estabelecimentoId, orderId);
    });
    return NextResponse.json({ recebido: true });
  } catch (erro) {
    console.error("Webhook Mercado Pago", erro);
    return NextResponse.json({ erro: "Não foi possível processar a notificação." }, { status: 500 });
  }
}
