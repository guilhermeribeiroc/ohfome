import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { queryPublico } from "@/lib/db";
import { buscarContexto } from "@/lib/auth-queries";
import { criarSessao, SESSION_COOKIE } from "@/lib/session";
import { gerarSlug } from "@/lib/slug";
import { MODULOS, MODULOS_DE_VENDA, SEGMENTOS, planoParaModulos } from "@/lib/tenant-types";
import type { ModuloSistema } from "@/lib/tenant-types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CampoUsuario {
  nome?: string;
  email?: string;
  senha?: string;
}

function validarCampo(c: CampoUsuario | undefined): c is Required<CampoUsuario> {
  return Boolean(c?.nome?.trim() && c?.email && EMAIL_REGEX.test(c.email) && c?.senha && c.senha.length >= 6);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const tipo = body.tipo;
  const modulos: ModuloSistema[] = Array.isArray(body.modulos) ? body.modulos : [];
  const admin: CampoUsuario = body.admin ?? {};
  const equipe: Record<string, CampoUsuario> = body.equipe ?? {};

  if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome do estabelecimento." }, { status: 400 });
  const segmento = SEGMENTOS.find((item) => item.id === tipo);
  if (!segmento) return NextResponse.json({ erro: "Tipo de estabelecimento inválido." }, { status: 400 });
  const tipoComida = segmento.exemploCardapio;
  if (!modulos.every((modulo) => MODULOS_DE_VENDA.includes(modulo)) || new Set(modulos).size !== modulos.length) return NextResponse.json({ erro: "Módulo inválido." }, { status: 400 });
  if (!planoParaModulos(modulos)) return NextResponse.json({ erro: "Selecione uma combinação válida: Balcão é obrigatório e Cozinha exige Garçom." }, { status: 400 });
  // Delivery é um recurso incluído no Cardápio Digital; não exige que o
  // cliente crie um segundo usuário nem escolha outro plano.
  const modulosAtivos: ModuloSistema[] = modulos.includes("site") ? [...modulos, "delivery"] : modulos;
  if (!validarCampo(admin)) {
    return NextResponse.json({ erro: "Dados do administrador incompletos (senha mín. 6 caracteres)." }, { status: 400 });
  }
  for (const m of modulos) {
    if (!validarCampo(equipe[m])) {
      return NextResponse.json({ erro: `Dados do usuário de ${MODULOS.find((i) => i.id === m)?.label} incompletos.` }, { status: 400 });
    }
  }

  const emails = [admin.email, ...modulos.map((m) => equipe[m].email)].map((e) => e!.toLowerCase());
  if (new Set(emails).size !== emails.length) {
    return NextResponse.json({ erro: "Os e-mails informados devem ser diferentes entre si." }, { status: 400 });
  }

  const usuariosPayload = [
    { nome: admin.nome, email: admin.email!.toLowerCase(), senha_hash: await bcrypt.hash(admin.senha!, 12), role: "admin" },
    ...(await Promise.all(
      modulos.map(async (m) => ({
        nome: equipe[m].nome,
        email: equipe[m].email!.toLowerCase(),
        senha_hash: await bcrypt.hash(equipe[m].senha!, 12),
        role: MODULOS.find((i) => i.id === m)!.papel,
      }))
    )),
  ];

  async function tentarRegistrar(tentativasRestantes: number): Promise<string> {
    try {
      const linhas = await queryPublico<{ fn_registrar_estabelecimento: string }>(
        "select fn_registrar_estabelecimento($1, $2, $3, $4, $5::jsonb, $6)",
        [nome, tipo, tipoComida, modulosAtivos, JSON.stringify(usuariosPayload), gerarSlug(nome)]
      );
      return linhas[0].fn_registrar_estabelecimento;
    } catch (erro) {
      const detalhes = erro as { code?: string; constraint?: string };
      if (detalhes.code === "23505" && detalhes.constraint === "uq_estabelecimentos_slug" && tentativasRestantes > 0) {
        return tentarRegistrar(tentativasRestantes - 1); // colisao improvavel de slug — tenta outro sufixo
      }
      throw erro;
    }
  }

  let estabelecimentoId: string;
  try {
    estabelecimentoId = await tentarRegistrar(1);
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return NextResponse.json({ erro: "Um dos e-mails informados já está em uso." }, { status: 409 });
    }
    throw erro;
  }

  const contas = await queryPublico<{ usuario_id: string }>("select usuario_id from fn_autenticar($1)", [usuariosPayload[0].email]);
  const contexto = await buscarContexto(estabelecimentoId, contas[0].usuario_id);
  if (!contexto) {
    return NextResponse.json({ erro: "Estabelecimento criado, mas houve um erro ao carregar a sessão." }, { status: 500 });
  }

  const token = criarSessao({ usuarioId: contas[0].usuario_id, estabelecimentoId });
  const res = NextResponse.json(contexto, { status: 201 });
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE);
  return res;
}
