import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";

async function administradorDaRequisicao(request: NextRequest): Promise<SessionPayload | null> {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return null;

  const ehAdmin = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("select role from usuarios where id = $1 and ativo", [sessao.usuarioId]);
    return rows[0]?.role === "admin";
  });
  return ehAdmin ? sessao : null;
}

function respostaSemPermissao() {
  return NextResponse.json({ erro: "Apenas administradores podem alterar a logo." }, { status: 403 });
}

export async function GET(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await administradorDaRequisicao(request);
  if (!sessao) return respostaSemPermissao();

  const logo = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("select logo_url as \"logoUrl\" from estabelecimentos where id = $1", [sessao.estabelecimentoId]);
    return rows[0]?.logoUrl ?? null;
  });
  return NextResponse.json({ logoUrl: logo });
}

export async function PATCH(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await administradorDaRequisicao(request);
  if (!sessao) return respostaSemPermissao();

  const body = await request.json().catch(() => null);
  const logoUrl = typeof body?.logoUrl === "string" ? body.logoUrl.trim() : "";
  if (logoUrl && (logoUrl.length > 1000 || !/^(\/uploads\/logos\/|https?:\/\/)/.test(logoUrl))) {
    return NextResponse.json({ erro: "Use uma URL válida ou envie o arquivo da logo." }, { status: 400 });
  }

  const logo = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      "update estabelecimentos set logo_url = $2 where id = $1 returning logo_url as \"logoUrl\"",
      [sessao.estabelecimentoId, logoUrl || null]
    );
    return rows[0]?.logoUrl ?? null;
  });
  return NextResponse.json({ logoUrl: logo });
}
