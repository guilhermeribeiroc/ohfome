export interface VendaRelatorio {
  codigo: number;
  tipo: "mesa" | "balcao" | "delivery";
  createdAt: string;
  mesaNumero: number | null;
  clienteNome: string | null;
  formaPagamento: string | null;
  tipoCartao: string | null;
  pagamentoDividido: { forma: string; valor: number; tipoCartao?: string }[] | null;
  total: number;
  taxaEntrega: number;
  custoProdutos: number;
  taxaPix: number | null;
  valorLiquidoPix: number | null;
}

export interface MovimentoRelatorio {
  dataMovimento: string;
  tipo: "entrada" | "saida";
  categoria: string;
  descricao: string;
  valor: number;
}

export interface DadosRelatorio {
  estabelecimento: string;
  inicio: string;
  fim: string;
  emitidoEm: string;
  vendas: VendaRelatorio[];
  movimentos: MovimentoRelatorio[];
  custosFixosPeriodo: number;
}

const FUSO = "America/Fortaleza";
const FORMAS = ["Dinheiro", "Cartão de crédito", "Cartão de débito", "Pix", "Forma não informada"] as const;
type Forma = (typeof FORMAS)[number];

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

export function formaDaParte(forma: string | null, tipoCartao?: string | null): Forma {
  if (forma === "dinheiro") return "Dinheiro";
  if (forma === "pix") return "Pix";
  if (forma === "cartao") return tipoCartao === "debito" ? "Cartão de débito" : "Cartão de crédito";
  return "Forma não informada";
}

/** Quanto entrou por forma de pagamento. Pedido misto é repartido pelas duas partes. */
export function totaisPorForma(vendas: VendaRelatorio[]) {
  const totais = new Map<Forma, { pedidos: number; valor: number }>(FORMAS.map((forma) => [forma, { pedidos: 0, valor: 0 }]));
  for (const venda of vendas) {
    const partes = venda.formaPagamento === "misto" && venda.pagamentoDividido?.length
      ? venda.pagamentoDividido.map((parte) => ({ forma: formaDaParte(parte.forma, parte.tipoCartao), valor: Number(parte.valor) }))
      : [{ forma: formaDaParte(venda.formaPagamento, venda.tipoCartao), valor: venda.total }];
    for (const forma of new Set(partes.map((parte) => parte.forma))) totais.get(forma)!.pedidos += 1;
    for (const parte of partes) totais.get(parte.forma)!.valor += parte.valor;
  }
  return FORMAS.map((forma) => ({ forma, pedidos: totais.get(forma)!.pedidos, valor: arredondar(totais.get(forma)!.valor) }));
}

const NOME_CANAL = { mesa: "Mesa", balcao: "Balcão / Retirada", delivery: "Delivery" } as const;

export function totaisPorCanal(vendas: VendaRelatorio[]) {
  return (Object.keys(NOME_CANAL) as (keyof typeof NOME_CANAL)[]).map((tipo) => {
    const doCanal = vendas.filter((venda) => venda.tipo === tipo);
    return { canal: NOME_CANAL[tipo], pedidos: doCanal.length, valor: arredondar(doCanal.reduce((soma, venda) => soma + venda.total, 0)) };
  });
}

const dinheiro = (valor: number) => arredondar(valor).toFixed(2).replace(".", ",");
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function dataHoraBr(iso: string) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(data).replace(",", "");
}

/** Texto digitado por usuários pode começar com = + - @ e virar fórmula no Excel; o apóstrofo neutraliza. */
function celula(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined) return "";
  let texto = String(valor);
  if (typeof valor === "string" && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const linha = (...colunas: (string | number | null | undefined)[]) => colunas.map(celula).join(";");

/** CSV em pt-BR para Excel/Sheets: separador ";", vírgula decimal, BOM UTF-8. Valores numéricos sem "R$" para poderem ser somados. */
export function montarRelatorioCsv(dados: DadosRelatorio) {
  const { vendas, movimentos } = dados;
  const faturamento = arredondar(vendas.reduce((soma, venda) => soma + venda.total, 0));
  const custo = arredondar(vendas.reduce((soma, venda) => soma + venda.custoProdutos, 0));
  const taxasPix = arredondar(vendas.reduce((soma, venda) => soma + (venda.taxaPix ?? 0), 0));
  const entradas = arredondar(movimentos.filter((m) => m.tipo === "entrada").reduce((soma, m) => soma + m.valor, 0));
  const saidas = arredondar(movimentos.filter((m) => m.tipo === "saida").reduce((soma, m) => soma + m.valor, 0));
  const custosFixos = arredondar(dados.custosFixosPeriodo);
  const resultado = arredondar(faturamento - custo + entradas - saidas - custosFixos - taxasPix);
  const formas = totaisPorForma(vendas);
  const valorDaForma = (nome: Forma) => formas.find((item) => item.forma === nome)!.valor;
  const periodo = dados.inicio === dados.fim ? dataBr(dados.inicio) : `${dataBr(dados.inicio)} a ${dataBr(dados.fim)}`;

  const linhas: string[] = [
    linha("RELATÓRIO FINANCEIRO / FECHAMENTO DE CAIXA"),
    linha("Estabelecimento", dados.estabelecimento),
    linha("Período", periodo),
    linha("Emitido em", dados.emitidoEm),
    linha("Considera pedidos finalizados, pela data em que foram criados."),
    "",
    linha("RESUMO"),
    linha("Pedidos finalizados", vendas.length),
    linha("Faturamento (R$)", dinheiro(faturamento)),
    linha("Custo dos produtos vendidos (R$)", dinheiro(custo)),
    linha("Taxas do Mercado Pago no Pix (R$)", dinheiro(taxasPix)),
    linha("Entradas avulsas (R$)", dinheiro(entradas)),
    linha("Saídas avulsas (R$)", dinheiro(saidas)),
    linha("Custos fixos do período (R$)", dinheiro(custosFixos)),
    linha("Resultado operacional (R$)", dinheiro(resultado)),
    "",
    linha("RECEBIMENTOS POR FORMA DE PAGAMENTO"),
    linha("Forma", "Pedidos", "Valor (R$)"),
    ...formas.map((item) => linha(item.forma, item.pedidos, dinheiro(item.valor))),
    linha("Total", "", dinheiro(formas.reduce((soma, item) => soma + item.valor, 0))),
    "",
    linha("CONFERÊNCIA DO CAIXA"),
    linha("Dinheiro que deve estar no caixa (R$)", dinheiro(valorDaForma("Dinheiro") + entradas - saidas)),
    linha("Cartões a receber da operadora (R$)", dinheiro(valorDaForma("Cartão de crédito") + valorDaForma("Cartão de débito"))),
    linha("Pix recebido, bruto (R$)", dinheiro(valorDaForma("Pix"))),
    linha("Pix, taxa do Mercado Pago (R$)", dinheiro(taxasPix)),
    "",
    linha("VENDAS POR CANAL"),
    linha("Canal", "Pedidos", "Valor (R$)"),
    ...totaisPorCanal(vendas).map((item) => linha(item.canal, item.pedidos, dinheiro(item.valor))),
    "",
    linha("MOVIMENTAÇÕES AVULSAS"),
    linha("Data", "Tipo", "Categoria", "Descrição", "Valor (R$)"),
    ...(movimentos.length
      ? movimentos.map((m) => linha(dataBr(m.dataMovimento), m.tipo === "entrada" ? "Entrada" : "Saída", m.categoria, m.descricao, dinheiro(m.valor)))
      : [linha("Nenhuma movimentação avulsa no período.")]),
    "",
    linha("PEDIDOS FINALIZADOS"),
    linha("Pedido", "Data e hora", "Canal", "Cliente / Mesa", "Forma de pagamento", "Taxa de entrega (R$)", "Total (R$)", "Taxa Pix (R$)", "Líquido Pix (R$)"),
    ...vendas.map((venda) => {
      const partes = venda.formaPagamento === "misto" && venda.pagamentoDividido?.length
        ? venda.pagamentoDividido.map((parte) => `${formaDaParte(parte.forma, parte.tipoCartao)} ${dinheiro(Number(parte.valor))}`).join(" + ")
        : formaDaParte(venda.formaPagamento, venda.tipoCartao);
      return linha(
        `#${venda.codigo}`, dataHoraBr(venda.createdAt), NOME_CANAL[venda.tipo],
        venda.mesaNumero ? `Mesa ${venda.mesaNumero}` : venda.clienteNome ?? "", partes,
        dinheiro(venda.taxaEntrega), dinheiro(venda.total),
        venda.taxaPix === null ? "" : dinheiro(venda.taxaPix), venda.valorLiquidoPix === null ? "" : dinheiro(venda.valorLiquidoPix),
      );
    }),
  ];
  return `\uFEFF${linhas.join("\r\n")}\r\n`;
}

export function nomeArquivoRelatorio(inicio: string, fim: string) {
  return inicio === fim ? `fechamento-caixa-${inicio}.csv` : `financeiro-${inicio}_a_${fim}.csv`;
}
