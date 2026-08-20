import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import type { ModoBannerCardapio } from "@/lib/types";

async function sessaoAdmin(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return null;
  const permitido = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("select role from usuarios where id = $1 and ativo", [sessao.usuarioId]);
    return rows[0]?.role === "admin";
  });
  return permitido ? sessao : null;
}

function semPermissao() {
  return NextResponse.json({ erro: "Apenas administradores podem alterar o banner." }, { status: 403 });
}

export async function GET(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await sessaoAdmin(request);
  if (!sessao) return semPermissao();
  const dados = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const [estabelecimento, banners] = await Promise.all([
      client.query("select cardapio_banner_modo as \"modo\" from estabelecimentos where id = $1", [sessao.estabelecimentoId]),
      client.query("select id, url, ordem from banners_cardapio where estabelecimento_id = $1 and ativo order by ordem", [sessao.estabelecimentoId]),
    ]);
    return { modo: estabelecimento.rows[0]?.modo ?? "padrao", banners: banners.rows };
  });
  return NextResponse.json(dados);
}

export async function POST(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await sessaoAdmin(request);
  if (!sessao) return semPermissao();
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!/^\/api\/arquivos\/banners\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(url)) return NextResponse.json({ erro: "Envie uma imagem válida para o banner." }, { status: 400 });
  const banner = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const total = await client.query("select count(*)::int as total from banners_cardapio where estabelecimento_id = $1 and ativo", [sessao.estabelecimentoId]);
    if (total.rows[0].total >= 5) return null;
    const { rows } = await client.query(
      `insert into banners_cardapio (estabelecimento_id, url, ordem)
       values ($1, $2, $3)
       returning id, url, ordem`,
      [sessao.estabelecimentoId, url, total.rows[0].total]
    );
    return rows[0];
  });
  if (!banner) return NextResponse.json({ erro: "Você pode usar no máximo cinco imagens." }, { status: 400 });
  return NextResponse.json(banner, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await sessaoAdmin(request);
  if (!sessao) return semPermissao();
  const body = await request.json().catch(() => null);
  const modo = body?.modo as ModoBannerCardapio | undefined;
  if (modo !== "padrao" && modo !== "fixo" && modo !== "carrossel") return NextResponse.json({ erro: "Modo de banner inválido." }, { status: 400 });
  await comEstabelecimento(sessao.estabelecimentoId, (client) => client.query("update estabelecimentos set cardapio_banner_modo = $2 where id = $1", [sessao.estabelecimentoId, modo]));
  return NextResponse.json({ modo });
}
