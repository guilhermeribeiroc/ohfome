import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

async function sessaoAdmin(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return null;
  const permitido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("select role from usuarios where id = $1 and ativo", [sessao.usuarioId]);
    return rows[0]?.role === "admin";
  });
  return permitido ? sessao : null;
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await sessaoAdmin(request);
  if (!sessao) return NextResponse.json({ erro: "Apenas administradores podem alterar o banner." }, { status: 403 });
  const { id } = await params;
  const removido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("delete from banners_cardapio where id = $1 and estabelecimento_id = $2 returning id", [id, sessao.estabelecimentoId]);
    await client.query("update banners_cardapio set ordem = ordem + 10 where estabelecimento_id = $1 and ativo", [sessao.estabelecimentoId]);
    await client.query(
      `with ordenados as (
        select id, (row_number() over (order by ordem) - 1)::smallint as nova_ordem
        from banners_cardapio where estabelecimento_id = $1 and ativo
      ) update banners_cardapio b set ordem = ordenados.nova_ordem from ordenados where b.id = ordenados.id`,
      [sessao.estabelecimentoId]
    );
    return rows[0] ?? null;
  });
  if (!removido) return NextResponse.json({ erro: "Banner não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await sessaoAdmin(request);
  if (!sessao) return NextResponse.json({ erro: "Apenas administradores podem alterar o banner." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (typeof body?.enquadramento === "string") {
    const enquadramento = body.enquadramento;
    if (!["topo", "centro", "base"].includes(enquadramento)) {
      return NextResponse.json({ erro: "Enquadramento inválido." }, { status: 400 });
    }
    const banner = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(
        "update banners_cardapio set enquadramento = $1 where id = $2 and estabelecimento_id = $3 returning id, url, ordem, enquadramento",
        [enquadramento, id, sessao.estabelecimentoId]
      );
      return rows[0] ?? null;
    });
    if (!banner) return NextResponse.json({ erro: "Banner não encontrado." }, { status: 404 });
    return NextResponse.json(banner);
  }

  const ordem = Number(body?.ordem);
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 4) return NextResponse.json({ erro: "Posição inválida." }, { status: 400 });
  const banner = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const atual = await client.query("select id, ordem from banners_cardapio where id = $1 and estabelecimento_id = $2 and ativo", [id, sessao.estabelecimentoId]);
    if (!atual.rows[0]) return null;
    const todos = await client.query("select id from banners_cardapio where estabelecimento_id = $1 and ativo order by ordem", [sessao.estabelecimentoId]);
    const ids = todos.rows.map((linha) => linha.id as string).filter((item) => item !== id);
    ids.splice(Math.min(ordem, ids.length), 0, id);
    await client.query("update banners_cardapio set ordem = ordem + 10 where estabelecimento_id = $1 and ativo", [sessao.estabelecimentoId]);
    for (const [indice, bannerId] of ids.entries()) await client.query("update banners_cardapio set ordem = $1 where id = $2", [indice, bannerId]);
    const { rows } = await client.query("select id, url, ordem, enquadramento from banners_cardapio where id = $1", [id]);
    return rows[0];
  });
  if (!banner) return NextResponse.json({ erro: "Banner não encontrado." }, { status: 404 });
  return NextResponse.json(banner);
}
