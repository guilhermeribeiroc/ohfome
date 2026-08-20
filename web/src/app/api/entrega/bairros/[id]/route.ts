import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { respostaAdministradorObrigatorio, sessaoEhAdministrador } from "@/lib/admin-auth";

async function autenticarAdministrador(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return { sessao: null, autorizado: false };
  return { sessao, autorizado: await sessaoEhAdministrador(sessao) };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { sessao, autorizado } = await autenticarAdministrador(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!autorizado) return respostaAdministradorObrigatorio();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : undefined;
  const taxa = body?.taxa === undefined ? undefined : Number(body.taxa);
  const ativo = typeof body?.ativo === "boolean" ? body.ativo : undefined;

  if (nome !== undefined && nome.length < 2) return NextResponse.json({ erro: "Informe um nome válido." }, { status: 400 });
  if (taxa !== undefined && (!Number.isFinite(taxa) || taxa < 0)) return NextResponse.json({ erro: "Informe uma taxa válida." }, { status: 400 });

  try {
    const bairro = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        `update bairros_entrega set nome = coalesce($1, nome), taxa = coalesce($2, taxa), ativo = coalesce($3, ativo)
         where id = $4
         returning id, nome, taxa, ativo`,
        [nome ?? null, taxa ?? null, ativo ?? null, id]
      );
      return rows[0] ?? null;
    });
    if (!bairro) return NextResponse.json({ erro: "Bairro não encontrado." }, { status: 404 });
    return NextResponse.json(bairro);
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return NextResponse.json({ erro: "Esse bairro já está cadastrado." }, { status: 409 });
    }
    throw erro;
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { sessao, autorizado } = await autenticarAdministrador(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!autorizado) return respostaAdministradorObrigatorio();

  const { id } = await params;
  const removido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rowCount } = await client.query("delete from bairros_entrega where id = $1", [id]);
    return (rowCount ?? 0) > 0;
  });

  if (!removido) return NextResponse.json({ erro: "Bairro não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
