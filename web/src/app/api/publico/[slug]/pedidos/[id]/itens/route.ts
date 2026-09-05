import { NextResponse, type NextRequest } from "next/server";
import { queryPublico } from "@/lib/db";
import { limitado } from "@/lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ip = request.headers.get("x-forwarded-for") ?? "local";

  if (limitado(`pedido-adicional:${ip}`)) {
    return NextResponse.json({ erro: "Muitas tentativas em pouco tempo. Aguarde um instante." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const itensBrutos = Array.isArray(body?.itens) ? body.itens : [];
  const observacoes = typeof body?.observacoes === "string" ? body.observacoes.trim() : "";

  if (itensBrutos.length === 0) return NextResponse.json({ erro: "Adicione ao menos um item." }, { status: 400 });
  if (observacoes.length > 1000) return NextResponse.json({ erro: "As observações podem ter até 1.000 caracteres." }, { status: 400 });

  const itens = itensBrutos.map((item: Record<string, unknown>) => ({
    produtoId: typeof item?.produtoId === "string" ? item.produtoId : "",
    quantidade: Number(item?.quantidade),
    observacoes: typeof item?.observacoes === "string" ? item.observacoes.trim() || undefined : undefined,
  }));
  if (itens.some((item: { produtoId: string; quantidade: number }) => !item.produtoId || !Number.isInteger(item.quantidade) || item.quantidade <= 0)) {
    return NextResponse.json({ erro: "Item inválido no pedido adicional." }, { status: 400 });
  }

  try {
    const linhas = await queryPublico<{ fn_adicionar_itens_pedido_publico: { id: string; codigo: number; pedidoPaiId: string; total: number } }>(
      "select fn_adicionar_itens_pedido_publico($1, $2::uuid, $3::jsonb, $4)",
      [slug, id, JSON.stringify(itens), observacoes || null]
    );
    return NextResponse.json(linhas[0].fn_adicionar_itens_pedido_publico, { status: 201 });
  } catch (erro) {
    const detalhes = erro as { message?: string; code?: string };
    if (detalhes.code === "P0002") {
      return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
    }
    if (detalhes.code === "22023" && detalhes.message) {
      return NextResponse.json({ erro: detalhes.message }, { status: 400 });
    }
    return NextResponse.json({ erro: "Não foi possível adicionar os itens. Tente novamente." }, { status: 400 });
  }
}
