import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { extrairItensCardapio, mediaTypeAceito, mediaTypePelosBytes } from "@/lib/importar-cardapio";

export const runtime = "nodejs";

const LIMITE_IMAGEM_BYTES = 8 * 1024 * 1024;
const MAXIMO_IMAGENS = 12;
const LIMITE_TOTAL_BYTES = 80 * 1024 * 1024;
const LIMITE_MULTIPART_BYTES = 85 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > LIMITE_MULTIPART_BYTES) {
    return NextResponse.json({ erro: "As fotos ultrapassam o limite total de envio." }, { status: 413 });
  }

  const dados = await request.formData().catch(() => null);
  if (!dados) return NextResponse.json({ erro: "Envie ao menos uma foto do cardápio." }, { status: 400 });

  const arquivos = dados.getAll("arquivo").filter((item): item is File => item instanceof File);
  if (arquivos.length === 0) return NextResponse.json({ erro: "Envie ao menos uma foto do cardápio." }, { status: 400 });
  if (arquivos.length > MAXIMO_IMAGENS) return NextResponse.json({ erro: `Envie no máximo ${MAXIMO_IMAGENS} fotos por vez.` }, { status: 400 });

  const imagens: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }[] = [];
  let totalBytes = 0;
  for (const arquivo of arquivos) {
    const mediaType = mediaTypeAceito(arquivo.type);
    if (!mediaType) return NextResponse.json({ erro: "Envie fotos em JPG, PNG ou WebP." }, { status: 400 });
    if (arquivo.size > LIMITE_IMAGEM_BYTES) return NextResponse.json({ erro: "Cada foto deve ter no máximo 8 MB." }, { status: 400 });
    totalBytes += arquivo.size;
    if (totalBytes > LIMITE_TOTAL_BYTES) return NextResponse.json({ erro: "As fotos somadas devem ter no máximo 80 MB." }, { status: 413 });
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (mediaTypePelosBytes(bytes) !== mediaType) return NextResponse.json({ erro: "Uma das fotos tem conteúdo incompatível com o formato informado." }, { status: 400 });
    const base64 = bytes.toString("base64");
    imagens.push({ base64, mediaType });
  }

  try {
    const resultado = await extrairItensCardapio(imagens);
    if (resultado.itens.length === 0 && resultado.pizzas.length === 0) {
      return NextResponse.json({ erro: "Não encontrei itens com preço legível nessa(s) foto(s). Tente uma foto mais nítida." }, { status: 422 });
    }
    return NextResponse.json(resultado);
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Não foi possível ler o cardápio." }, { status: 502 });
  }
}
