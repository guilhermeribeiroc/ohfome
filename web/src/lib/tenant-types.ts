export type TipoEstabelecimento =
  | "churrascaria"
  | "pizzaria"
  | "hamburgueria"
  | "japonesa"
  | "padaria_cafeteria"
  | "sorveteria"
  | "outro";

export type ModuloSistema = "balcao" | "cozinha" | "garcom" | "estoque" | "delivery" | "site";

export type PapelUsuario = "admin" | "balcao" | "cozinha" | "garcom" | "estoque" | "delivery" | "site";

export interface ModuloInfo {
  id: ModuloSistema;
  label: string;
  descricao: string;
  papel: PapelUsuario;
  href: string;
}

export type ModuloNavegacao = ModuloSistema | "financeiro";
export type ModuloNavegacaoInfo = Omit<ModuloInfo, "id"> & { id: ModuloNavegacao };

export const MODULOS: ModuloInfo[] = [
  {
    id: "balcao",
    label: "Central de pedidos",
    descricao: "Recebe e acompanha todos os pedidos do estabelecimento.",
    papel: "balcao",
    href: "/pedidos",
  },
  {
    id: "cozinha",
    label: "Cozinha",
    descricao: "Tela focada só nos itens que precisam ser preparados.",
    papel: "cozinha",
    href: "/cozinha",
  },
  {
    id: "garcom",
    label: "Garçom",
    descricao: "Interface mobile para lançar pedidos direto na mesa.",
    papel: "garcom",
    href: "/mesas",
  },
  {
    id: "estoque",
    label: "Estoque & Preços",
    descricao: "Controle de insumos e calculadora de precificação.",
    papel: "estoque",
    href: "/estoque",
  },
  {
    id: "delivery",
    label: "Delivery",
    descricao: "Entregadores, atribuição e status das entregas do Cardápio Digital.",
    papel: "delivery",
    href: "/delivery",
  },
  {
    id: "site",
    label: "Cardápio Digital",
    descricao: "Pedidos online por link, WhatsApp e controle de Delivery incluído.",
    papel: "site",
    href: "/site",
  },
];

const MODULO_FINANCEIRO: ModuloNavegacaoInfo = {
  id: "financeiro",
  label: "Financeiro",
  descricao: "Entradas, saídas, custos fixos e resultado da operação.",
  papel: "admin",
  href: "/financeiro",
};

// Planos comerciais disponíveis no cadastro. Administração é um acesso
// obrigatório e automático em todos eles; por isso não aparece como módulo
// selecionável.
export type PlanoComercialId = "basico" | "basico_2" | "profissional" | "intermediario" | "plus";

export interface PlanoComercialInfo {
  id: PlanoComercialId;
  label: string;
  descricao: string;
  precoMensal: number;
}

export const MODULOS_DE_VENDA: ModuloSistema[] = ["balcao", "garcom", "cozinha", "site"];

export const DIAS_TESTE_GRATIS = 7;

export const PLANOS_COMERCIAIS: Record<PlanoComercialId, PlanoComercialInfo> = {
  basico: {
    id: "basico",
    label: "Plano Básico",
    descricao: "Administração e Central de pedidos para organizar a operação.",
    precoMensal: 89,
  },
  profissional: {
    id: "profissional",
    label: "Plano Profissional",
    descricao: "Administração, Central de pedidos e Garçom para uma operação conectada no salão.",
    precoMensal: 129,
  },
  intermediario: {
    id: "intermediario",
    label: "Plano Intermediário",
    descricao: "Administração, Central de pedidos, Garçom e Cozinha integrados em tempo real.",
    precoMensal: 139,
  },
  basico_2: {
    id: "basico_2",
    label: "Plano Básico 2.0",
    descricao: "Administração, Central de pedidos, Cardápio Digital e controle de Delivery para pedidos online.",
    precoMensal: 159,
  },
  plus: {
    id: "plus",
    label: "Plano Plus",
    descricao: "Administração, Central de pedidos, Garçom, Cardápio Digital e controle de Delivery, com Cozinha opcional.",
    precoMensal: 199,
  },
};

export function planoParaModulos(modulos: ModuloSistema[]): PlanoComercialInfo | null {
  const selecionados = new Set(modulos);
  if (!selecionados.has("balcao")) return null;

  const garcom = selecionados.has("garcom");
  const cozinha = selecionados.has("cozinha");
  const cardapioDigital = selecionados.has("site");

  if (cozinha && !garcom) return null;
  if (cardapioDigital && garcom) return PLANOS_COMERCIAIS.plus;
  if (garcom && cozinha) return PLANOS_COMERCIAIS.intermediario;
  if (garcom) return PLANOS_COMERCIAIS.profissional;
  if (cardapioDigital) return PLANOS_COMERCIAIS.basico_2;
  return PLANOS_COMERCIAIS.basico;
}

// A administração não é uma tela de plano: é o acesso às ferramentas de
// gestão. Por isso, todo administrador recebe Estoque & Preços e Financeiro,
// além dos módulos comerciais contratados. Os demais papéis só veem a própria
// área de trabalho (ex.: garçom só vê Mesas).
export function modulosPermitidos(papel: PapelUsuario, modulosAtivos: ModuloSistema[]): ModuloNavegacaoInfo[] {
  const ativos = MODULOS.filter((m) => modulosAtivos.includes(m.id));
  if (papel === "admin") {
    const estoque = MODULOS.find((modulo) => modulo.id === "estoque");
    return [...ativos.filter((modulo) => modulo.id !== "estoque"), ...(estoque ? [estoque] : []), MODULO_FINANCEIRO];
  }
  return ativos.filter((m) => m.papel === papel);
}

export interface SegmentoInfo {
  id: TipoEstabelecimento;
  label: string;
  exemploCardapio: string;
}

export const SEGMENTOS: SegmentoInfo[] = [
  { id: "churrascaria", label: "Churrascaria", exemploCardapio: "Picanha, costela, espetos" },
  { id: "pizzaria", label: "Pizzaria", exemploCardapio: "Pizzas, esfihas, bebidas" },
  { id: "hamburgueria", label: "Hamburgueria", exemploCardapio: "Burgers, batatas, milk-shakes" },
  { id: "japonesa", label: "Comida japonesa", exemploCardapio: "Sushis, temakis, yakisoba" },
  { id: "padaria_cafeteria", label: "Padaria & Cafeteria", exemploCardapio: "Pães, salgados, cafés" },
  { id: "sorveteria", label: "Sorveteria", exemploCardapio: "Sorvetes, açaí, milk-shakes" },
  { id: "outro", label: "Outro tipo", exemploCardapio: "Cardápio personalizado" },
];
