import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const STATUS_VALIDOS = ["livre", "ocupada", "aguardando_conta", "reservada"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  if (body.status === "livre") {
    const formaPagamento = body.formaPagamento;
    const tipoCartao = body.tipoCartao;
    const trocoPara = Number(body.trocoPara);
    if (formaPagamento !== undefined) {
      if (!["dinheiro", "cartao", "pix"].includes(formaPagamento)) {
        return NextResponse.json({ erro: "Forma de pagamento inválida." }, { status: 400 });
      }
      if (formaPagamento === "cartao" && tipoCartao !== "credito" && tipoCartao !== "debito") {
        return NextResponse.json({ erro: "Informe crédito ou débito." }, { status: 400 });
      }
    }

    const mesa = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: comandaRows } = await client.query(
        `select id from comandas where mesa_id = $1 and status = 'aberta'`,
        [id]
      );
      const comandaId = comandaRows[0]?.id as string | undefined;
      if (comandaId) {
        if (formaPagamento) {
          // Desocupar a mesa fecha a conta: qualquer pedido dessa comanda
          // (de qualquer rodada) leva a forma de pagamento escolhida, e o
          // que ainda nao tinha chegado em "finalizado" e forcado a
          // finalizar — some do controle de pedidos e conta no financeiro.
          await client.query(
            `update pedidos set
               status = case when status not in ('finalizado', 'cancelado') then 'finalizado' else status end,
               forma_pagamento = $2,
               tipo_cartao = $3,
               troco_para = $4
             where comanda_id = $1 and status <> 'cancelado'`,
            [comandaId, formaPagamento, formaPagamento === "cartao" ? tipoCartao : null, formaPagamento === "dinheiro" && trocoPara > 0 ? trocoPara : null]
          );
        } else {
          await client.query(
            `update pedidos set status = 'finalizado' where comanda_id = $1 and status not in ('finalizado', 'cancelado')`,
            [comandaId]
          );
        }
        await client.query(`update comandas set status = 'fechada', fechada_em = now() where id = $1`, [comandaId]);
      }
      const { rows } = await client.query(
        `update mesas set status = 'livre' where id = $1 returning id, numero, capacidade, status`,
        [id]
      );
      return rows[0] ?? null;
    });
    if (!mesa) return NextResponse.json({ erro: "Mesa não encontrada." }, { status: 404 });
    return NextResponse.json(mesa);
  }

  const colunas: string[] = [];
  const valores: unknown[] = [];
  function set(coluna: string, valor: unknown) {
    valores.push(valor);
    colunas.push(`${coluna} = $${valores.length}`);
  }

  if (body.numero !== undefined) {
    const v = Number(body.numero);
    if (!Number.isInteger(v) || v <= 0) return NextResponse.json({ erro: "Número de mesa inválido." }, { status: 400 });
    set("numero", v);
  }
  if (body.capacidade !== undefined) {
    const v = Number(body.capacidade);
    if (!Number.isInteger(v) || v <= 0) return NextResponse.json({ erro: "Capacidade inválida." }, { status: 400 });
    set("capacidade", v);
  }
  if (body.status !== undefined) {
    if (!STATUS_VALIDOS.includes(body.status)) return NextResponse.json({ erro: "Status inválido." }, { status: 400 });
    set("status", body.status);
  }

  if (colunas.length === 0) return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });

  try {
    valores.push(id);
    const mesa = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        `update mesas set ${colunas.join(", ")} where id = $${valores.length} returning id, numero, capacidade, status`,
        valores
      );
      return rows[0] ?? null;
    });
    if (!mesa) return NextResponse.json({ erro: "Mesa não encontrada." }, { status: 404 });
    return NextResponse.json(mesa);
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return NextResponse.json({ erro: "Já existe uma mesa com esse número." }, { status: 409 });
    }
    throw erro;
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  try {
    const mesa = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(`delete from mesas where id = $1 returning id`, [id]);
      return rows[0] ?? null;
    });
    if (!mesa) return NextResponse.json({ erro: "Mesa não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23503") {
      return NextResponse.json({ erro: "Essa mesa já teve pedidos e não pode ser excluída." }, { status: 409 });
    }
    throw erro;
  }
}
