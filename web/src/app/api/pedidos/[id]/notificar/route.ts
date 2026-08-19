import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { PEDIDO_STATUS_LABEL, type PedidoStatus } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;

  const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query<{
      status: PedidoStatus;
      codigo: number;
      clienteNome: string | null;
      clienteTelefone: string | null;
      estabelecimentoNome: string;
    }>(
      `select p.status, p.codigo, c.nome as "clienteNome", c.telefone as "clienteTelefone", e.nome as "estabelecimentoNome"
       from pedidos p
       left join clientes c on c.id = p.cliente_id
       join estabelecimentos e on e.id = p.estabelecimento_id
       where p.id = $1`,
      [id]
    );
    const pedido = rows[0];
    if (!pedido || !pedido.clienteTelefone) return null;

    const mensagem = `Oi${pedido.clienteNome ? `, ${pedido.clienteNome.split(" ")[0]}` : ""}! Seu pedido #${pedido.codigo} em ${pedido.estabelecimentoNome} está: ${PEDIDO_STATUS_LABEL[pedido.status]}.`;

    await client.query("update pedidos set notificado_em = now(), notificado_mensagem = $2 where id = $1", [id, mensagem]);

    return { telefone: pedido.clienteTelefone, mensagem };
  });

  if (!resultado) {
    return NextResponse.json({ erro: "Este pedido não tem um WhatsApp de cliente cadastrado." }, { status: 400 });
  }

  return NextResponse.json(resultado);
}
