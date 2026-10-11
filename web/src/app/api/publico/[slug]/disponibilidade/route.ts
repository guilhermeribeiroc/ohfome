import { NextResponse, type NextRequest } from "next/server";
import { queryPublico } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rows = await queryPublico<{ fn_disponibilidade_produtos_publico: Record<string, number | null> | null }>(
    "select fn_disponibilidade_produtos_publico($1)", [slug]
  );
  const disponibilidade = rows[0]?.fn_disponibilidade_produtos_publico;
  if (disponibilidade === null || disponibilidade === undefined) return NextResponse.json({ erro: "Cardápio não encontrado." }, { status: 404 });
  const resposta = NextResponse.json({ disponibilidade });
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}
