import { NextResponse } from "next/server";

// Só a equipe acrescenta itens a um pedido (Central de pedidos, POST /api/pedidos com pedidoPaiId).
// O cliente do cardápio não tem mais essa opção.
export async function POST() {
  return NextResponse.json(
    { erro: "Para incluir mais itens neste pedido, fale com o estabelecimento." },
    { status: 403 },
  );
}
