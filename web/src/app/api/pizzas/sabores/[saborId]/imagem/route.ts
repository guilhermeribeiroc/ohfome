import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

// Define (ou remove) a foto de UM sabor de pizza, sem regravar a pizza inteira.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ saborId: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();
  const { saborId } = await params;
  const body = await request.json().catch(() => null);
  const imagemUrl = body?.imagemUrl === null ? null : typeof body?.imagemUrl === "string" && body.imagemUrl.startsWith("/api/arquivos/") ? body.imagemUrl : undefined;
  if (imagemUrl === undefined) return NextResponse.json({ erro: "Imagem inválida." }, { status: 400 });
  const linha = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(`update pizza_sabores set imagem_url = $2 where id = $1 and estabelecimento_id = $3 returning id, imagem_url as "imagemUrl"`, [saborId, imagemUrl, sessao.estabelecimentoId]);
    return rows[0] ?? null;
  });
  if (!linha) return NextResponse.json({ erro: "Sabor não encontrado." }, { status: 404 });
  return NextResponse.json(linha);
}
