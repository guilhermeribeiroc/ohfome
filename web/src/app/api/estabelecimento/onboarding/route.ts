import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (sessao.role !== "admin") return NextResponse.json({ erro: "Apenas administradores podem concluir a configuração." }, { status: 403 });

  await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    await client.query("update estabelecimentos set onboarding_concluido = true where id = $1", [sessao.estabelecimentoId]);
  });

  return NextResponse.json({ onboardingConcluido: true });
}
