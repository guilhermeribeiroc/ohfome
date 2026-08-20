import { NextResponse, type NextRequest } from "next/server";
import { queryPublico } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const linhas = await queryPublico<{ fn_bairros_publico: { id: string; nome: string; taxa: number }[] }>(
    "select fn_bairros_publico($1)",
    [slug]
  );

  const resposta = NextResponse.json(linhas[0]?.fn_bairros_publico ?? []);
  resposta.headers.set("Cache-Control", "public, max-age=20, stale-while-revalidate=120");
  return resposta;
}
