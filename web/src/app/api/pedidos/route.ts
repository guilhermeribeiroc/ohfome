import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const PEDIDOS_ATIVOS_QUERY = `
  select
    p.id, p.codigo, p.tipo, p.origem, p.status, p.total, p.observacoes, p.forma_recebimento as "formaRecebimento", p.forma_pagamento as "formaPagamento", p.tipo_cartao as "tipoCartao", p.troco_para as "trocoPara", p.pagamento_status as "pagamentoStatus", p.created_at as "createdAt", p.notificado_em as "notificadoEm",
    m.numero as "mesaNumero",
    c.nome as "clienteNome",
    c.telefone as "clienteTelefone",
    e.endereco as "enderecoEntrega",
    u.nome as "usuarioNome",
    coalesce(
      (
        select json_agg(json_build_object(
          'id', ip.id,
          'produtoId', ip.produto_id,
          'produtoNome', pr.nome || case when ip.tamanho is not null then ' (' || ip.tamanho::text || ')' else '' end,
          'produtoTamanho', ip.tamanho,
          'quantidade', ip.quantidade,
          'precoUnitario', ip.preco_unitario,
          'observacoes', ip.observacoes,
          'status', ip.status
        ) order by ip.created_at)
        from itens_pedido ip
        join produtos pr on pr.id = ip.produto_id
        where ip.pedido_id = p.id
      ),
      '[]'
    ) as itens
  from pedidos p
  left join comandas cm on cm.id = p.comanda_id
  left join mesas m on m.id = cm.mesa_id
  left join clientes c on c.id = p.cliente_id
  left join entregas e on e.pedido_id = p.id
  left join usuarios u on u.id = p.usuario_id
`;

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const origem = new URL(request.url).searchParams.get("origem");

  const pedidos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `${PEDIDOS_ATIVOS_QUERY}
       where p.status not in ('finalizado', 'cancelado')
         and ($1::pedido_origem is null or p.origem = $1)
       order by p.created_at asc`,
      [origem]
    );
    return rows;
  });

  return NextResponse.json(pedidos);
}

interface ItemInput {
  produtoId?: string;
  quantidade?: number;
  observacoes?: string;
}

export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const tipo = body?.tipo;
  const mesaId = body?.mesaId;
  const clienteNome = typeof body?.clienteNome === "string" ? body.clienteNome.trim() : undefined;
  const endereco = typeof body?.endereco === "string" ? body.endereco.trim() : undefined;
  const bairroId = typeof body?.bairroId === "string" ? body.bairroId : undefined;
  const itensInput: ItemInput[] = Array.isArray(body?.itens) ? body.itens : [];

  if (tipo !== "mesa" && tipo !== "balcao" && tipo !== "delivery") {
    return NextResponse.json({ erro: "Tipo de pedido inválido." }, { status: 400 });
  }
  if (tipo === "mesa" && typeof mesaId !== "string") {
    return NextResponse.json({ erro: "Informe a mesa." }, { status: 400 });
  }
  if (tipo === "delivery" && (!clienteNome || !endereco)) {
    return NextResponse.json({ erro: "Informe cliente e endereço para delivery." }, { status: 400 });
  }
  const itensValidos = itensInput.filter(
    (i): i is Required<ItemInput> => typeof i.produtoId === "string" && Number.isInteger(i.quantidade) && (i.quantidade ?? 0) > 0
  );
  if (itensValidos.length === 0) {
    return NextResponse.json({ erro: "O pedido precisa de ao menos um item." }, { status: 400 });
  }

  try {
    const pedidoId = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      // Preco sempre vem do banco, nunca do cliente.
      const idsProdutos = itensValidos.map((i) => i.produtoId);
      const { rows: produtosRows } = await client.query(
        `select id, preco_venda from produtos where id = any($1::uuid[]) and ativo`,
        [idsProdutos]
      );
      const precoPorProduto = new Map<string, number>(produtosRows.map((r) => [r.id, r.preco_venda]));
      if (precoPorProduto.size !== new Set(idsProdutos).size) {
        throw Object.assign(new Error("Produto inválido ou inexistente."), { status: 400 });
      }

      let comandaId: string | null = null;
      if (tipo === "mesa") {
        // A busca da mesa passa pela RLS de "mesas": se o mesaId nao for
        // desta tenant, vem vazio e barra aqui, antes de tocar em comandas
        // (que nao tem RLS propria, so o vinculo com a mesa).
        const { rows: mesaValida } = await client.query(`select id from mesas where id = $1`, [mesaId]);
        if (mesaValida.length === 0) {
          throw Object.assign(new Error("Mesa inválida."), { status: 400 });
        }

        const { rows: comandaAberta } = await client.query(
          `select id from comandas where mesa_id = $1 and status = 'aberta'`,
          [mesaId]
        );
        if (comandaAberta.length > 0) {
          comandaId = comandaAberta[0].id;
        } else {
          const { rows: novaComanda } = await client.query(
            `insert into comandas (mesa_id, garcom_id) values ($1, $2) returning id`,
            [mesaId, sessao.usuarioId]
          );
          comandaId = novaComanda[0].id;
        }
      }

      let clienteId: string | null = null;
      if (tipo === "delivery" && clienteNome) {
        const { rows } = await client.query(
          `insert into clientes (estabelecimento_id, nome, telefone) values ($1, $2, $3) returning id`,
          [sessao.estabelecimentoId, clienteNome, `sem-telefone-${Date.now()}`]
        );
        clienteId = rows[0].id;
      }

      let bairroNome: string | null = null;
      let taxaEntrega = 0;
      if (tipo === "delivery" && bairroId) {
        const { rows: bairroRows } = await client.query(
          `select nome, taxa from bairros_entrega where id = $1`,
          [bairroId]
        );
        if (bairroRows.length === 0) throw Object.assign(new Error("Bairro inválido."), { status: 400 });
        bairroNome = bairroRows[0].nome;
        taxaEntrega = bairroRows[0].taxa;
      }

      const { rows: pedidoRows } = await client.query(
        `insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, comanda_id, cliente_id, usuario_id, taxa_entrega)
         values ($1, $2, 'presencial', 'novo', true, now(), $3, $4, $5, $6)
         returning id`,
        [sessao.estabelecimentoId, tipo, comandaId, clienteId, sessao.usuarioId, taxaEntrega]
      );
      const pedidoId = pedidoRows[0].id;

      for (const item of itensValidos) {
        await client.query(
          `insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, observacoes)
           values ($1, $2, $3, $4, $5)`,
          [pedidoId, item.produtoId, item.quantidade, precoPorProduto.get(item.produtoId), item.observacoes ?? null]
        );
      }

      if (tipo === "delivery") {
        await client.query(`insert into entregas (pedido_id, endereco, bairro) values ($1, $2, $3)`, [pedidoId, endereco, bairroNome]);
      }

      return pedidoId;
    });

    const [pedido] = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(`${PEDIDOS_ATIVOS_QUERY} where p.id = $1`, [pedidoId]);
      return rows;
    });

    return NextResponse.json(pedido, { status: 201 });
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? 500;
    if (status === 500) console.error("POST /api/pedidos", erro);
    const mensagem = status === 400 ? (erro as Error).message : "Não foi possível criar o pedido.";
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
