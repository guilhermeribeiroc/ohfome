import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";

interface ItemInput {
  produtoId?: string;
  quantidade?: number;
}

function dataNaZonaAtual() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

// Venda lancada manualmente pra um dia que ja passou: cliente vendeu sem usar
// o sistema (papel, esqueceu de lancar) e quer que entre certinho no
// financeiro do dia em que aconteceu. Cria o pedido ja "finalizado", com
// created_at no dia escolhido, igual um pedido normal de balcao/delivery —
// so que sem passar pelo Kanban da cozinha.
export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!(await sessaoEhAdministrador(sessao))) {
    return NextResponse.json({ erro: "Apenas administradores podem lançar vendas de dias anteriores." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const data = typeof body?.data === "string" ? body.data : "";
  const tipo = body?.tipo === "delivery" ? "delivery" : "balcao";
  const clienteNome = typeof body?.clienteNome === "string" ? body.clienteNome.trim() : "";
  const itensInput: ItemInput[] = Array.isArray(body?.itens) ? body.itens : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > dataNaZonaAtual()) {
    return NextResponse.json({ erro: "Selecione uma data válida, até hoje." }, { status: 400 });
  }
  if (tipo === "delivery" && !clienteNome) {
    return NextResponse.json({ erro: "Informe o nome do cliente para uma venda delivery." }, { status: 400 });
  }
  const itensValidos = itensInput.filter(
    (item): item is Required<ItemInput> => typeof item.produtoId === "string" && Number.isInteger(item.quantidade) && (item.quantidade ?? 0) > 0
  );
  if (itensValidos.length === 0) {
    return NextResponse.json({ erro: "Selecione ao menos um item vendido." }, { status: 400 });
  }

  try {
    const pedidoId = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const idsProdutos = itensValidos.map((item) => item.produtoId);
      const { rows: produtosRows } = await client.query(
        `select id, preco_venda from produtos where id = any($1::uuid[]) and ativo`,
        [idsProdutos]
      );
      const precoPorProduto = new Map<string, number>(produtosRows.map((linha) => [linha.id, linha.preco_venda]));
      if (precoPorProduto.size !== new Set(idsProdutos).size) {
        throw Object.assign(new Error("Um dos produtos selecionados não existe mais."), { status: 400 });
      }

      let clienteId: string | null = null;
      if (clienteNome) {
        const { rows } = await client.query(
          `insert into clientes (estabelecimento_id, nome, telefone) values ($1, $2, $3) returning id`,
          [sessao.estabelecimentoId, clienteNome, `retroativo-${Date.now()}`]
        );
        clienteId = rows[0].id;
      }

      // Meio-dia no fuso do estabelecimento: so a data importa pro
      // financeiro, o horario exato e irrelevante aqui.
      const criadoEm = `${data}T12:00:00-03:00`;
      const { rows: pedidoRows } = await client.query(
        `insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, cliente_id, usuario_id, created_at)
         values ($1, $2, 'presencial', 'finalizado', false, $3, $4, $5::timestamptz)
         returning id`,
        [sessao.estabelecimentoId, tipo, clienteId, sessao.usuarioId, criadoEm]
      );
      const pedidoId = pedidoRows[0].id;

      for (const item of itensValidos) {
        await client.query(
          `insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
           values ($1, $2, $3, $4)`,
          [pedidoId, item.produtoId, item.quantidade, precoPorProduto.get(item.produtoId)]
        );
      }

      return pedidoId;
    });

    return NextResponse.json({ id: pedidoId }, { status: 201 });
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? 500;
    if (status === 500) console.error("POST /api/financeiro/venda-retroativa", erro);
    const mensagem = status === 400 ? (erro as Error).message : "Não foi possível lançar essa venda.";
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
