import type { Entrega, Pedido, PagamentoParte } from "@/lib/types";

function moeda(valor: number) {
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
}

function escapar(valor: string) {
  return valor.replace(/[&<>"']/g, (caractere) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[caractere] ?? caractere);
}

// Texto de uma única parte (usado tanto para pagamento simples quanto para
// cada metade de um pagamento dividido).
function textoParte(parte: Pick<PagamentoParte, "forma" | "tipoCartao" | "trocoPara" | "valor"> & { valor?: number }) {
  if (parte.forma === "cartao") return `Cartão · ${parte.tipoCartao === "credito" ? "Crédito" : "Débito"}`;
  if (parte.forma === "dinheiro") return parte.trocoPara ? `Dinheiro · troco para ${moeda(parte.trocoPara)}` : "Dinheiro · sem troco";
  return "PIX";
}

/**
 * Abre a via numa janela e dispara UMA única impressão, comandada por quem abriu
 * a janela (guardada por flag), em vez de um `window.onload` dentro do HTML escrito
 * com document.write, que podia reabrir a impressão em loop. Os handlers entram só
 * depois do document.close(), porque document.open() apaga os listeners da janela.
 * Ao terminar (ou cancelar) a impressão a janela se fecha, evitando pilha de
 * janelas a cada clique em "Imprimir".
 */
export function imprimirHtmlEmJanela(html: string, tamanho = "width=420,height=720") {
  const janela = window.open("", "_blank", tamanho);
  if (!janela) return false;
  janela.document.write(html);
  janela.document.close();
  let impresso = false;
  janela.onafterprint = () => janela.close();
  window.setTimeout(() => {
    if (impresso || janela.closed) return;
    impresso = true;
    janela.focus();
    janela.print();
  }, 250);
  return true;
}

function abrirVia({ titulo, referencia, destino, endereco, pagamento, pagamentoPartes, observacoes, itens, total, cozinha = false }: { titulo: string; referencia: string; destino?: string; endereco?: string; pagamento?: string; pagamentoPartes?: string[]; observacoes?: string; itens: { nome: string; quantidade: number; valor: number }[]; total: number; cozinha?: boolean }) {
  const linhas = itens.map((item) => `<div class="item"><span>${item.quantidade}× ${escapar(item.nome)}</span><strong>${moeda(item.valor)}</strong></div>`).join("");
  // Pagamento dividido vira um rótulo + uma linha indentada por parte, em vez
  // de uma frase corrida — assim não se mistura com o resto da via.
  const blocoPagamento = pagamentoPartes?.length
    ? `<p><strong>Pagamento dividido:</strong></p>${pagamentoPartes.map((parte) => `<p style="padding-left:14px;margin-top:2px">${escapar(parte)}</p>`).join("")}`
    : pagamento
      ? `<p><strong>Pagamento:</strong> ${escapar(pagamento)}</p>`
      : "";
  const classeCozinha = cozinha ? " cozinha" : "";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#16130f;padding:20px;max-width:360px;margin:auto}h1{font-size:21px;margin:0 0 5px;letter-spacing:-.6px}p{font-size:12px;line-height:1.5;margin:5px 0;color:#5f5a53}.line{border-top:1px dashed #a6a09a;margin:16px 0}.item{display:flex;gap:16px;justify-content:space-between;padding:10px 0;border-bottom:1px dashed #d0cbc4;font-size:13px}.item span{flex:1;white-space:pre-line}.total{display:flex;justify-content:space-between;gap:16px;border-top:2px solid #16130f;margin-top:16px;padding-top:13px;font-size:17px;font-weight:800}.tag{display:inline-block;background:#f3eee7;border-radius:99px;padding:4px 8px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8d3c29}.cozinha h1{font-size:24px}.cozinha .item{font-size:18px;font-weight:700}.cozinha .item strong{font-size:16px}.cozinha .obs{font-size:16px;font-weight:700;color:#16130f}@media print{body{padding:0}}</style></head><body class="${classeCozinha.trim()}"><span class="tag">OhFome · ${escapar(titulo)}</span><h1>${escapar(referencia)}</h1>${destino ? `<p><strong>Cliente:</strong> ${escapar(destino)}</p>` : ""}${endereco ? `<p><strong>Endereço:</strong> ${escapar(endereco)}</p>` : ""}${blocoPagamento}${observacoes ? `<p class="obs"><strong>Observações:</strong> ${escapar(observacoes)}</p>` : ""}<div class="line"></div>${linhas}<div class="total"><span>Total</span><span>${moeda(total)}</span></div><p style="margin-top:22px">${new Date().toLocaleString("pt-BR")}</p></body></html>`;
  imprimirHtmlEmJanela(html);
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

export function imprimirPedido(pedido: Pedido, titulo = "Via do pedido") {
  abrirVia({
    titulo,
    referencia: pedido.mesaNumero ? `Pedido #${pedido.codigo} · Mesa ${pedido.mesaNumero}` : `Pedido #${pedido.codigo}`,
    destino: pedido.clienteNome,
    endereco: pedido.enderecoEntrega,
    pagamento: textoPagamento(pedido),
    pagamentoPartes: partesPagamento(pedido),
    observacoes: pedido.observacoes,
    itens: pedido.itens.map((item) => ({ nome: `${item.produtoNome}${item.pizza ? `\n  ${item.pizza.tamanhoNome} · ${item.pizza.saborDoisNome ? `½ ${item.pizza.saborUmNome} / ½ ${item.pizza.saborDoisNome}` : item.pizza.saborUmNome}` : ""}${item.opcoes?.length ? `\n  ${item.opcoes.map((opcao) => `${opcao.grupoNome}: ${opcao.opcaoNome}`).join(" · ")}` : ""}`, quantidade: item.quantidade, valor: item.precoUnitario * item.quantidade })),
    total: pedido.total,
    cozinha: /cozinha/i.test(titulo),
  });
}

export function imprimirEntrega(entrega: Entrega, entregador?: string) {
  const pagamento = textoPagamento(entrega);
  abrirVia({
    titulo: "Via do entregador",
    referencia: `Entrega · Pedido #${entrega.pedidoCodigo}`,
    destino: entregador ? `${entrega.clienteNome} · Entregador: ${entregador}` : entrega.clienteNome,
    endereco: entrega.endereco,
    pagamento,
    pagamentoPartes: partesPagamento(entrega),
    observacoes: entrega.observacoes,
    itens: (entrega.itens ?? []).map((item) => ({ nome: item.produtoNome, quantidade: item.quantidade, valor: item.precoUnitario * item.quantidade })),
    total: entrega.total,
  });
}
