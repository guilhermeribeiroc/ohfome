// Espelha os enums e tabelas de database/schema.sql

export type MesaStatus = "livre" | "ocupada" | "aguardando_conta" | "reservada";

export type PedidoTipo = "mesa" | "balcao" | "delivery";
export type PedidoOrigem = "presencial" | "whatsapp" | "telefone" | "app";
export type FormaPagamento = "cartao" | "dinheiro" | "pix";
export type TipoCartao = "credito" | "debito";
export type PagamentoStatus = "pendente" | "pago" | "falhou" | "estornado";
export type PedidoStatus =
  | "novo"
  | "em_preparo"
  | "pronto"
  | "saiu_para_entrega"
  | "finalizado"
  | "cancelado";

export type ItemPedidoStatus = "pendente" | "em_preparo" | "pronto" | "entregue" | "cancelado";

export type UnidadeMedida = "kg" | "g" | "l" | "ml" | "un" | "cx" | "pct";

export type ModoPrecificacao = "margem" | "preco_manual";
export type TamanhoProduto = "P" | "M" | "G";
export type ModoBannerCardapio = "padrao" | "fixo" | "carrossel";

export function nomeProdutoComTamanho(produto: { nome: string; tamanho?: TamanhoProduto | null }) {
  return produto.tamanho ? `${produto.nome} (${produto.tamanho})` : produto.nome;
}

export function nomeItemComTamanho(item: { produtoNome: string; produtoTamanho?: TamanhoProduto | null }) {
  return item.produtoTamanho ? `${item.produtoNome} (${item.produtoTamanho})` : item.produtoNome;
}

export interface BannerCardapio {
  id: string;
  url: string;
  ordem: number;
}

export type EntregaStatus = "aguardando" | "em_rota" | "entregue" | "cancelada";
export type FinanceiroTipo = "entrada" | "saida";

export interface MovimentoFinanceiro {
  id: string;
  tipo: FinanceiroTipo;
  categoria: string;
  descricao: string;
  valor: number;
  dataMovimento: string;
}

export interface CustoFixo {
  id: string;
  categoria: string;
  descricao: string;
  valorMensal: number;
  diaVencimento: number;
  ativo: boolean;
}

export interface ResumoFinanceiro {
  vendasFinalizadas: number;
  custoProdutosVendidos: number;
  entradasAvulsas: number;
  saidasAvulsas: number;
  custosFixosPeriodo: number;
  resultadoOperacional: number;
}

export interface VendaFinanceira {
  id: string;
  codigo: number;
  tipo: PedidoTipo;
  mesaNumero?: number;
  clienteNome?: string;
  total: number;
  custoProdutos: number;
  lucroBruto: number;
  createdAt: string;
  itens: { produtoNome: string; produtoTamanho?: TamanhoProduto | null; quantidade: number; precoUnitario: number; custoUnitario: number }[];
}

export interface Mesa {
  id: string;
  numero: number;
  capacidade: number;
  status: MesaStatus;
}

export interface Comanda {
  id: string;
  mesaId: string;
  garcomNome: string;
  abertaEm: string;
  valorTotal: number;
}

export interface ItemPedido {
  id: string;
  produtoId: string;
  produtoNome: string;
  produtoTamanho?: TamanhoProduto | null;
  quantidade: number;
  precoUnitario: number;
  observacoes?: string;
  status: ItemPedidoStatus;
}

export interface Pedido {
  id: string;
  codigo: number;
  tipo: PedidoTipo;
  origem: PedidoOrigem;
  status: PedidoStatus;
  mesaNumero?: number;
  clienteNome?: string;
  clienteTelefone?: string;
  usuarioNome: string;
  itens: ItemPedido[];
  observacoes?: string;
  formaRecebimento?: "entrega" | "retirada";
  formaPagamento?: FormaPagamento;
  tipoCartao?: TipoCartao;
  trocoPara?: number;
  pagamentoStatus?: PagamentoStatus;
  enderecoEntrega?: string;
  taxaEntrega?: number;
  estabelecimentoNome?: string;
  total: number;
  createdAt: string;
  notificadoEm?: string;
}

export type ImpressaoJobStatus = "pendente" | "imprimindo" | "impresso" | "falhou";

export interface ImpressaoJob {
  id: string;
  pedidoId: string;
  status: ImpressaoJobStatus;
  tentativas: number;
  erro?: string;
  createdAt: string;
  pedido: Pedido;
}

export type EstadoEstacaoImpressao =
  | "inicializando"
  | "conectando"
  | "pronta"
  | "reconectando"
  | "sem_impressora"
  | "qz_indisponivel"
  | "falha";

export interface Produto {
  id: string;
  categoriaId?: string | null;
  categoriaNome: string;
  nome: string;
  tamanho?: TamanhoProduto | null;
  descricao?: string;
  imagemUrl?: string | null;
  modoPrecificacao: ModoPrecificacao;
  precoCusto: number;
  margemPercentual: number;
  precoVenda: number;
  ativo: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
}

export interface Insumo {
  id: string;
  nome: string;
  unidadeMedida: UnidadeMedida;
  quantidadeEstoque: number;
  quantidadeMinima: number;
  custoUnitario: number;
  fornecedor?: string;
}

export interface FichaTecnicaItem {
  insumoId: string;
  insumoNome: string;
  unidadeMedida: UnidadeMedida;
  quantidadeNecessaria: number;
}

export interface Entregador {
  id: string;
  nome: string;
  veiculo?: string;
  telefone?: string;
  disponivel: boolean;
}

export interface Entrega {
  id: string;
  pedidoCodigo: number;
  clienteNome: string;
  clienteTelefone?: string;
  entregadorId?: string;
  status: EntregaStatus;
  endereco: string;
  bairro?: string;
  observacoes?: string;
  formaPagamento?: FormaPagamento;
  tipoCartao?: TipoCartao;
  trocoPara?: number;
  pagamentoStatus?: PagamentoStatus;
  itens?: { produtoNome: string; produtoTamanho?: TamanhoProduto | null; quantidade: number; precoUnitario: number }[];
  total: number;
  tempoEstimadoMin?: number;
}

export interface BairroEntrega {
  id: string;
  nome: string;
  taxa: number;
  ativo: boolean;
}

export const PEDIDO_STATUS_LABEL: Record<PedidoStatus, string> = {
  novo: "Novo",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export const MESA_STATUS_LABEL: Record<MesaStatus, string> = {
  livre: "Livre",
  ocupada: "Ocupada",
  aguardando_conta: "Aguardando conta",
  reservada: "Reservada",
};

export const ENTREGA_STATUS_LABEL: Record<EntregaStatus, string> = {
  aguardando: "Aguardando",
  em_rota: "Em rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};
