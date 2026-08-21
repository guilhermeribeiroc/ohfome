import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { PoolClient } from "pg";

const MP_API = "https://api.mercadopago.com";
const MP_AUTH = "https://auth.mercadopago.com/authorization";

type OAuthToken = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user_id?: number | string;
  scope?: string;
};

type OrdemMercadoPago = {
  id?: string;
  total_amount?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      amount?: string;
      status?: string;
      status_detail?: string;
      payment_method?: {
        id?: string;
        type?: string;
        ticket_url?: string;
        qr_code?: string;
        qr_code_base64?: string;
      };
    }>;
  };
};

export class MercadoPagoErro extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "MercadoPagoErro";
  }
}

function ambiente(nome: "MERCADO_PAGO_CLIENT_ID" | "MERCADO_PAGO_CLIENT_SECRET" | "MERCADO_PAGO_REDIRECT_URI" | "MERCADO_PAGO_TOKEN_ENCRYPTION_KEY") {
  const valor = process.env[nome];
  if (!valor) throw new MercadoPagoErro(`A integração Mercado Pago ainda não está configurada (${nome}).`, 503);
  return valor;
}

function chaveCifragem() {
  const chave = Buffer.from(ambiente("MERCADO_PAGO_TOKEN_ENCRYPTION_KEY"), "base64");
  if (chave.length !== 32) throw new MercadoPagoErro("A chave de proteção do Mercado Pago precisa ter 32 bytes em Base64.", 503);
  return chave;
}

export function cifrarSegredo(valor: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chaveCifragem(), iv);
  const conteudo = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${conteudo.toString("base64url")}`;
}

function decifrarSegredo(valor: string) {
  const [versao, iv, tag, conteudo] = valor.split(".");
  if (versao !== "v1" || !iv || !tag || !conteudo) throw new MercadoPagoErro("A conexão Mercado Pago armazenada é inválida.", 500);
  try {
    const decipher = createDecipheriv("aes-256-gcm", chaveCifragem(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(conteudo, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new MercadoPagoErro("Não foi possível abrir a conexão segura do Mercado Pago.", 500);
  }
}

export function criarVerifierPkce() {
  return randomBytes(48).toString("base64url");
}

function challengePkce(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function urlAutorizacaoMercadoPago(state: string, verifier: string) {
  const params = new URLSearchParams({
    client_id: ambiente("MERCADO_PAGO_CLIENT_ID"),
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: ambiente("MERCADO_PAGO_REDIRECT_URI"),
    code_challenge: challengePkce(verifier),
    code_challenge_method: "S256",
  });
  return `${MP_AUTH}?${params.toString()}`;
}

async function requisicaoToken(campos: Record<string, string>) {
  const resposta = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: ambiente("MERCADO_PAGO_CLIENT_ID"),
      client_secret: ambiente("MERCADO_PAGO_CLIENT_SECRET"),
      ...campos,
    }),
    cache: "no-store",
  });
  const dados = await resposta.json().catch(() => null) as OAuthToken | null;
  if (!resposta.ok || !dados?.access_token || !dados.refresh_token) {
    throw new MercadoPagoErro("O Mercado Pago não autorizou a conexão desta conta.", 502);
  }
  return dados;
}

export function trocarCodigoMercadoPago(code: string, verifier: string) {
  return requisicaoToken({ grant_type: "authorization_code", code, redirect_uri: ambiente("MERCADO_PAGO_REDIRECT_URI"), code_verifier: verifier });
}

async function renovarTokenMercadoPago(refreshToken: string) {
  return requisicaoToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function accessTokenDoEstabelecimento(client: PoolClient, estabelecimentoId: string) {
  const { rows } = await client.query<{
    accessTokenCifrado: string;
    refreshTokenCifrado: string;
    tokenExpiraEm: Date | null;
  }>(`select access_token_cifrado as "accessTokenCifrado", refresh_token_cifrado as "refreshTokenCifrado", token_expira_em as "tokenExpiraEm"
      from mercado_pago_conexoes where estabelecimento_id = $1 for update`, [estabelecimentoId]);
  const conexao = rows[0];
  if (!conexao) throw new MercadoPagoErro("Conecte a conta Mercado Pago deste restaurante antes de ativar Pix automático.", 409);

  const expiraEm = conexao.tokenExpiraEm?.getTime() ?? 0;
  if (expiraEm > Date.now() + 5 * 60_000) return decifrarSegredo(conexao.accessTokenCifrado);

  const renovado = await renovarTokenMercadoPago(decifrarSegredo(conexao.refreshTokenCifrado));
  const proximaExpiracao = new Date(Date.now() + Math.max(60, renovado.expires_in ?? 60 * 60) * 1000);
  await client.query(
    `update mercado_pago_conexoes
       set access_token_cifrado = $2, refresh_token_cifrado = $3, token_expira_em = $4, scope = $5
     where estabelecimento_id = $1`,
    [estabelecimentoId, cifrarSegredo(renovado.access_token), cifrarSegredo(renovado.refresh_token), proximaExpiracao, renovado.scope ?? null]
  );
  return renovado.access_token;
}

async function buscarOrdem(accessToken: string, orderId: string) {
  const resposta = await fetch(`${MP_API}/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  const dados = await resposta.json().catch(() => null) as OrdemMercadoPago | null;
  if (!resposta.ok || !dados?.id) throw new MercadoPagoErro("Não foi possível consultar o pagamento no Mercado Pago.", 502);
  return dados;
}

export async function criarCobrancaPixMercadoPago(accessToken: string, input: { pedidoId: string; valor: number; email: string; expiraEm: Date; idempotencyKey: string }) {
  const minutos = Math.max(30, Math.ceil((input.expiraEm.getTime() - Date.now()) / 60_000));
  const resposta = await fetch(`${MP_API}/v1/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      type: "online",
      total_amount: input.valor.toFixed(2),
      external_reference: input.pedidoId,
      processing_mode: "automatic",
      transactions: { payments: [{ amount: input.valor.toFixed(2), payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: `PT${minutos}M` }] },
      payer: { email: input.email },
    }),
    cache: "no-store",
  });
  const ordem = await resposta.json().catch(() => null) as OrdemMercadoPago | null;
  const pagamento = ordem?.transactions?.payments?.[0];
  if (!resposta.ok || !ordem?.id || !pagamento?.payment_method?.qr_code || !pagamento.payment_method.qr_code_base64) {
    throw new MercadoPagoErro("Não foi possível gerar o Pix. Tente novamente em instantes.", 502);
  }
  return { ordem, pagamento };
}

export async function consultarOrdemMercadoPago(client: PoolClient, estabelecimentoId: string, orderId: string) {
  return buscarOrdem(await accessTokenDoEstabelecimento(client, estabelecimentoId), orderId);
}

export function pagamentoAprovado(ordem: OrdemMercadoPago) {
  const pagamento = ordem.transactions?.payments?.[0];
  return ordem.status === "processed" || pagamento?.status === "approved";
}

export function dadosPagamento(ordem: OrdemMercadoPago) {
  const pagamento = ordem.transactions?.payments?.[0];
  return { paymentId: pagamento?.id ?? null, status: pagamento?.status ?? ordem.status ?? "pendente", valor: Number(pagamento?.amount ?? ordem.total_amount ?? 0) };
}

export function validarAssinaturaWebhook(input: { signature: string | null; requestId: string | null; dataId: string | null }) {
  const segredo = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!segredo || !input.signature) return false;
  const partes = Object.fromEntries(input.signature.split(",").map((parte) => {
    const [chave, ...valor] = parte.trim().split("=");
    return [chave, valor.join("=")];
  }));
  const timestamp = partes.ts;
  const assinatura = partes.v1;
  if (!timestamp || !assinatura) return false;
  const pares = [
    input.dataId ? `id:${input.dataId.toLowerCase()};` : "",
    input.requestId ? `request-id:${input.requestId};` : "",
    `ts:${timestamp};`,
  ].join("");
  const esperada = createHmac("sha256", segredo).update(pares).digest("hex");
  const atual = Buffer.from(assinatura, "hex");
  const esperadaBuffer = Buffer.from(esperada, "hex");
  return atual.length === esperadaBuffer.length && timingSafeEqual(atual, esperadaBuffer);
}

export type { OrdemMercadoPago, OAuthToken };
