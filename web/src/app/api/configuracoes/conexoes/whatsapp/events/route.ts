import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (sessao.role !== "admin") return respostaAcessoNegado();

  const limiteParam = Number(request.nextUrl.searchParams.get("limit") ?? 10);
  const limite = Number.isFinite(limiteParam) ? Math.min(Math.max(Math.trunc(limiteParam), 1), 50) : 10;
  const cursor = request.nextUrl.searchParams.get("cursor");

  try {
    const { items, nextCursor } = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        `select n.id, p.codigo::text as "orderCode", n.status_pedido as "status", n.created_at as "createdAt", n.fila as "outcome"
         from notificacoes_whatsapp_pedido n
         join pedidos p on p.id = n.pedido_id
         where n.estabelecimento_id = $1
           and ($2::uuid is null or n.created_at < (select created_at from notificacoes_whatsapp_pedido where id = $2::uuid))
         order by n.created_at desc
         limit $3`,
        [sessao.estabelecimentoId, cursor, limite + 1]
      );
      const items = rows.slice(0, limite);
      const nextCursor = rows.length > limite ? (items[items.length - 1]?.id as string) : null;
      return { items, nextCursor };
    });
    return NextResponse.json({ items, nextCursor });
  } catch (erro) {
    console.error("GET /api/configuracoes/conexoes/whatsapp/events", erro);
    return NextResponse.json({ erro: "Não foi possível carregar o histórico do WhatsApp." }, { status: 502 });
  }
}
