import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";

export const runtime = "nodejs";

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const LIMITE_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const dados = await request.formData().catch(() => null);
  const arquivo = dados?.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Selecione uma imagem para enviar." }, { status: 400 });
  const extensao = TIPOS_PERMITIDOS[arquivo.type];
  if (!extensao) return NextResponse.json({ erro: "Envie uma imagem JPG, PNG ou WebP." }, { status: 400 });
  if (arquivo.size > LIMITE_BYTES) return NextResponse.json({ erro: "A imagem deve ter no máximo 5 MB." }, { status: 400 });

  const pasta = path.join(process.cwd(), "public", "uploads", "produtos");
  await mkdir(pasta, { recursive: true });
  const nome = `${randomUUID()}.${extensao}`;
  await writeFile(path.join(pasta, nome), Buffer.from(await arquivo.arrayBuffer()));
  return NextResponse.json({ url: `/uploads/produtos/${nome}` }, { status: 201 });
}
