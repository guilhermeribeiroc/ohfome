import { NextResponse } from "next/server";
import { lerImagemPublica, tipoImagem } from "@/lib/armazenamento-imagens";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ categoria: string; nome: string }> }) {
  const { categoria, nome } = await params;
  if (categoria !== "banners" && categoria !== "logos") return new NextResponse(null, { status: 404 });
  const imagem = await lerImagemPublica(categoria, nome);
  if (!imagem) return new NextResponse(null, { status: 404 });
  return new NextResponse(imagem, { headers: { "Content-Type": tipoImagem(nome), "Cache-Control": "public, max-age=31536000, immutable" } });
}
