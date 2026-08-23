import { NextResponse, type NextRequest } from "next/server";
import { comEstabelecimento, queryPublico } from "@/lib/db";
import { sincronizarCobrancaPixMercadoPago } from "@/lib/mercado-pago";

// Esta rota é a fonte de verdade do acompanhamento do cliente. Ela nunca
// pode ser reaproveitada pelo cache do Next, CDN ou navegador.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CABECALHOS_SEM_CACHE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function respostaJson(corpo: unknown, init?: ResponseInit) {
  const headers = new Headers(CABECALHOS_SEM_CACHE);
  new Headers(init?.headers).forEach((valor, chave) => headers.set(chave, valor));
  return NextResponse.json(corpo, {
    ...init,
    headers,
  });
}

type PedidoStatusInterno = Record<string, unknown> & {
  estabelecimentoIdInterno?: string;
  pixOrderIdInterno?: string;
  pagamentoStatus?: string;
};

// O navegador consulta o status local a cada poucos segundos. Limitamos a
// consulta remota ao Mercado Pago para não transformar uma espera de 30 min
// em centenas de chamadas, mantendo um caminho de recuperação rápido.
const ultimaConsultaPix = new Map<string, number>();
const INTERVALO_CONSULTA_PIX_MS = 12_000;

async function buscarPedido(slug: string, id: string) {
  const linhas = await queryPublico<{
    fn_pedido_publico_status: PedidoStatusInterno | null;
  }>("select fn_pedido_publico_status($1, $2::uuid)", [slug, id]).catch(() => []);
  return linhas[0]?.fn_pedido_publico_status ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  let pedido = await buscarPedido(slug, id);
  if (!pedido) {
    return respostaJson({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  const deveSincronizar = request.nextUrl.searchParams.get("sincronizarPix") === "1";
  const pendente = pedido.pagamentoStatus === "pendente";
  const estabelecimentoId = pedido.estabelecimentoIdInterno;
  const orderId = pedido.pixOrderIdInterno;
  const agora = Date.now();
  const ultimaConsulta = ultimaConsultaPix.get(id) ?? 0;

  if (
    deveSincronizar &&
    pendente &&
    estabelecimentoId &&
    orderId &&
    agora - ultimaConsulta >= INTERVALO_CONSULTA_PIX_MS
  ) {
    ultimaConsultaPix.set(id, agora);
    try {
      await comEstabelecimento(estabelecimentoId, (client) =>
        sincronizarCobrancaPixMercadoPago(client, estabelecimentoId, orderId),
      );
      pedido = await buscarPedido(slug, id);
    } catch (erro) {
      // A tela continua consultando o status local e o webhook segue como o
      // fluxo principal. Uma falha temporária nesta contingência não deve
      // impedir o cliente de manter o QR Code aberto.
      console.error("Consulta de contingência do Pix", erro);
    }
  }

  if (!pedido) {
    return respostaJson({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  const pedidoPublico = Object.fromEntries(
    Object.entries(pedido).filter(([chave]) =>
      chave !== "estabelecimentoIdInterno" && chave !== "pixOrderIdInterno",
    ),
  );
  if (pedidoPublico.pagamentoStatus !== "pendente") ultimaConsultaPix.delete(id);
  return respostaJson(pedidoPublico);
}
