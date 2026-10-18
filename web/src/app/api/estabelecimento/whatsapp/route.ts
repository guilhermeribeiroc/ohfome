import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";
import { normalizarWhatsappBrasil } from "@/lib/whatsapp";

async function administradorDaRequisicao(request: NextRequest): Promise<SessionPayload | null> {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return null;
  const ehAdmin = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("select role from usuarios where id = $1 and ativo", [sessao.usuarioId]);
    return rows[0]?.role === "admin";
  });
  return ehAdmin ? sessao : null;
}

function semPermissao() {
  return NextResponse.json({ erro: "Apenas administradores podem alterar o WhatsApp." }, { status: 403 });
}

export async function GET(request: NextRequest) {
  if (!await autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await administradorDaRequisicao(request);
  if (!sessao) return semPermissao();
  const numero = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("select whatsapp_atendimento as \"whatsappAtendimento\" from estabelecimentos where id = $1", [sessao.estabelecimentoId]);
    return rows[0]?.whatsappAtendimento ?? null;
  });
  return NextResponse.json({ whatsappAtendimento: numero });
}

export async function PATCH(request: NextRequest) {
  if (!await autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await administradorDaRequisicao(request);
  if (!sessao) return semPermissao();
  const body = await request.json().catch(() => null);
  const informado = typeof body?.whatsappAtendimento === "string" ? body.whatsappAtendimento.trim() : "";
  let numero = "";
  if (informado) {
    const validado = normalizarWhatsappBrasil(informado);
    if (!validado.ok) return NextResponse.json({ erro: validado.erro }, { status: 400 });
    numero = validado.numero;
  }
  const salvo = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      "update estabelecimentos set whatsapp_atendimento = $2 where id = $1 returning whatsapp_atendimento as \"whatsappAtendimento\"",
      [sessao.estabelecimentoId, numero || null]
    );
    return rows[0]?.whatsappAtendimento ?? null;
  });
  return NextResponse.json({ whatsappAtendimento: salvo });
}
