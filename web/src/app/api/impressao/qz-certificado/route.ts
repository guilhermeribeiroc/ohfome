import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();

  const certificado = process.env.QZ_CERTIFICATE?.replace(/\\n/g, "\n");
  if (!certificado) return new NextResponse(null, { status: 204 });
  return new NextResponse(certificado, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
