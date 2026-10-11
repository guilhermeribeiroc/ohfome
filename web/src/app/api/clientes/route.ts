import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeGerirClientes } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

function dadosCliente(body: unknown) {
  const dados = body as Record<string, unknown> | null;
  const texto = (chave: string) => typeof dados?.[chave] === "string" ? dados[chave].trim() : "";
  const nome = texto("nome");
  const telefone = texto("telefone").replace(/\D/g, "");
  const endereco = texto("endereco");
  const bairro = texto("bairro");
  const pontoReferencia = texto("pontoReferencia");
  const email = texto("email");
  const notificarPedido = dados?.notificarPedido === true;
  return { nome, telefone, endereco, bairro, pontoReferencia, email, notificarPedido };
}

function validarCliente(cliente: ReturnType<typeof dadosCliente>) {
  if (cliente.nome.length < 2) return "Informe o nome do cliente.";
  if (cliente.telefone.length < 8 || cliente.telefone.length > 15) return "Informe um telefone válido.";
  if (cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) return "Informe um e-mail válido.";
  return null;
}

const CAMPOS = `id, nome, telefone, endereco, bairro,
  ponto_referencia as "pontoReferencia", email,
  notificar_pedido as "notificarPedido", created_at as "createdAt"`;

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirClientes(sessao)) return respostaAcessoNegado();
  const termo = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const normalizado = termo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const clientes = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `select ${CAMPOS} from clientes
       where $1 = ''
          or regexp_replace(translate(lower(nome), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g') like $2
          or regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') like $2
       order by nome asc, created_at desc limit 100`,
      [normalizado, `%${normalizado}%`]
    );
    return rows;
  });
  return NextResponse.json(clientes);
}

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!sessaoPodeGerirClientes(sessao)) return respostaAcessoNegado();
  const cliente = dadosCliente(await request.json().catch(() => null));
  const erro = validarCliente(cliente);
  if (erro) return NextResponse.json({ erro }, { status: 400 });
  try {
    const criado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: existentes } = await client.query(
        `select id from clientes
         where regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') = $1 limit 1`,
        [cliente.telefone]
      );
      if (existentes[0]) throw Object.assign(new Error("Já existe um cliente com este telefone."), { status: 409 });
      const { rows } = await client.query(
        `insert into clientes (estabelecimento_id, nome, telefone, endereco, bairro, ponto_referencia, email, notificar_pedido)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${CAMPOS}`,
        [sessao.estabelecimentoId, cliente.nome, cliente.telefone, cliente.endereco || null, cliente.bairro || null, cliente.pontoReferencia || null, cliente.email || null, cliente.notificarPedido]
      );
      return rows[0];
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (erroBanco) {
    if ((erroBanco as { status?: number }).status === 409) return NextResponse.json({ erro: (erroBanco as Error).message }, { status: 409 });
    if ((erroBanco as { code?: string }).code === "23505") return NextResponse.json({ erro: "Já existe um cliente com este telefone." }, { status: 409 });
    throw erroBanco;
  }
}
