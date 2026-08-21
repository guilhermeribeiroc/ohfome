import type { TipoEstabelecimento } from "./tenant-types";
import type { Insumo, Produto } from "./types";

interface SegmentoDataset {
  produtos: Produto[];
  insumos: Insumo[];
}

const CHURRASCARIA: SegmentoDataset = {
  produtos: [
    { id: "prod1", categoriaNome: "Carnes", nome: "Picanha na brasa", modoPrecificacao: "margem", precoCusto: 42.5, margemPercentual: 111.5, precoVenda: 89.9, ativo: true },
    { id: "prod2", categoriaNome: "Acompanhamentos", nome: "Baião de dois", modoPrecificacao: "margem", precoCusto: 9.8, margemPercentual: 226.5, precoVenda: 32.0, ativo: true },
    { id: "prod3", categoriaNome: "Carnes", nome: "Costela de panela", modoPrecificacao: "preco_manual", precoCusto: 27.0, margemPercentual: 140.4, precoVenda: 64.9, ativo: true },
    { id: "prod4", categoriaNome: "Espetos", nome: "Espeto misto", modoPrecificacao: "margem", precoCusto: 7.2, margemPercentual: 150.0, precoVenda: 18.0, ativo: true },
  ],
  insumos: [
    { id: "ins1", nome: "Picanha (kg)", unidadeMedida: "kg", quantidadeEstoque: 18.5, quantidadeMinima: 10, custoUnitario: 54.9, fornecedor: "Frigorífico Sertão" },
    { id: "ins2", nome: "Carvão (kg)", unidadeMedida: "kg", quantidadeEstoque: 6, quantidadeMinima: 15, custoUnitario: 4.2, fornecedor: "Distribuidora Nordeste" },
    { id: "ins3", nome: "Feijão de corda (kg)", unidadeMedida: "kg", quantidadeEstoque: 22, quantidadeMinima: 8, custoUnitario: 8.9, fornecedor: "Mercado Central" },
  ],
};

const PIZZARIA: SegmentoDataset = {
  produtos: [
    { id: "prod1", categoriaNome: "Pizzas salgadas", nome: "Pizza Margherita", tamanho: "G", modoPrecificacao: "margem", precoCusto: 18.0, margemPercentual: 122.0, precoVenda: 39.9, ativo: true },
    { id: "prod2", categoriaNome: "Pizzas salgadas", nome: "Pizza Calabresa", tamanho: "G", modoPrecificacao: "margem", precoCusto: 16.5, margemPercentual: 133.9, precoVenda: 38.6, ativo: true },
    { id: "prod3", categoriaNome: "Pizzas doces", nome: "Pizza Chocolate c/ Morango", tamanho: "G", modoPrecificacao: "preco_manual", precoCusto: 20.0, margemPercentual: 119.5, precoVenda: 43.9, ativo: true },
    { id: "prod4", categoriaNome: "Bebidas", nome: "Refrigerante 2L", modoPrecificacao: "margem", precoCusto: 6.0, margemPercentual: 66.7, precoVenda: 10.0, ativo: true },
  ],
  insumos: [
    { id: "ins1", nome: "Massa de pizza (un)", unidadeMedida: "un", quantidadeEstoque: 40, quantidadeMinima: 20, custoUnitario: 3.5, fornecedor: "Moinho Trigo Dourado" },
    { id: "ins2", nome: "Mussarela (kg)", unidadeMedida: "kg", quantidadeEstoque: 8, quantidadeMinima: 10, custoUnitario: 32.0, fornecedor: "Laticínios Serra" },
    { id: "ins3", nome: "Molho de tomate (l)", unidadeMedida: "l", quantidadeEstoque: 14, quantidadeMinima: 6, custoUnitario: 9.2, fornecedor: "Hortifruti Central" },
  ],
};

const HAMBURGUERIA: SegmentoDataset = {
  produtos: [
    { id: "prod1", categoriaNome: "Burgers", nome: "Cheeseburger Artesanal", modoPrecificacao: "margem", precoCusto: 12.0, margemPercentual: 108.3, precoVenda: 25.0, ativo: true },
    { id: "prod2", categoriaNome: "Burgers", nome: "Duplo Bacon", modoPrecificacao: "margem", precoCusto: 16.5, margemPercentual: 109.7, precoVenda: 34.6, ativo: true },
    { id: "prod3", categoriaNome: "Acompanhamentos", nome: "Batata rústica", modoPrecificacao: "preco_manual", precoCusto: 5.5, margemPercentual: 154.5, precoVenda: 14.0, ativo: true },
    { id: "prod4", categoriaNome: "Bebidas", nome: "Milk-shake", modoPrecificacao: "margem", precoCusto: 6.8, margemPercentual: 108.8, precoVenda: 14.2, ativo: true },
  ],
  insumos: [
    { id: "ins1", nome: "Blend bovino 160g (un)", unidadeMedida: "un", quantidadeEstoque: 50, quantidadeMinima: 30, custoUnitario: 6.9, fornecedor: "Frigorífico Sertão" },
    { id: "ins2", nome: "Pão brioche (un)", unidadeMedida: "un", quantidadeEstoque: 12, quantidadeMinima: 30, custoUnitario: 2.1, fornecedor: "Padaria Aurora" },
    { id: "ins3", nome: "Batata congelada (kg)", unidadeMedida: "kg", quantidadeEstoque: 25, quantidadeMinima: 10, custoUnitario: 11.0, fornecedor: "Distribuidora Nordeste" },
  ],
};

const JAPONESA: SegmentoDataset = {
  produtos: [
    { id: "prod1", categoriaNome: "Sushis", nome: "Combo 20 peças", modoPrecificacao: "margem", precoCusto: 28.0, margemPercentual: 96.4, precoVenda: 55.0, ativo: true },
    { id: "prod2", categoriaNome: "Temakis", nome: "Temaki Salmão", modoPrecificacao: "margem", precoCusto: 11.5, margemPercentual: 91.3, precoVenda: 22.0, ativo: true },
    { id: "prod3", categoriaNome: "Quentes", nome: "Yakisoba", modoPrecificacao: "preco_manual", precoCusto: 14.0, margemPercentual: 100.0, precoVenda: 28.0, ativo: true },
  ],
  insumos: [
    { id: "ins1", nome: "Salmão (kg)", unidadeMedida: "kg", quantidadeEstoque: 9, quantidadeMinima: 8, custoUnitario: 62.0, fornecedor: "Peixaria Oceano" },
    { id: "ins2", nome: "Arroz para sushi (kg)", unidadeMedida: "kg", quantidadeEstoque: 30, quantidadeMinima: 15, custoUnitario: 9.8, fornecedor: "Mercado Central" },
    { id: "ins3", nome: "Alga nori (pct)", unidadeMedida: "pct", quantidadeEstoque: 5, quantidadeMinima: 10, custoUnitario: 18.5, fornecedor: "Importadora Sakura" },
  ],
};

const PADARIA: SegmentoDataset = {
  produtos: [
    { id: "prod1", categoriaNome: "Padaria", nome: "Pão francês (kg)", modoPrecificacao: "margem", precoCusto: 6.0, margemPercentual: 66.7, precoVenda: 10.0, ativo: true },
    { id: "prod2", categoriaNome: "Salgados", nome: "Coxinha", modoPrecificacao: "margem", precoCusto: 2.8, margemPercentual: 96.4, precoVenda: 5.5, ativo: true },
    { id: "prod3", categoriaNome: "Cafeteria", nome: "Café com leite", modoPrecificacao: "preco_manual", precoCusto: 1.9, margemPercentual: 168.4, precoVenda: 5.1, ativo: true },
  ],
  insumos: [
    { id: "ins1", nome: "Farinha de trigo (kg)", unidadeMedida: "kg", quantidadeEstoque: 45, quantidadeMinima: 20, custoUnitario: 4.6, fornecedor: "Moinho Trigo Dourado" },
    { id: "ins2", nome: "Café em grão (kg)", unidadeMedida: "kg", quantidadeEstoque: 6, quantidadeMinima: 5, custoUnitario: 38.0, fornecedor: "Torrefação Serra Alta" },
    { id: "ins3", nome: "Leite (l)", unidadeMedida: "l", quantidadeEstoque: 10, quantidadeMinima: 12, custoUnitario: 5.4, fornecedor: "Laticínios Serra" },
  ],
};

const SORVETERIA: SegmentoDataset = {
  produtos: [
    { id: "prod1", categoriaNome: "Sorvetes", nome: "Casquinha simples", modoPrecificacao: "margem", precoCusto: 2.2, margemPercentual: 172.7, precoVenda: 6.0, ativo: true },
    { id: "prod2", categoriaNome: "Açaí", nome: "Açaí 500ml completo", modoPrecificacao: "margem", precoCusto: 7.5, margemPercentual: 106.7, precoVenda: 15.5, ativo: true },
    { id: "prod3", categoriaNome: "Milkshakes", nome: "Milk-shake de morango", modoPrecificacao: "preco_manual", precoCusto: 6.0, margemPercentual: 116.7, precoVenda: 13.0, ativo: true },
  ],
  insumos: [
    { id: "ins1", nome: "Base de sorvete (l)", unidadeMedida: "l", quantidadeEstoque: 20, quantidadeMinima: 10, custoUnitario: 14.0, fornecedor: "Laticínios Serra" },
    { id: "ins2", nome: "Polpa de açaí (kg)", unidadeMedida: "kg", quantidadeEstoque: 15, quantidadeMinima: 8, custoUnitario: 22.0, fornecedor: "Distribuidora Amazônia" },
    { id: "ins3", nome: "Casquinha (un)", unidadeMedida: "un", quantidadeEstoque: 80, quantidadeMinima: 40, custoUnitario: 0.6, fornecedor: "Padaria Aurora" },
  ],
};

export const SEGMENT_DATASETS: Record<TipoEstabelecimento, SegmentoDataset> = {
  churrascaria: CHURRASCARIA,
  pizzaria: PIZZARIA,
  hamburgueria: HAMBURGUERIA,
  japonesa: JAPONESA,
  padaria_cafeteria: PADARIA,
  sorveteria: SORVETERIA,
  outro: CHURRASCARIA,
};

export function dadosDoSegmento(tipo: TipoEstabelecimento): SegmentoDataset {
  return SEGMENT_DATASETS[tipo] ?? CHURRASCARIA;
}
