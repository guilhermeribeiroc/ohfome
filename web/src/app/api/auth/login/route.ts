import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { queryPublico } from "@/lib/db";
import { buscarContexto } from "@/lib/auth-queries";
import { criarSessao, SESSION_COOKIE } from "@/lib/session";
import { limitado } from "@/lib/rate-limit";

// Hash valido de uma senha que ninguem tem, usado so para gastar o mesmo
// tempo de CPU quando o e-mail nao existe — evita que o tempo de resposta
// revele se uma conta existe ou nao.
const HASH_FANTASMA = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8i9wLZbW3iQZzXP.J5OZ6Z3ZzQwK2G";

interface AutenticarRow {
  usuario_id: string;
  estabelecimento_id: string;
  senha_hash: string;
  usuario_ativo: boolean;
  estabelecimento_ativo: boolean;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const senha = typeof body?.senha === "string" ? body.senha : "";

  if (limitado(`login:${ip}:${email}`)) {
    return NextResponse.json({ erro: "Muitas tentativas. Aguarde um minuto e tente novamente." }, { status: 429 });
  }

  if (!email || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  const linhas = await queryPublico<AutenticarRow>("select * from fn_autenticar($1)", [email]);
  const conta = linhas[0];

  const senhaConfere = await bcrypt.compare(senha, conta?.senha_hash ?? HASH_FANTASMA);
  if (!conta || !senhaConfere) {
    return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
  }

  if (!conta.usuario_ativo || !conta.estabelecimento_ativo) {
    return NextResponse.json({ erro: "Esta conta está desativada." }, { status: 403 });
  }

  const contexto = await buscarContexto(conta.estabelecimento_id, conta.usuario_id);
  if (!contexto) {
    return NextResponse.json({ erro: "Não foi possível carregar o estabelecimento." }, { status: 500 });
  }

  const token = criarSessao({ usuarioId: conta.usuario_id, estabelecimentoId: conta.estabelecimento_id });
  const res = NextResponse.json(contexto);
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE);
  return res;
}
