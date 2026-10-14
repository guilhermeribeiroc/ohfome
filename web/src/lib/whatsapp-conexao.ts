import { comEstabelecimento } from "@/lib/db";
import {
  EvolutionApiErro, estadoConexao, numeroConectado, obterQrCode,
} from "@/lib/evolution-api-client";

export type EstadoConexaoWhatsApp = "disconnected" | "connecting" | "connected" | "error";

export type ConexaoWhatsApp = {
  status: EstadoConexaoWhatsApp;
  connected: boolean;
  phone: string | null;
  automationEnabled: boolean;
  qrCodeDataUrl: string | null;
  qrExpiresAt: string | null;
  updatedAt: string | null;
};

const QR_VALIDADE_MS = 45_000;

/** Lança para o handler decidir 404 WHATSAPP_INTEGRATION_NOT_CONFIGURED. */
export { EvolutionApiErro };

export async function buscarConfigWhatsApp(estabelecimentoId: string) {
  return comEstabelecimento(estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select whatsapp_instancia as "instancia", whatsapp_automacao_ativa as "automationEnabled"
       from estabelecimentos where id = $1`,
      [estabelecimentoId]
    );
    return rows[0] as { instancia: string | null; automationEnabled: boolean };
  });
}

/**
 * Monta o objeto de conexão consumido pela UI. incluirQr=true busca um QR
 * novo quando o estado for "connecting" (usado no GET de polling e no
 * POST /connect); false evita a chamada extra onde não é necessária.
 */
export async function montarEstadoConexao(
  instancia: string | null,
  automationEnabled: boolean,
  incluirQr: boolean
): Promise<ConexaoWhatsApp> {
  const agora = new Date().toISOString();
  const base = { automationEnabled, phone: null, qrCodeDataUrl: null, qrExpiresAt: null, updatedAt: agora };

  if (!instancia) {
    return { ...base, status: "disconnected", connected: false };
  }

  let bruto: "open" | "connecting" | "close";
  try {
    bruto = await estadoConexao(instancia);
  } catch (erro) {
    if (erro instanceof EvolutionApiErro && erro.status === 503) throw erro;
    return { ...base, status: "error", connected: false };
  }

  if (bruto === "open") {
    const phone = await numeroConectado(instancia).catch(() => null);
    return { ...base, status: "connected", connected: true, phone };
  }

  if (bruto === "connecting") {
    if (!incluirQr) return { ...base, status: "connecting", connected: false };
    const qr = await obterQrCode(instancia).catch(() => null);
    return {
      ...base,
      status: "connecting",
      connected: false,
      qrCodeDataUrl: qr?.base64 ?? null,
      qrExpiresAt: qr?.base64 ? new Date(Date.now() + QR_VALIDADE_MS).toISOString() : null,
    };
  }

  return { ...base, status: "disconnected", connected: false };
}
