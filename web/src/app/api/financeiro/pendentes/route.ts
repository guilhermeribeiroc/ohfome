import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";

function semPermissao() {
  return NextResponse.json({ erro: "Apenas administradores podem fechar contas em aberto." }, { status: 403 });
}

// Pedidos de dias anteriores (fuso America/Fortaleza) que ainda nao chegaram
// em "finalizado"/"cancelado" — normalmente mesa ou comanda esquecida aberta
// virando o dia. Servem pro aviso no Financeiro e pro fechamento em lote.
export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!(await sessaoEhAdministrador(sessao))) return semPermissao();

  const pedidos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select p.id, p.codigo, p.tipo, p.status, p.total, p.created_at as "createdAt",
              m.numero as "mesaNumero", c.nome as "clienteNome"
       from pedidos p
       left join comandas cm on cm.id = p.comanda_id
       left join mesas m on m.id = cm.mesa_id
       left join clientes c on c.id = p.cliente_id
       where p.status not in ('finalizado', 'cancelado')
         and (p.created_at at time zone 'America/Fortaleza')::date < (now() at time zone 'America/Fortaleza')::date
       order by p.created_at asc`
    );
    return rows;
  });

  return NextResponse.json({
    pedidos,
    total: pedidos.reduce((soma, pedido) => soma + Number(pedido.total), 0),
  });
}

// Fecha em lote qualquer pedido de dias anteriores ainda pendente: finaliza
// o pedido (passa a contar no financeiro do dia em que foi criado, nao de
// hoje), sincroniza a entrega (se for delivery) e fecha a comanda quando
// nao sobra mais nada pendente nela (libera a mesa via trigger do banco).
export async function POST(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!(await sessaoEhAdministrador(sessao))) return semPermissao();

  const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows: finalizados } = await client.query<{ id: string; comanda_id: string | null }>(
      `update pedidos set status = 'finalizado'
       where status not in ('finalizado', 'cancelado')
         and (created_at at time zone 'America/Fortaleza')::date < (now() at time zone 'America/Fortaleza')::date
       returning id, comanda_id`
    );

    if (finalizados.length === 0) return { finalizados: 0, mesasLiberadas: 0 };

    const idsPedidos = finalizados.map((pedido) => pedido.id);
    const comandaIds = [...new Set(finalizados.map((pedido) => pedido.comanda_id).filter((id): id is string => typeof id === "string"))];

    const { rows: entregasAtualizadas } = await client.query<{ entregador_id: string | null }>(
      `update entregas set status = 'entregue', entregue_em = coalesce(entregue_em, now())
       where pedido_id = any($1::uuid[]) and status not in ('entregue', 'cancelada')
       returning entregador_id`,
      [idsPedidos]
    );
    const entregadoresIds = entregasAtualizadas.map((entrega) => entrega.entregador_id).filter((id): id is string => typeof id === "string");
    if (entregadoresIds.length) {
      await client.query("update entregadores set disponivel = true where id = any($1::uuid[])", [entregadoresIds]);
    }

    let mesasLiberadas = 0;
    if (comandaIds.length) {
      const { rows: fechadas } = await client.query(
        `update comandas set status = 'fechada', fechada_em = now()
         where id = any($1::uuid[]) and status = 'aberta'
           and not exists (select 1 from pedidos where comanda_id = comandas.id and status not in ('finalizado', 'cancelado'))
         returning id`,
        [comandaIds]
      );
      mesasLiberadas = fechadas.length;
    }

    return { finalizados: finalizados.length, mesasLiberadas };
  });

  return NextResponse.json(resultado);
}
