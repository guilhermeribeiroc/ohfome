import { comEstabelecimento, queryInterno } from "@/lib/db";
import { EvolutionApiErro, enviarTexto } from "@/lib/evolution-api-client";
import type { StatusPedidoWhatsApp } from "@/lib/whatsapp-evolution-api";

const TAMANHO_LOTE = 20;
const INTERVALO_MS = 5_000;
const MAX_TENTATIVAS = 5;

type ClaimRow = {
  id: string;
  estabelecimentoId: string;
  pedidoId: string;
  statusPedido: StatusPedidoWhatsApp;
  tentativas: number;
};

type ContextoEnvio = {
  automationEnabled: boolean;
  instancia: string | null;
  consentimento: boolean;
  telefone: string | null;
  clienteNome: string | null;
  codigo: number | null;
  tipo: string | null;
  formaRecebimento: string | null;
  estabelecimentoNome: string | null;
};

const MENSAGEM_POR_STATUS: Record<StatusPedidoWhatsApp, (codigo: number, nome: string) => string> = {
  novo: (codigo, nome) => `Recebemos seu pedido #${codigo} na ${nome}! Já vamos preparar.`,
  em_preparo: (codigo, nome) => `Seu pedido #${codigo} na ${nome} está em preparo.`,
  pronto: (codigo, nome) => `Seu pedido #${codigo} na ${nome} está pronto!`,
  saiu_para_entrega: (codigo, nome) => `Seu pedido #${codigo} na ${nome} saiu para entrega.`,
  finalizado: (codigo, nome) => `Seu pedido #${codigo} na ${nome} foi finalizado. Obrigado!`,
};

function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

function montarTexto(statusPedido: StatusPedidoWhatsApp, tipo: string | null, formaRecebimento: string | null, codigo: number, nome: string): string {
  if (statusPedido === "finalizado" && tipo === "delivery") {
    return `Seu pedido #${codigo} na ${nome} foi entregue. Obrigado!`;
  }
  if (statusPedido === "pronto" && tipo === "balcao" && formaRecebimento === "retirada") {
    return `Seu pedido #${codigo} na ${nome} está pronto! Já pode vir buscar.`;
  }
  return MENSAGEM_POR_STATUS[statusPedido](codigo, nome);
}

async function buscarContexto(item: ClaimRow): Promise<ContextoEnvio> {
  return comEstabelecimento(item.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select e.whatsapp_automacao_ativa as "automationEnabled", e.whatsapp_instancia as "instancia", e.nome as "estabelecimentoNome",
              p.whatsapp_consentimento as "consentimento", p.codigo as "codigo", p.tipo::text as "tipo", p.forma_recebimento as "formaRecebimento",
              c.nome as "clienteNome", c.telefone as "telefone"
       from pedidos p
       join estabelecimentos e on e.id = p.estabelecimento_id
       left join clientes c on c.id = p.cliente_id
       where p.id = $1`,
      [item.pedidoId]
    );
    return (rows[0] as ContextoEnvio | undefined) ?? {
      automationEnabled: false, instancia: null, consentimento: false,
      telefone: null, clienteNome: null, codigo: null, tipo: null, formaRecebimento: null, estabelecimentoNome: null,
    };
  });
}

async function marcarResultado(estabelecimentoId: string, id: string, fila: string, providerMessageId: string | null, erro: string | null) {
  await comEstabelecimento(estabelecimentoId, (client) =>
    client.query(
      `update notificacoes_whatsapp_pedido
       set fila = $2, provider_message_id = $3, erro = $4, lease_until = null
       where id = $1`,
      [id, fila, providerMessageId, erro]
    )
  );
}

async function reagendar(estabelecimentoId: string, id: string, tentativas: number) {
  const atrasoMs = Math.min(2 ** tentativas * 30_000, 30 * 60_000);
  await comEstabelecimento(estabelecimentoId, (client) =>
    client.query(
      `update notificacoes_whatsapp_pedido
       set lease_until = null, proxima_tentativa_em = now() + make_interval(secs => $2)
       where id = $1`,
      [id, Math.round(atrasoMs / 1000)]
    )
  );
}

async function processarItem(item: ClaimRow) {
  const contexto = await buscarContexto(item);

  if (!contexto.automationEnabled || !contexto.consentimento || !contexto.instancia || !contexto.telefone || !contexto.codigo) {
    await marcarResultado(item.estabelecimentoId, item.id, "ignored", null, null);
    return;
  }

  const telefone = normalizarTelefone(contexto.telefone);
  if (telefone.length < 10 || telefone.length > 15) {
    await marcarResultado(item.estabelecimentoId, item.id, "failed", null, "telefone inválido");
    return;
  }

  const texto = montarTexto(item.statusPedido, contexto.tipo, contexto.formaRecebimento, contexto.codigo, contexto.estabelecimentoNome ?? "nosso restaurante");

  try {
    const resposta = await enviarTexto(contexto.instancia, telefone, texto);
    await marcarResultado(item.estabelecimentoId, item.id, "accepted", resposta.key?.id ?? null, null);
  } catch (erro) {
    if (erro instanceof EvolutionApiErro && erro.timeout) {
      await marcarResultado(item.estabelecimentoId, item.id, "uncertain", null, "tempo esgotado após possível envio");
      return;
    }
    if (erro instanceof EvolutionApiErro && erro.status >= 400 && erro.status < 500) {
      await marcarResultado(item.estabelecimentoId, item.id, "failed", null, "rejeitado pelo provedor");
      return;
    }
    if (item.tentativas >= MAX_TENTATIVAS) {
      await marcarResultado(item.estabelecimentoId, item.id, "failed", null, "tentativas esgotadas");
      return;
    }
    await reagendar(item.estabelecimentoId, item.id, item.tentativas);
  }
}

let executando = false;

export async function cicloWorkerWhatsApp(): Promise<void> {
  if (executando) return;
  executando = true;
  try {
    const lote = await queryInterno<ClaimRow>(
      `select id, estabelecimento_id as "estabelecimentoId", pedido_id as "pedidoId",
              status_pedido as "statusPedido", tentativas
       from fn_whatsapp_claim_notificacoes($1)`,
      [TAMANHO_LOTE]
    );
    for (const item of lote) {
      try {
        await processarItem(item);
      } catch (erro) {
        console.error("Worker WhatsApp: falha ao processar item", erro);
      }
    }
  } catch (erro) {
    console.error("Worker WhatsApp: falha no ciclo de claim", erro);
  } finally {
    executando = false;
  }
}

export function iniciarWorkerWhatsApp(): void {
  const globalFor = globalThis as unknown as { whatsappWorkerIniciado?: boolean };
  if (globalFor.whatsappWorkerIniciado) return;
  globalFor.whatsappWorkerIniciado = true;
  setInterval(() => { void cicloWorkerWhatsApp(); }, INTERVALO_MS);
}
