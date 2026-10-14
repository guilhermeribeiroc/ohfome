// Produtos importados automaticamente de fotos de cardápio não têm foto
// própria (a foto do cardápio é só texto/preço, não uma imagem do prato).
// Pra não deixar o cardápio digital com ícones genéricos até o dono trocar
// cada foto manualmente, atribuímos aqui uma foto de banco de imagens
// pré-selecionado, escolhida por palavra-chave no nome/categoria do item.
// As imagens ficam em public/menu-assets/categorias/.

const REGRAS: { chave: string; arquivo: string; padrao: RegExp }[] = [
  { chave: "pizza", arquivo: "pizza.jpg", padrao: /pizza/i },
  { chave: "esfiha", arquivo: "esfiha.jpg", padrao: /esfih/i },
  { chave: "pastel", arquivo: "pastel.jpg", padrao: /pastel/i },
  { chave: "hamburguer", arquivo: "hamburguer.jpg", padrao: /hamb[uú]rg|x[- ]?(burger|salada|tudo|bacon)|cheeseburger|sandu[ií]che|lanche/i },
  { chave: "porcao", arquivo: "porcao.jpg", padrao: /por[çc][aã]o|batata|fritas|aperitivo|petisco|anel de cebola|isca/i },
  { chave: "prato-feito", arquivo: "prato-feito.jpg", padrao: /marmita|prato feito|executivo|self[- ]?service|quilo/i },
  { chave: "sobremesa", arquivo: "sobremesa.jpg", padrao: /sobremesa|doce|bolo|pudim|sorvete|a[çc]a[íi]|brownie|torta|mousse|milk[- ]?shake/i },
  { chave: "bebida", arquivo: "bebida.jpg", padrao: /refrigerante|suco|coca|guaran[áa]|soda|bebida|cerveja|caf[ée]|[áa]gua|drink|chopp|vinho/i },
];

/**
 * Caminho público (em /menu-assets/categorias) da foto genérica mais
 * adequada pro nome/categoria informados, ou o fallback "geral" se nenhuma
 * regra bater.
 */
export function imagemPadraoPorProduto(nome: string, categoriaNome: string): string {
  const alvo = `${nome} ${categoriaNome}`;
  const regra = REGRAS.find((regra) => regra.padrao.test(alvo));
  return `/menu-assets/categorias/${regra?.arquivo ?? "geral.jpg"}`;
}
