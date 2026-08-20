import { NextResponse, type NextRequest } from "next/server";
import { queryPublico } from "@/lib/db";
import { limitado } from "@/lib/rate-limit";

const EMAIL_TELEFONE_MIN = 8;

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = request.headers.get("x-forwarded-for") ?? "local";

  if (limitado(`pedido-publico:${ip}`)) {
    return NextResponse.json({ erro: "Muitos pedidos em pouco tempo. Aguarde um instante." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const clienteNome = typeof body?.clienteNome === "string" ? body.clienteNome.trim() : "";
  const telefone = typeof body?.telefone === "string" ? body.telefone.trim() : "";
  const endereco = typeof body?.endereco === "string" ? body.endereco.trim() : "";
  const formaRecebimento = body?.formaRecebimento === "retirada" ? "retirada" : body?.formaRecebimento === "entrega" ? "entrega" : "";
  const formaPagamento = body?.formaPagamento === "cartao" ? "cartao" : body?.formaPagamento === "dinheiro" ? "dinheiro" : "";
  const tipoCartao = body?.tipoCartao === "credito" ? "credito" : body?.tipoCartao === "debito" ? "debito" : "";
  const trocoPara = body?.trocoPara === null || body?.trocoPara === undefined || body?.trocoPara === "" ? null : Number(body.trocoPara);
  const observacoes = typeof body?.observacoes === "string" ? body.observacoes.trim() : "";
  const cpf = typeof body?.cpf === "string" ? body.cpf.replace(/\D/g, "") : "";
  const notificar = body?.notificar === true;
  const bairroId = typeof body?.bairroId === "string" ? body.bairroId : null;
  const itens = Array.isArray(body?.itens) ? body.itens : [];

  if (clienteNome.length < 2) return NextResponse.json({ erro: "Informe seu nome." }, { status: 400 });
  if (telefone.length < EMAIL_TELEFONE_MIN) return NextResponse.json({ erro: "Informe um telefone válido." }, { status: 400 });
  if (!formaRecebimento) return NextResponse.json({ erro: "Escolha entre entrega ou retirada." }, { status: 400 });
  if (!formaPagamento) return NextResponse.json({ erro: "Escolha a forma de pagamento." }, { status: 400 });
  if (formaPagamento === "cartao" && !tipoCartao) return NextResponse.json({ erro: "Escolha crédito ou débito." }, { status: 400 });
  if (trocoPara !== null && (!Number.isFinite(trocoPara) || trocoPara <= 0)) return NextResponse.json({ erro: "Informe um valor de troco válido." }, { status: 400 });
  if (formaRecebimento === "entrega" && endereco.length < 10) return NextResponse.json({ erro: "Informe o endereço completo para entrega." }, { status: 400 });
  if (formaRecebimento === "entrega" && !bairroId) return NextResponse.json({ erro: "Selecione o bairro de entrega." }, { status: 400 });
  if (observacoes.length > 1000) return NextResponse.json({ erro: "As observações podem ter até 1.000 caracteres." }, { status: 400 });
  if (itens.length === 0) return NextResponse.json({ erro: "Adicione ao menos um item ao pedido." }, { status: 400 });

  try {
    const linhas = await queryPublico<{ fn_criar_pedido_publico: { id: string; codigo: number; notificar: boolean; taxaEntrega: number } }>(
      "select fn_criar_pedido_publico($1, $2, $3, $4, $5, $6, $7, $8, $9::numeric, $10::jsonb, $11, $12, $13::uuid)",
      [slug, clienteNome, telefone, formaRecebimento, endereco, observacoes, formaPagamento, tipoCartao || null, trocoPara, JSON.stringify(itens), cpf || null, notificar, bairroId]
    );
    return NextResponse.json(linhas[0].fn_criar_pedido_publico, { status: 201 });
  } catch (erro) {
    const detalhes = erro as { message?: string; code?: string };
    if (detalhes.code === "P0002") {
      return NextResponse.json({ erro: "Cardápio não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ erro: "Não foi possível enviar o pedido. Confira os itens e tente novamente." }, { status: 400 });
  }
}
