// Regras do crediário. O saldo NÃO é guardado: é calculado dos pedidos no crediário menos os pagamentos
// recebidos, então continua certo se um pedido for editado, trocado ou cancelado.

type ConsultaSql = { query: <T = unknown>(texto: string, valores?: unknown[]) => Promise<{ rows: T[] }> };

/** Quanto o cliente deve hoje (pedidos no crediário não cancelados - pagamentos). `excetoPedidoId` tira um pedido da conta. */
export async function saldoDoCliente(client: ConsultaSql, clienteId: string, excetoPedidoId?: string): Promise<number> {
  const { rows } = await client.query<{ saldo: string }>(
    `select coalesce((select sum(total) from pedidos
                       where cliente_id = $1 and forma_pagamento = 'crediario' and status <> 'cancelado'
                         and ($2::uuid is null or id <> $2::uuid)), 0)
          - coalesce((select sum(valor) from crediario_pagamentos where cliente_id = $1), 0) as saldo`,
    [clienteId, excetoPedidoId ?? null]
  );
  return Number(rows[0]?.saldo ?? 0);
}

const dinheiro = (valor: number) => `R$ ${valor.toFixed(2).replace(".", ",")}`;

/**
 * Garante que o pedido pode ficar no crediário: o pedido precisa ter um cliente com crediário ligado, e a conta
 * (saldo + este pedido) não pode passar do limite, quando o cliente tem limite.
 */
export async function validarPedidoNoCrediario(client: ConsultaSql, pedidoIds: string[], clienteId: string | null, totalDoPedido: number) {
  if (!clienteId) throw Object.assign(new Error("Escolha o cliente do crediário."), { status: 409 });
  const { rows } = await client.query<{ nome: string; crediario: boolean; limite: string | null }>(
    `select nome, crediario, limite_crediario as limite from clientes where id = $1`, [clienteId]
  );
  const cliente = rows[0];
  if (!cliente) throw Object.assign(new Error("Cliente não encontrado."), { status: 409 });
  if (!cliente.crediario) throw Object.assign(new Error(`${cliente.nome} não tem crediário. Ative em Clientes > Editar.`), { status: 409 });
  if (cliente.limite !== null) {
    let saldo = await saldoDoCliente(client, clienteId);
    // O próprio pedido pode já estar no saldo (ao trocar a forma ou acrescentar itens): tira antes de somar o total novo.
    if (pedidoIds.length) {
      const { rows: jaNaConta } = await client.query<{ total: string }>(
        `select coalesce(sum(total), 0) as total from pedidos where id = any($1::uuid[]) and forma_pagamento = 'crediario' and status <> 'cancelado'`, [pedidoIds]
      );
      saldo -= Number(jaNaConta[0]?.total ?? 0);
    }
    if (saldo + totalDoPedido > Number(cliente.limite) + 0.001) {
      throw Object.assign(new Error(`Passa do limite do crediário de ${cliente.nome}: deve ${dinheiro(Math.max(0, saldo))}, este pedido é ${dinheiro(totalDoPedido)} e o limite é ${dinheiro(Number(cliente.limite))}.`), { status: 409 });
    }
  }
}
