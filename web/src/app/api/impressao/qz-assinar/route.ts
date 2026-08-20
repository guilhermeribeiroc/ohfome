import { createSign } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { credencialQz } from "@/lib/qz-credentials";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();

  const privateKey = credencialQz("QZ_PRIVATE_KEY");
  if (!privateKey) return NextResponse.json({ erro: "A assinatura QZ não está configurada." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const payload = typeof body?.payload === "string" ? body.payload : "";
  if (!payload || payload.length > 20_000) return NextResponse.json({ erro: "Solicitação de assinatura inválida." }, { status: 400 });

  try {
    const signer = createSign("RSA-SHA512");
    signer.update(payload);
    signer.end();
    return new NextResponse(signer.sign(privateKey, "base64"), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ erro: "Não foi possível assinar a solicitação QZ." }, { status: 500 });
  }
}
