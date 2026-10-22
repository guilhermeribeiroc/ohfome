import type { Pedido, PagamentoParte } from "@/lib/types";

function moeda(valor: number) {
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
}

// Texto de uma única parte (usado tanto para pagamento simples quanto para
// cada metade de um pagamento dividido).
function textoParte(parte: Pick<PagamentoParte, "forma" | "tipoCartao" | "trocoPara" | "valor"> & { valor?: number }) {
  if (parte.forma === "cartao") return `Cartão · ${parte.tipoCartao === "credito" ? "Crédito" : "Débito"}`;
  if (parte.forma === "dinheiro") return parte.trocoPara ? `Dinheiro · troco para ${moeda(parte.trocoPara)}` : "Dinheiro · sem troco";
  return "PIX";
}

/** Texto único (para telas/pílulas): "PIX · R$ 30,00 + Dinheiro · R$ 20,00 (troco para R$ 50,00)" quando dividido. */
export function textoPagamento(pedido: Pick<Pedido, "formaPagamento" | "tipoCartao" | "trocoPara" | "pagamentoDividido">) {
  if (pedido.formaPagamento === "misto" && pedido.pagamentoDividido) {
    return pedido.pagamentoDividido.map((parte) => `${textoParte(parte)} · ${moeda(parte.valor)}`).join(" + ");
  }
  if (pedido.formaPagamento === "cartao") return `Cartão · ${pedido.tipoCartao === "credito" ? "Crédito" : "Débito"}`;
  if (pedido.formaPagamento === "dinheiro") return pedido.trocoPara ? `Dinheiro · troco para ${moeda(pedido.trocoPara)}` : "Dinheiro · sem troco";
  if (pedido.formaPagamento === "pix") return "PIX";
  return undefined;
}

/** Uma linha por parte, para o recibo HTML: "PIX · R$ 30,00", "Dinheiro · R$ 20,00 (troco para R$ 50,00)". */
export function partesPagamento(pedido: Pick<Pedido, "formaPagamento" | "pagamentoDividido">): string[] | undefined {
  if (pedido.formaPagamento !== "misto" || !pedido.pagamentoDividido) return undefined;
  return pedido.pagamentoDividido.map((parte) => `${textoParte(parte)} · ${moeda(parte.valor)}`);
}

