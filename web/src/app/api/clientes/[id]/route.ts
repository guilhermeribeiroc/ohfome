import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirClientes } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

function ler(body: unknown) {
  const dados = body as Record<string, unknown> | null;
  const texto = (chave: string) => typeof dados?.[chave] === "string" ? dados[chave].trim() : "";
  return { nome: texto("nome"), telefone: texto("telefone").replace(/\D/g, ""), endereco: texto("endereco"), bairro: texto("bairro"), pontoReferencia: texto("pontoReferencia"), email: texto("email"), notificarPedido: dados?.notificarPedido === true };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirClientes(sessao)) return respostaAcessoNegado();
  const cliente = ler(await request.json().catch(() => null));
  if (cliente.nome.length < 2) return NextResponse.json({ erro: "Informe o nome do cliente." }, { status: 400 });
  if (cliente.telefone.length < 8 || cliente.telefone.length > 15) return NextResponse.json({ erro: "Informe um telefone válido." }, { status: 400 });
  if (cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });
  const { id } = await params;
  try {
    const atualizado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: existentes } = await client.query(
        `select id from clientes
         where regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') = $1 and id <> $2 limit 1`,
        [cliente.telefone, id]
      );
      if (existentes[0]) throw Object.assign(new Error("Já existe um cliente com este telefone."), { status: 409 });
      const { rows } = await client.query(
        `update clientes set nome = $2, telefone = $3, endereco = $4, bairro = $5,
                ponto_referencia = $6, email = $7, notificar_pedido = $8
         where id = $1 returning id, nome, telefone, endereco, bairro,
                ponto_referencia as "pontoReferencia", email,
                notificar_pedido as "notificarPedido", created_at as "createdAt"`,
        [id, cliente.nome, cliente.telefone, cliente.endereco || null, cliente.bairro || null, cliente.pontoReferencia || null, cliente.email || null, cliente.notificarPedido]
      );
      return rows[0] ?? null;
    });
    if (!atualizado) return NextResponse.json({ erro: "Cliente não encontrado." }, { status: 404 });
    return NextResponse.json(atualizado);
  } catch (erroBanco) {
    if ((erroBanco as { status?: number }).status === 409) return NextResponse.json({ erro: (erroBanco as Error).message }, { status: 409 });
    if ((erroBanco as { code?: string }).code === "23505") return NextResponse.json({ erro: "Já existe um cliente com este telefone." }, { status: 409 });
    throw erroBanco;
  }
}
