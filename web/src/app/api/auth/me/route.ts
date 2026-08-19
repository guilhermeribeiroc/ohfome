import { NextResponse, type NextRequest } from "next/server";
import { buscarContexto } from "@/lib/auth-queries";
import { SESSION_COOKIE, verificarSessao } from "@/lib/session";

export async function GET(request: NextRequest) {
  const sessao = verificarSessao(request.cookies.get(SESSION_COOKIE.name)?.value);
  if (!sessao) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const contexto = await buscarContexto(sessao.estabelecimentoId, sessao.usuarioId);
  if (!contexto) {
    const res = NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });
    res.cookies.delete(SESSION_COOKIE.name);
    return res;
  }

  return NextResponse.json(contexto);
}
