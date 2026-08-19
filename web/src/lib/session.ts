import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "ohfome_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

export interface SessionPayload {
  usuarioId: string;
  estabelecimentoId: string;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET ausente ou fraco (min. 32 caracteres). Defina em web/.env.local."
    );
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function criarSessao(payload: Omit<SessionPayload, "iat">): string {
  const dados: SessionPayload = { ...payload, iat: Date.now() };
  const corpo = Buffer.from(JSON.stringify(dados)).toString("base64url");
  const assinatura = sign(corpo);
  return `${corpo}.${assinatura}`;
}

export function verificarSessao(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;

  const esperada = sign(corpo);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const dados = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as SessionPayload;
    if (Date.now() - dados.iat > MAX_AGE_SECONDS * 1000) return null;
    return dados;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SECONDS,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
