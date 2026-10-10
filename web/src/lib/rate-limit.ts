import { createHash } from "crypto";
import { isIP } from "net";
import { queryPublico } from "@/lib/db";
import type { NextRequest } from "next/server";

const JANELA_SEGUNDOS = 60;
const LIMITE = 8;

/** Limitador atômico no PostgreSQL, compartilhado por todos os processos. */
export async function limitado(escopo: string, chave: string): Promise<boolean> {
  const chaveHash = createHash("sha256").update(chave).digest("hex");
  const rows = await queryPublico<{ permitido: boolean }>(
    "select fn_consumir_rate_limit($1, $2, $3, $4) as permitido",
    [escopo, chaveHash, LIMITE, JANELA_SEGUNDOS]
  );
  return rows[0]?.permitido !== true;
}

/**
 * X-Real-IP só entra na chave quando o operador explicitamente confia no
 * proxy da borda. Sem esse opt-in, o IP é ignorado (não confiamos em XFF,
 * que pode ser enviado pelo próprio cliente).
 */
export function ipClienteConfiavel(request: NextRequest): string | null {
  if (process.env.OHFOME_TRUST_X_REAL_IP !== "true") return null;
  const ip = request.headers.get("x-real-ip")?.trim();
  return ip && isIP(ip) ? ip : null;
}
