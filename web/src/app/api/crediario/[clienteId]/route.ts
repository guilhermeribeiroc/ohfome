import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeUsarCrediario } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { saldoDoCliente } from "@/lib/crediario";

// Extrato de UM cliente: compras no crediário (pedidos) e pagamentos recebidos, do mais novo ao mais antigo.
export async function GET(request: NextRequest, { params }: { params: Promise<{ clienteId: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeUsarCrediario(sessao)) return respostaAcessoNegado();
  const { clienteId } = await params;

  const extrato = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows: clientes } = await client.query(
      `select id, nome, telefone, crediario, limite_crediario as "limiteCrediario" from clientes where id = $1`, [clienteId]
    );
    if (!clientes[0]) return null;
    const { rows: compras } = await client.query(
      `select p.id, p.codigo, p.total, p.status, p.created_at as "data",
              coalesce((select string_agg(ip.quantidade || 'x ' || pr.nome, ', ' order by ip.created_at)
                          from itens_pedido ip join produtos pr on pr.id = ip.produto_id
                         where ip.pedido_id = p.id and ip.status <> 'cancelado'), '') as itens
         from pedidos p
        where p.cliente_id = $1 and p.forma_pagamento = 'crediario' and p.status <> 'cancelado'
        order by p.created_at desc limit 200`, [clienteId]
    );
    const { rows: pagamentos } = await client.query(
      `select pg.id, pg.valor, pg.forma_pagamento as "forma", pg.observacao, pg.created_at as "data", u.nome as "usuarioNome"
         from crediario_pagamentos pg left join usuarios u on u.id = pg.usuario_id
        where pg.cliente_id = $1 order by pg.created_at desc limit 200`, [clienteId]
    );
    const saldo = await saldoDoCliente(client, clienteId);
    return {
      cliente: { ...clientes[0], limiteCrediario: clientes[0].limiteCrediario === null ? null : Number(clientes[0].limiteCrediario) },
      saldo,
      compras: compras.map((compra) => ({ ...compra, total: Number(compra.total) })),
      pagamentos: pagamentos.map((pagamento) => ({ ...pagamento, valor: Number(pagamento.valor) })),
    };
  });
  if (!extrato) return NextResponse.json({ erro: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json(extrato);
}

// Recebe um pagamento (total ou parcial) do crediário do cliente.
export async function POST(request: NextRequest, { params }: { params: Promise<{ clienteId: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeUsarCrediario(sessao)) return respostaAcessoNegado();
  const { clienteId } = await params;
  const body = await request.json().catch(() => null);
  const valor = Math.round(Number(body?.valor) * 100) / 100;
  const forma = body?.forma;
  const observacao = typeof body?.observacao === "string" ? body.observacao.trim().slice(0, 200) || null : null;
  if (!Number.isFinite(valor) || valor <= 0) return NextResponse.json({ erro: "Informe o valor recebido." }, { status: 400 });
  if (forma !== "dinheiro" && forma !== "pix" && forma !== "cartao") return NextResponse.json({ erro: "Escolha como o cliente pagou." }, { status: 400 });

  try {
    const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      // Trava o cliente para dois recebimentos ao mesmo tempo não passarem do saldo.
      const { rows } = await client.query(`select id from clientes where id = $1 for update`, [clienteId]);
      if (!rows[0]) return { erro: "Cliente não encontrado.", status: 404 };
      const saldo = await saldoDoCliente(client, clienteId);
      if (saldo <= 0) return { erro: "Este cliente não deve nada no crediário.", status: 409 };
      if (valor > saldo + 0.001) return { erro: `O valor passa do que o cliente deve (R$ ${saldo.toFixed(2).replace(".", ",")}).`, status: 409 };
      await client.query(
        `insert into crediario_pagamentos (estabelecimento_id, cliente_id, valor, forma_pagamento, observacao, usuario_id) values ($1, $2, $3, $4, $5, $6)`,
        [sessao.estabelecimentoId, clienteId, valor, forma, observacao, sessao.usuarioId]
      );
      return { saldoDepois: await saldoDoCliente(client, clienteId) };
    });
    if ("erro" in resultado) return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
    return NextResponse.json(resultado, { status: 201 });
  } catch (erro) {
    console.error("POST crediario pagamento", erro);
    return NextResponse.json({ erro: "Não foi possível registrar o pagamento." }, { status: 500 });
  }
}
