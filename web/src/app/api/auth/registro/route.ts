import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { queryPublico } from "@/lib/db";
import { buscarContexto } from "@/lib/auth-queries";
import { criarSessao, SESSION_COOKIE } from "@/lib/session";
import { gerarSlug } from "@/lib/slug";
import { MODULOS_DE_VENDA, SEGMENTOS, planoParaModulos } from "@/lib/tenant-types";
import type { ModuloSistema } from "@/lib/tenant-types";

const USUARIO_REGEX = /^[a-z0-9][a-z0-9._-]{2,39}$/;

interface CampoUsuario {
  nome?: string;
  usuario?: string;
  senha?: string;
}

function validarCampo(c: CampoUsuario | undefined): c is Required<CampoUsuario> {
  return Boolean(c?.nome?.trim() && c?.usuario && USUARIO_REGEX.test(c.usuario.toLowerCase()) && c?.senha && c.senha.length >= 6);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const tipo = body.tipo;
  const modulos: ModuloSistema[] = Array.isArray(body.modulos) ? body.modulos : [];
  const admin: CampoUsuario = body.admin ?? {};

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
    return NextResponse.json({ erro: "Dados do administrador inválidos. Use um usuário com 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado) e senha de 6 caracteres ou mais." }, { status: 400 });
  }

  const usuariosPayload = [
    { nome: admin.nome.trim(), usuario: admin.usuario!.trim().toLowerCase(), senha_hash: await bcrypt.hash(admin.senha!, 12), role: "admin" },
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
      return NextResponse.json({ erro: "Este usuário já está em uso." }, { status: 409 });
    }
    throw erro;
  }

  const contas = await queryPublico<{ usuario_id: string }>("select usuario_id from fn_autenticar($1)", [usuariosPayload[0].usuario]);
  const contexto = await buscarContexto(estabelecimentoId, contas[0].usuario_id);
  if (!contexto) {
    return NextResponse.json({ erro: "Estabelecimento criado, mas houve um erro ao carregar a sessão." }, { status: 500 });
  }

  const token = criarSessao({ usuarioId: contas[0].usuario_id, estabelecimentoId });
  const res = NextResponse.json(contexto, { status: 201 });
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE);
  return res;
}
