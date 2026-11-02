import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

// Editar UM item de um pedido já feito: mudar a quantidade (PATCH) ou removê-lo (DELETE). O item removido fica no
// histórico como cancelado, o estoque volta e o total se ajusta. Se o pedido já foi para a cozinha, sai uma comanda
// com o aviso da mudança.

type Resultado = { erro: string; status: number } | { ok: true };

async function editar(
  request: NextRequest,
  pedidoId: string,
  itemId: string,
  acao: (client: Parameters<Parameters<typeof comEstabelecimento>[1]>[0], item: { nome: string; quantidade: number; enviadoCozinha: boolean }) => Promise<{ aviso: string } | { erro: string; status: number }>,
): Promise<NextResponse> {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  const pode = sessao.role === "admin" || sessaoPodeAcessarModulo(sessao, "balcao") || sessaoPodeAcessarModulo(sessao, "delivery") || sessaoPodeAcessarModulo(sessao, "garcom");
  if (!pode) return respostaAcessoNegado();

  try {
    const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client): Promise<Resultado> => {
      const { rows } = await client.query<{ nome: string; quantidade: number; statusItem: string; statusPedido: string; enviadoCozinha: boolean }>(
        `select pr.nome || case when ip.tamanho is not null then ' (' || ip.tamanho::text || ')' else '' end as nome, ip.quantidade,
                ip.status as "statusItem", p.status as "statusPedido", p.enviado_cozinha as "enviadoCozinha"
           from itens_pedido ip join pedidos p on p.id = ip.pedido_id join produtos pr on pr.id = ip.produto_id
          where ip.id = $1 and ip.pedido_id = $2 for update of p, ip`,
        [itemId, pedidoId]
      );
      const item = rows[0];
      if (!item) return { erro: "Item não encontrado neste pedido.", status: 404 };
      if (item.statusItem === "cancelado") return { erro: "Este item já foi removido.", status: 409 };
      if (item.statusPedido === "saiu_para_entrega") return { erro: "Este pedido já saiu para entrega e não pode mais ser alterado.", status: 409 };
      if (item.statusPedido === "finalizado" || item.statusPedido === "cancelado") return { erro: `Pedido ${item.statusPedido === "cancelado" ? "cancelado" : "já finalizado"} não pode ser alterado.`, status: 409 };

      const feito = await acao(client, { nome: item.nome, quantidade: item.quantidade, enviadoCozinha: item.enviadoCozinha });
      if ("erro" in feito) return feito;
      if (item.enviadoCozinha) {
        await client.query(
          `insert into impressao_jobs (estabelecimento_id, pedido_id, tipo, origem, aviso)
           select estabelecimento_id, id, 'cozinha', 'alteracao', $2 from pedidos where id = $1`,
          [pedidoId, feito.aviso]
        );
      }
      return { ok: true };
    });
    if ("erro" in resultado) return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    const detalhes = erro as { code?: string; message?: string };
    if (detalhes.code === "23514" || detalhes.code === "22023") return NextResponse.json({ erro: detalhes.message ?? "Não foi possível alterar o item." }, { status: 409 });
    console.error("itens do pedido", erro);
    return NextResponse.json({ erro: "Não foi possível alterar o item." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const body = await request.json().catch(() => null);
  const quantidade = Number(body?.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) return NextResponse.json({ erro: "Informe uma quantidade de 1 a 99." }, { status: 400 });
  return editar(request, id, itemId, async (client, item) => {
    if (item.quantidade === quantidade) return { erro: "A quantidade já é essa.", status: 409 };
    await client.query(`select fn_alterar_quantidade_item($1::uuid, $2::integer)`, [itemId, quantidade]);
    return { aviso: `ALTERADO: ${item.nome} DE ${item.quantidade}X PARA ${quantidade}X` };
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  return editar(request, id, itemId, async (client, item) => {
    const { rows } = await client.query<{ restantes: string }>(
      `select count(*)::text as restantes from itens_pedido where pedido_id = $1 and id <> $2 and status <> 'cancelado'`,
      [id, itemId]
    );
    if (Number(rows[0].restantes) < 1) return { erro: "Este é o único item do pedido. Para tirar tudo, cancele o pedido.", status: 409 };
    await client.query(`select fn_cancelar_item_pedido($1::uuid)`, [itemId]);
    return { aviso: `RETIRAR: ${item.quantidade}X ${item.nome}` };
  });
}
