export type EstadoConexaoWhatsApp = "disconnected" | "connecting" | "connected" | "error";
export type ResultadoNotificacao = "pending" | "accepted" | "failed" | "uncertain" | "ignored";
export type StatusPedidoWhatsApp = "novo" | "em_preparo" | "pronto" | "saiu_para_entrega" | "finalizado";

export type ConexaoWhatsApp = {
  status: EstadoConexaoWhatsApp;
  connected: boolean;
  phone: string | null;
  automationEnabled: boolean;
  qrCodeDataUrl: string | null;
  qrExpiresAt: string | null;
  updatedAt: string | null;
};

export type EventoWhatsApp = {
  id: string;
  orderCode: string;
  status: StatusPedidoWhatsApp;
  createdAt: string;
  outcome: ResultadoNotificacao;
};

export type ListaEventosWhatsApp = {
  items: EventoWhatsApp[];
  nextCursor: string | null;
};

const BASE = "/api/configuracoes/conexoes/whatsapp";

async function requisitar<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => null) as { erro?: unknown; codigo?: unknown } | null;
  if (!response.ok) {
    const error = new Error(typeof body?.erro === "string" ? body.erro : "Não foi possível concluir a operação.") as Error & { status?: number; codigo?: string };
    error.status = response.status;
    error.codigo = typeof body?.codigo === "string" ? body.codigo : undefined;
    throw error;
  }
  return body as T;
}

export function buscarConexaoWhatsApp() {
  return requisitar<ConexaoWhatsApp>(BASE);
}

export function iniciarConexaoWhatsApp() {
  return requisitar<ConexaoWhatsApp>(`${BASE}/connect`, { method: "POST" });
}

export function desconectarWhatsApp() {
  return requisitar<ConexaoWhatsApp>(BASE, { method: "DELETE" });
}

export function atualizarAutomacaoWhatsApp(automationEnabled: boolean) {
  return requisitar<Pick<ConexaoWhatsApp, "automationEnabled">>(BASE, {
    method: "PATCH",
    body: JSON.stringify({ automationEnabled }),
  });
}

export function listarEventosWhatsApp() {
  return requisitar<ListaEventosWhatsApp>(`${BASE}/events?limit=10`);
}
