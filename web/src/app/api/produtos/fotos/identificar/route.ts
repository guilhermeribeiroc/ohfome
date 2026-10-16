import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirEstoque } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { identificarFotosProdutos, type CandidatoFoto } from "@/lib/identificar-fotos";
import { mediaTypeAceito, mediaTypePelosBytes } from "@/lib/importar-cardapio";

export const runtime = "nodejs";

const MAXIMO_FOTOS = 8;
const LIMITE_FOTO_BYTES = 4 * 1024 * 1024;

// Sugere a qual produto (ou sabor de pizza) cada foto pertence. O navegador já reduz as fotos.
export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirEstoque(sessao)) return respostaAcessoNegado();

  const dados = await request.formData().catch(() => null);
  const arquivos = (dados?.getAll("arquivo") ?? []).filter((item): item is File => item instanceof File);
  if (!arquivos.length) return NextResponse.json({ erro: "Envie ao menos uma foto." }, { status: 400 });
  if (arquivos.length > MAXIMO_FOTOS) return NextResponse.json({ erro: `Envie no máximo ${MAXIMO_FOTOS} fotos por vez.` }, { status: 400 });

  const imagens: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }[] = [];
  for (const arquivo of arquivos) {
    const mediaType = mediaTypeAceito(arquivo.type);
    if (!mediaType || arquivo.size > LIMITE_FOTO_BYTES) return NextResponse.json({ erro: "Use fotos JPG, PNG ou WebP de até 4 MB." }, { status: 400 });
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (mediaTypePelosBytes(bytes) !== mediaType) return NextResponse.json({ erro: "Uma das fotos não é uma imagem válida." }, { status: 400 });
    imagens.push({ base64: bytes.toString("base64"), mediaType });
  }

  const candidatos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query<{ id: string; nome: string; descricao: string | null; categoria: string; tipo: string; sabores: { id: string; nome: string; descricao: string | null }[] | null }>(
      `select p.id, p.nome, p.descricao, coalesce(c.nome, 'Geral') as categoria, p.tipo_produto as tipo,
         (select json_agg(json_build_object('id', ps.id, 'nome', ps.nome, 'descricao', ps.descricao) order by ps.ordem) from pizza_sabores ps where ps.produto_id = p.id and ps.ativo) as sabores
       from produtos p left join categorias_produto c on c.id = p.categoria_id
       where p.estabelecimento_id = $1 and p.ativo order by c.ordem_exibicao, p.nome`,
      [sessao.estabelecimentoId]
    );
    const lista: CandidatoFoto[] = [];
    for (const produto of rows) {
      if (produto.tipo === "pizza" && produto.sabores?.length) {
        for (const sabor of produto.sabores) lista.push({ id: `s:${sabor.id}`, nome: `${produto.nome} ${sabor.nome}`, categoria: produto.categoria, descricao: sabor.descricao ?? "" });
      } else {
        lista.push({ id: `p:${produto.id}`, nome: produto.nome, categoria: produto.categoria, descricao: produto.descricao ?? "" });
      }
    }
    return lista;
  });
  if (!candidatos.length) return NextResponse.json({ erro: "Cadastre produtos antes de identificar fotos." }, { status: 400 });

  try {
    const resultados = await identificarFotosProdutos(imagens, candidatos);
    return NextResponse.json({ resultados });
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Não foi possível identificar as fotos." }, { status: 502 });
  }
}
