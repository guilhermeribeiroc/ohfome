import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verificarSessao, type SessionPayload } from "./session";

export function autenticarRequisicao(request: NextRequest): SessionPayload | null {
  return verificarSessao(request.cookies.get(SESSION_COOKIE.name)?.value);
}

export function respostaNaoAutenticado() {
  return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
}
