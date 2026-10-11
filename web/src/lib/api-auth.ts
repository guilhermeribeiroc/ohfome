import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verificarSessao, type SessionPayload } from "./session";
import { buscarContexto } from "./auth-queries";
import type { ModuloSistema, PapelUsuario } from "./tenant-types";

export type SessaoAutenticada = SessionPayload & {
  role: PapelUsuario;
  modulosAtivos: ModuloSistema[];
};

/** Confere a assinatura e revalida usuário/estabelecimento no banco em cada request. */
export async function autenticarRequisicao(request: NextRequest): Promise<SessaoAutenticada | null> {
  const sessao = verificarSessao(request.cookies.get(SESSION_COOKIE.name)?.value);
  if (!sessao) return null;

  try {
    const contexto = await buscarContexto(sessao.estabelecimentoId, sessao.usuarioId);
    if (!contexto) return null;
    return {
      ...sessao,
      role: contexto.usuario.role,
      modulosAtivos: contexto.estabelecimento.modulosAtivos,
    };
  } catch (erro) {
    // Falha fechada: indisponibilidade do banco nunca transforma uma sessão
    // antiga em autorização válida.
    console.error("Falha ao revalidar sessão", erro);
    return null;
  }
}

export function sessaoPodeGerirEstoque(sessao: SessaoAutenticada): boolean {
  return sessao.role === "admin" || (sessao.role === "estoque" && sessao.modulosAtivos.includes("estoque"));
}

export function sessaoPodeAcessarModulo(sessao: SessaoAutenticada, modulo: ModuloSistema): boolean {
  return sessao.role === "admin" || (sessao.role === modulo && sessao.modulosAtivos.includes(modulo));
}

export function sessaoPodeGerirClientes(sessao: SessaoAutenticada): boolean {
  return sessao.role === "admin" || sessao.role === "balcao" || sessao.role === "delivery";
}

export function respostaAcessoNegado() {
  return NextResponse.json({ erro: "Você não tem permissão para esta operação." }, { status: 403 });
}

export function respostaNaoAutenticado() {
  return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
}
