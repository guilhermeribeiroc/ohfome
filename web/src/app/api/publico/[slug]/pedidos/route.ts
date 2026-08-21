import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { comEstabelecimento, queryPublico } from "@/lib/db";
import { accessTokenDoEstabelecimento, criarCobrancaPixMercadoPago, MercadoPagoErro } from "@/lib/mercado-pago";
import { limitado } from "@/lib/rate-limit";

const EMAIL_TELEFONE_MIN = 8;

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = request.headers.get("x-forwarded-for") ?? "local";

  if (limitado(`pedido-publico:${ip}`)) {
    return NextResponse.json({ erro: "Muitos pedidos em pouco tempo. Aguarde um instante." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const clienteNome = typeof body?.clienteNome === "string" ? body.clienteNome.trim() : "";
  const telefone = typeof body?.telefone === "string" ? body.telefone.trim() : "";
  const endereco = typeof body?.endereco === "string" ? body.endereco.trim() : "";
  const formaRecebimento = body?.formaRecebimento === "retirada" ? "retirada" : body?.formaRecebimento === "entrega" ? "entrega" : "";
  const formaPagamento = body?.formaPagamento === "cartao" ? "cartao" : body?.formaPagamento === "dinheiro" ? "dinheiro" : body?.formaPagamento === "pix" ? "pix" : "";
  const tipoCartao = body?.tipoCartao === "credito" ? "credito" : body?.tipoCartao === "debito" ? "debito" : "";
  const trocoPara = body?.trocoPara === null || body?.trocoPara === undefined || body?.trocoPara === "" ? null : Number(body.trocoPara);
  const observacoes = typeof body?.observacoes === "string" ? body.observacoes.trim() : "";
  const cpf = typeof body?.cpf === "string" ? body.cpf.replace(/\D/g, "") : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const notificar = body?.notificar === true;
  const bairroId = typeof body?.bairroId === "string" ? body.bairroId : null;
  const itens = Array.isArray(body?.itens) ? body.itens : [];

  if (clienteNome.length < 2) return NextResponse.json({ erro: "Informe seu nome." }, { status: 400 });
  if (telefone.length < EMAIL_TELEFONE_MIN) return NextResponse.json({ erro: "Informe um telefone válido." }, { status: 400 });
  if (!formaRecebimento) return NextResponse.json({ erro: "Escolha entre entrega ou retirada." }, { status: 400 });
  if (!formaPagamento) return NextResponse.json({ erro: "Escolha a forma de pagamento." }, { status: 400 });
  if (formaPagamento === "cartao" && !tipoCartao) return NextResponse.json({ erro: "Escolha crédito ou débito." }, { status: 400 });
  if (trocoPara !== null && (!Number.isFinite(trocoPara) || trocoPara <= 0)) return NextResponse.json({ erro: "Informe um valor de troco válido." }, { status: 400 });
  if (formaRecebimento === "entrega" && endereco.length < 10) return NextResponse.json({ erro: "Informe o endereço completo para entrega." }, { status: 400 });
  if (formaRecebimento === "entrega" && !bairroId) return NextResponse.json({ erro: "Selecione o bairro de entrega." }, { status: 400 });
  if (observacoes.length > 1000) return NextResponse.json({ erro: "As observações podem ter até 1.000 caracteres." }, { status: 400 });
  if (itens.length === 0) return NextResponse.json({ erro: "Adicione ao menos um item ao pedido." }, { status: 400 });

  try {
    const linhas = await queryPublico<{ fn_criar_pedido_publico: { id: string; codigo: number; estabelecimentoId: string; notificar: boolean; taxaEntrega: number; total: number; pixModo?: "manual" | "mercado_pago" | null; aguardandoPagamento?: boolean } }>(
      "select fn_criar_pedido_publico($1, $2, $3, $4, $5, $6, $7, $8, $9::numeric, $10::jsonb, $11, $12, $13::uuid, $14)",
      [slug, clienteNome, telefone, formaRecebimento, endereco, observacoes, formaPagamento, tipoCartao || null, trocoPara, JSON.stringify(itens), cpf || null, notificar, bairroId, email || null]
    );
    const pedido = linhas[0].fn_criar_pedido_publico;

    if (pedido.pixModo !== "mercado_pago") return NextResponse.json(pedido, { status: 201 });

    try {
      const cobranca = await comEstabelecimento(pedido.estabelecimentoId, async (client) => {
        const { rows: configuracoes } = await client.query<{ expiracaoMinutos: number }>(
          `select expiracao_minutos as "expiracaoMinutos" from configuracoes_pix
           where estabelecimento_id = $1 and ativo and modo = 'mercado_pago'`, [pedido.estabelecimentoId]
        );
        const configuracao = configuracoes[0];
        if (!configuracao) throw new MercadoPagoErro("Pix automático não está disponível neste momento.", 409);
        const { rows: clienteRows } = await client.query<{ email: string | null }>(
          `select c.email from pedidos p join clientes c on c.id = p.cliente_id where p.id = $1 and p.enviado_cozinha = false`, [pedido.id]
        );
        const emailPagador = clienteRows[0]?.email;
        if (!emailPagador) throw new MercadoPagoErro("Informe um e-mail válido para gerar o Pix.", 400);

        const idempotencyKey = randomUUID();
        const expiraEm = new Date(Date.now() + configuracao.expiracaoMinutos * 60_000);
        await client.query(`insert into pagamentos_pix (estabelecimento_id, pedido_id, provedor, idempotency_key, valor, expira_em)
          values ($1, $2, 'mercado_pago', $3::uuid, $4, $5)`, [pedido.estabelecimentoId, pedido.id, idempotencyKey, pedido.total, expiraEm]);
        const resultado = await criarCobrancaPixMercadoPago(await accessTokenDoEstabelecimento(client, pedido.estabelecimentoId), {
          pedidoId: pedido.id,
          valor: pedido.total,
          email: emailPagador,
          expiraEm,
          idempotencyKey,
        });
        const pagamento = resultado.pagamento;
        await client.query(`update pagamentos_pix
          set order_id = $2, payment_id = $3, status = 'pendente', copia_cola = $4,
              qr_code_base64 = $5, ticket_url = $6
          where pedido_id = $1`, [pedido.id, resultado.ordem.id, pagamento.id ?? null,
            pagamento.payment_method?.qr_code ?? null, pagamento.payment_method?.qr_code_base64 ?? null,
            pagamento.payment_method?.ticket_url ?? null]);
        return {
          copiaCola: pagamento.payment_method?.qr_code,
          qrCodeBase64: pagamento.payment_method?.qr_code_base64,
          ticketUrl: pagamento.payment_method?.ticket_url,
          expiraEm: expiraEm.toISOString(),
        };
      });
      return NextResponse.json({ ...pedido, cobranca }, { status: 201 });
    } catch (erro) {
      await comEstabelecimento(pedido.estabelecimentoId, async (client) => {
        await client.query(`update pedidos set pagamento_status = 'falhou'
          where id = $1 and enviado_cozinha = false and pagamento_status = 'pendente'`, [pedido.id]);
      }).catch(() => undefined);
      const status = erro instanceof MercadoPagoErro ? erro.status : 502;
      return NextResponse.json({ erro: erro instanceof MercadoPagoErro ? erro.message : "Não foi possível gerar o Pix. Tente novamente." }, { status });
    }
  } catch (erro) {
    const detalhes = erro as { message?: string; code?: string };
    if (detalhes.code === "P0002") {
      return NextResponse.json({ erro: "Cardápio não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ erro: "Não foi possível enviar o pedido. Confira os itens e tente novamente." }, { status: 400 });
  }
}
