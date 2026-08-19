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

export async function PATCH(request: NextRequest, context: RouteContext<"/api/usuarios/[id]">) {
  const sessao = await autenticarAdmin(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : undefined;
  const usuario = typeof body?.usuario === "string" ? body.usuario.trim().toLowerCase() : undefined;
  const senha = typeof body?.senha === "string" ? body.senha : undefined;
  const role = typeof body?.role === "string" ? body.role as PapelUsuario : undefined;
  const ativo = typeof body?.ativo === "boolean" ? body.ativo : undefined;

  if (nome !== undefined && nome.length < 2) return NextResponse.json({ erro: "Informe um nome válido." }, { status: 400 });
  if (usuario !== undefined && !USUARIO_REGEX.test(usuario)) return NextResponse.json({ erro: "Usuário inválido." }, { status: 400 });
  if (senha !== undefined && senha.length < 6) return NextResponse.json({ erro: "A senha precisa ter ao menos 6 caracteres." }, { status: 400 });

  try {
    const resultado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: encontrados } = await client.query<{ id: string; role: PapelUsuario; ativo: boolean }>("select id, role, ativo from usuarios where id = $1", [id]);
      const alvo = encontrados[0];
      if (!alvo) throw Object.assign(new Error("Usuário não encontrado."), { status: 404 });

      const { rows: modulosRows } = await client.query<{ modulo: string }>("select modulo from estabelecimento_modulos");
      const papeis = MODULOS.filter((modulo) => modulosRows.some((row) => row.modulo === modulo.id)).map((modulo) => modulo.papel);
      if (role && (alvo.role === "admin" || !papeis.includes(role))) throw Object.assign(new Error("Cargo inválido para este usuário."), { status: 400 });

      if (alvo.role === "admin" && ativo === false) {
        const { rows: admins } = await client.query<{ total: number }>("select count(*)::int as total from usuarios where role = 'admin' and ativo");
        if ((admins[0]?.total ?? 0) <= 1) throw Object.assign(new Error("Não é possível desativar o último administrador ativo."), { status: 400 });
      }

      const { rows } = await client.query(
        `update usuarios
         set nome = coalesce($1, nome), usuario = coalesce($2, usuario), senha_hash = coalesce($3, senha_hash), role = coalesce($4::user_role, role), ativo = coalesce($5, ativo)
         where id = $6
         returning id, nome, usuario, role, ativo, created_at as "createdAt"`,
        [nome ?? null, usuario ?? null, senha ? await bcrypt.hash(senha, 12) : null, role ?? null, ativo ?? null, id]
      );
      return rows[0];
    });
    return NextResponse.json(resultado);
  } catch (erro) {
    const status = (erro as { status?: number }).status;
    if (status) return NextResponse.json({ erro: (erro as Error).message }, { status });
    if ((erro as { code?: string }).code === "23505") return NextResponse.json({ erro: "Este usuário já está em uso." }, { status: 409 });
    throw erro;
  }
}
