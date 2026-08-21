import type { PoolClient } from "pg";
import { dadosDoSegmento } from "./segment-data";
import type { ModuloSistema, TipoEstabelecimento } from "./tenant-types";

const ENTREGADORES_PADRAO = [
  { nome: "João Pedro", veiculo: "Moto" },
  { nome: "Marcos Lima", veiculo: "Moto" },
  { nome: "Renata Souza", veiculo: "Bicicleta" },
];

const MESAS_PADRAO = [
  { numero: 1, capacidade: 4 },
  { numero: 2, capacidade: 2 },
  { numero: 3, capacidade: 6 },
  { numero: 4, capacidade: 4 },
  { numero: 5, capacidade: 4 },
  { numero: 6, capacidade: 2 },
  { numero: 7, capacidade: 8 },
  { numero: 8, capacidade: 4 },
];

// Popula um estabelecimento recem-criado com um cardapio/estoque/mesas de
// exemplo, coerentes com o segmento escolhido no cadastro, para o dono ja
// abrir o sistema com algo editavel em vez de telas vazias.
export async function semearEstabelecimento(
  client: PoolClient,
  estabelecimentoId: string,
  tipo: TipoEstabelecimento,
  modulos: ModuloSistema[]
) {
  const { produtos, insumos } = dadosDoSegmento(tipo);

  for (const mesa of MESAS_PADRAO) {
    await client.query(
      `insert into mesas (estabelecimento_id, numero, capacidade) values ($1, $2, $3)`,
      [estabelecimentoId, mesa.numero, mesa.capacidade]
    );
  }

  const categoriaIds = new Map<string, string>();
  for (const nomeCategoria of new Set(produtos.map((p) => p.categoriaNome))) {
    const { rows } = await client.query(
      `insert into categorias_produto (estabelecimento_id, nome) values ($1, $2) returning id`,
      [estabelecimentoId, nomeCategoria]
    );
    categoriaIds.set(nomeCategoria, rows[0].id);
  }

  for (const produto of produtos) {
    await client.query(
      `insert into produtos
         (estabelecimento_id, categoria_id, nome, tamanho, modo_precificacao, preco_custo, margem_percentual, preco_venda)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        estabelecimentoId,
        categoriaIds.get(produto.categoriaNome),
        produto.nome,
        produto.tamanho ?? null,
        produto.modoPrecificacao,
        produto.precoCusto,
        produto.margemPercentual,
        produto.precoVenda,
      ]
    );
  }

  for (const insumo of insumos) {
    await client.query(
      `insert into insumos
         (estabelecimento_id, nome, unidade_medida, quantidade_estoque, quantidade_minima, custo_unitario, fornecedor)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        estabelecimentoId,
        insumo.nome,
        insumo.unidadeMedida,
        insumo.quantidadeEstoque,
        insumo.quantidadeMinima,
        insumo.custoUnitario,
        insumo.fornecedor ?? null,
      ]
    );
  }

  if (modulos.includes("delivery")) {
    for (const entregador of ENTREGADORES_PADRAO) {
      await client.query(
        `insert into entregadores (estabelecimento_id, nome, veiculo) values ($1, $2, $3)`,
        [estabelecimentoId, entregador.nome, entregador.veiculo]
      );
    }
  }
}
