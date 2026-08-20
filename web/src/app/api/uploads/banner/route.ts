import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { salvarImagem } from "@/lib/armazenamento-imagens";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const dados = await request.formData().catch(() => null);
  const arquivo = dados?.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Selecione uma imagem para o banner." }, { status: 400 });
  try {
    return NextResponse.json(await salvarImagem("banners", arquivo), { status: 201 });
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Não foi possível enviar a imagem." }, { status: 400 });
  }
}
