import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/session";
import { comEstabelecimento } from "@/lib/db";

/** Confere o cargo no banco, para que uma sessão antiga não mantenha privilégios revogados. */
export async function sessaoEhAdministrador(sessao: SessionPayload) {
  return comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query<{ role: string }>(
      "select role from usuarios where id = $1 and ativo",
      [sessao.usuarioId]
    );
    return rows[0]?.role === "admin";
  });
}

export function respostaAdministradorObrigatorio() {
  return NextResponse.json(
    { erro: "Apenas administradores podem configurar taxas de entrega." },
    { status: 403 }
  );
}
