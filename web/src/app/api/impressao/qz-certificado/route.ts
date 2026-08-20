import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { credencialQz } from "@/lib/qz-credentials";

export async function GET(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();

  const certificado = credencialQz("QZ_CERTIFICATE");
  if (!certificado) return new NextResponse(null, { status: 204 });
  return new NextResponse(certificado, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
