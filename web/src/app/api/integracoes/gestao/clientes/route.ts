import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { queryPublico } from "@/lib/db";

// Integração server-to-server (não é sessão de usuário): autentica por
// Authorization: Bearer <OHFOME_GESTAO_SYNC_SECRET>, comparado em tempo
// constante pra não vazar o segredo por diferença de tempo de resposta.
// Sem a env var configurada, TODA requisição é recusada (fail closed).
function autenticado(request: NextRequest): boolean {
  const segredo = process.env.OHFOME_GESTAO_SYNC_SECRET;
  if (!segredo) return false;

  const cabecalho = request.headers.get("authorization") ?? "";
  const [esquema, token] = cabecalho.split(" ");
  if (esquema !== "Bearer" || !token) return false;

  const hashEsperado = createHash("sha256").update(segredo).digest();
  const hashRecebido = createHash("sha256").update(token).digest();
  return timingSafeEqual(hashEsperado, hashRecebido);
}

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

interface ClienteAdminRow {
  id: string;
  estabelecimento_id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  created_at: string;
  updated_at: string;
}

function codificarCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

function decodificarCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

// GET /api/integracoes/gestao/clientes — somente leitura. O "cliente" do
// sistema de gestão é o administrador ativo de cada estabelecimento (no
// máximo um por estabelecimento_id: o primeiro cadastrado). Nunca retorna
// senha_hash, tokens ou qualquer outro campo sensível.
export async function GET(request: NextRequest) {
  if (!autenticado(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  const limiteInformado = Number(params.get("limit"));
  const limit = Number.isInteger(limiteInformado) && limiteInformado > 0
    ? Math.min(limiteInformado, LIMITE_MAXIMO)
    : LIMITE_PADRAO;

  const cursorParam = params.get("cursor");
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (cursorParam) {
    const decodificado = decodificarCursor(cursorParam);
    if (!decodificado) {
      return NextResponse.json({ erro: "Cursor inválido." }, { status: 400 });
    }
    cursorCreatedAt = decodificado.createdAt;
    cursorId = decodificado.id;
  }

  const linhas = await queryPublico<ClienteAdminRow>(
    "select * from fn_integracao_gestao_clientes($1, $2, $3)",
    [limit, cursorCreatedAt, cursorId]
  );

  const data = linhas.map((linha) => ({
    externalId: linha.id,
    estabelecimentoId: linha.estabelecimento_id,
    nome: linha.nome,
    email: linha.email ?? null,
    telefone: linha.telefone ?? null,
    status: "ATIVO" as const,
    createdAt: new Date(linha.created_at).toISOString(),
    updatedAt: new Date(linha.updated_at).toISOString(),
  }));

  const ultimaLinha = linhas[linhas.length - 1];
  const nextCursor = linhas.length === limit && ultimaLinha
    ? codificarCursor(ultimaLinha.created_at, ultimaLinha.id)
    : null;

  return NextResponse.json({ data, nextCursor });
}
