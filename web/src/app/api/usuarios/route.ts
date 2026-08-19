import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { respostaNaoAutenticado, autenticarRequisicao } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { MODULOS } from "@/lib/tenant-types";
import type { PapelUsuario } from "@/lib/tenant-types";

const USUARIO_REGEX = /^[a-z0-9][a-z0-9._-]{2,39}$/;

async function autenticarAdmin(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return null;

  const admin = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query<{ role: PapelUsuario }>("select role from usuarios where id = $1 and ativo", [sessao.usuarioId]);
    return rows[0]?.role === "admin";
  });
  return admin ? sessao : null;
}

async function papeisDisponiveis(estabelecimentoId: string) {
  return comEstabelecimento(estabelecimentoId, async (client) => {
    const { rows } = await client.query<{ modulo: string }>("select modulo from estabelecimento_modulos");
    const modulosAtivos = new Set(rows.map((row) => row.modulo));
    return MODULOS.filter((modulo) => modulosAtivos.has(modulo.id)).map((modulo) => modulo.papel);
  });
}

export async function GET(request: NextRequest) {
  const sessao = await autenticarAdmin(request);
  if (!sessao) return respostaNaoAutenticado();

  const usuarios = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select id, nome, usuario, role, ativo, created_at as "createdAt"
       from usuarios
       order by case when role = 'admin' then 0 else 1 end, nome`
    );
    return rows;
  });

  return NextResponse.json(usuarios);
}

export async function POST(request: NextRequest) {
  const sessao = await autenticarAdmin(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const usuario = typeof body?.usuario === "string" ? body.usuario.trim().toLowerCase() : "";
  const senha = typeof body?.senha === "string" ? body.senha : "";
  const role = body?.role as PapelUsuario | undefined;
  const papeis = await papeisDisponiveis(sessao.estabelecimentoId);

  if (nome.length < 2 || !USUARIO_REGEX.test(usuario) || senha.length < 6 || !role || !papeis.includes(role)) {
    return NextResponse.json({ erro: "Preencha nome, usuário válido, senha com ao menos 6 caracteres e um cargo permitido." }, { status: 400 });
  }

  try {
    const usuarioCriado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        `insert into usuarios (estabelecimento_id, nome, usuario, senha_hash, role)
         values ($1, $2, $3, $4, $5)
         returning id, nome, usuario, role, ativo, created_at as "createdAt"`,
        [sessao.estabelecimentoId, nome, usuario, await bcrypt.hash(senha, 12), role]
      );
      return rows[0];
    });
    return NextResponse.json(usuarioCriado, { status: 201 });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return NextResponse.json({ erro: "Este usuário já está em uso." }, { status: 409 });
    }
    throw erro;
  }
}
