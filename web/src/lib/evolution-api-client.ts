import { randomBytes } from "crypto";

// Cliente server-only para a Evolution API (WhatsApp self-hosted). URL e
// chave sao segredos de servidor — nunca expostos ao navegador. Encapsula a
// versao instalada (v2.3.7, integracao WHATSAPP-BAILEYS) atras de funcoes
// estaveis, para isolar diferenças de API caso a versao mude.
export class EvolutionApiErro extends Error {
  constructor(message: string, readonly status = 502, readonly timeout = false) {
    super(message);
    this.name = "EvolutionApiErro";
  }
}

type EstadoBruto = "open" | "connecting" | "close";

function configuracao() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) {
    throw new EvolutionApiErro("A integração com WhatsApp ainda não está configurada no servidor.", 503);
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function chamar<T>(caminho: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const { url, key } = configuracao();
  let resposta: Response;
  try {
    resposta = await fetch(`${url}${caminho}`, {
      ...init,
      headers: { apikey: key, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (erro) {
    const timeout = erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
    throw new EvolutionApiErro(
      timeout ? "Tempo esgotado ao falar com o servidor do WhatsApp." : "Não foi possível falar com o servidor do WhatsApp agora.",
      502,
      timeout
    );
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new EvolutionApiErro("O servidor do WhatsApp recusou a operação.", resposta.status);
  }
  return corpo as T;
}

/** Nome de instância único por estabelecimento; gerado uma vez e persistido. Nunca enviado ao navegador. */
export function gerarNomeInstancia(estabelecimentoId: string) {
  return `ohfome_${estabelecimentoId.replace(/-/g, "").slice(0, 24)}_${randomBytes(4).toString("hex")}`;
}

export async function criarInstancia(instancia: string) {
  return chamar<{ qrcode?: { base64?: string | null } }>("/instance/create", {
    method: "POST",
    body: JSON.stringify({ instanceName: instancia, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });
}

export async function obterQrCode(instancia: string) {
  return chamar<{ base64?: string | null }>(`/instance/connect/${encodeURIComponent(instancia)}`);
}

export async function estadoConexao(instancia: string): Promise<EstadoBruto> {
  const resultado = await chamar<{ instance?: { state?: EstadoBruto } }>(
    `/instance/connectionState/${encodeURIComponent(instancia)}`
  );
  return resultado.instance?.state ?? "close";
}

export async function numeroConectado(instancia: string): Promise<string | null> {
  const lista = await chamar<Array<{ number?: string | null; ownerJid?: string | null }>>(
    `/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`
  );
  const item = lista[0];
  const bruto = item?.number ?? item?.ownerJid?.split("@")[0] ?? null;
  return bruto ? bruto.replace(/\D/g, "") || null : null;
}

/** Idempotente: desconectar uma instância já desconectada não é erro. */
export async function desconectarInstancia(instancia: string): Promise<void> {
  await chamar(`/instance/logout/${encodeURIComponent(instancia)}`, { method: "DELETE" }).catch(() => undefined);
}

export async function enviarTexto(instancia: string, numero: string, texto: string) {
  return chamar<{ key?: { id?: string | null } }>(
    `/message/sendText/${encodeURIComponent(instancia)}`,
    { method: "POST", body: JSON.stringify({ number: numero, text: texto }) },
    15_000
  );
}
