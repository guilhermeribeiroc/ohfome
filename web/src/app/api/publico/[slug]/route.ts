import { NextResponse, type NextRequest } from "next/server";
import { queryPublico } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const linhas = await queryPublico<{ fn_cardapio_publico: Record<string, unknown> | null }>(
    "select fn_cardapio_publico($1)",
    [slug]
  );
  const cardapio = linhas[0]?.fn_cardapio_publico;

  if (!cardapio) {
    return NextResponse.json({ erro: "Estabelecimento não encontrado." }, { status: 404 });
  }

  return NextResponse.json(cardapio);
}
