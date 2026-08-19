import { NextResponse, type NextRequest } from "next/server";
import { queryPublico } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;

  const linhas = await queryPublico<{ fn_pedido_publico_status: Record<string, unknown> | null }>(
    "select fn_pedido_publico_status($1, $2::uuid)",
    [slug, id]
  ).catch(() => []);

  const pedido = linhas[0]?.fn_pedido_publico_status;
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  return NextResponse.json(pedido);
}
