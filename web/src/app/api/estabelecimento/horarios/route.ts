import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { respostaAdministradorObrigatorio, sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";

type Turno = { inicio: string; fim: string };
type Horarios = { pausado: boolean; mensagemPausa: string; turnos: Record<string, Turno[]> };

const padrao: Horarios = {
  pausado: false,
  mensagemPausa: "Não estamos recebendo pedidos no momento.",
  turnos: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] },
};

function normalizar(body: unknown): Horarios | null {
  if (!body || typeof body !== "object") return null;
  const dados = body as Partial<Horarios>;
  const mensagemPausa = typeof dados.mensagemPausa === "string" ? dados.mensagemPausa.trim() : "";
  if (mensagemPausa.length > 280) return null;
  const turnos: Record<string, Turno[]> = {};
  for (let dia = 0; dia < 7; dia++) {
    const lista = Array.isArray(dados.turnos?.[String(dia)]) ? dados.turnos![String(dia)] : [];
    if (lista.length > 4) return null;
    const normalizados: Turno[] = [];
    for (const turno of lista) {
      if (!turno || typeof turno.inicio !== "string" || typeof turno.fim !== "string" || !/^\d{2}:\d{2}$/.test(turno.inicio) || !/^\d{2}:\d{2}$/.test(turno.fim) || turno.inicio >= turno.fim) return null;
      normalizados.push({ inicio: turno.inicio, fim: turno.fim });
    }
    normalizados.sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (normalizados.some((turno, index) => index > 0 && turno.inicio < normalizados[index - 1].fim)) return null;
    turnos[String(dia)] = normalizados;
  }
  return { pausado: dados.pausado === true, mensagemPausa: mensagemPausa || padrao.mensagemPausa, turnos };
}

async function admin(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return null;
  return (await sessaoEhAdministrador(sessao)) ? sessao : null;
}

export async function GET(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await admin(request);
  if (!sessao) return respostaAdministradorObrigatorio();
  const valor = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query<{ valor: Horarios }>("select valor from estado_aplicacao where estabelecimento_id = $1 and chave = 'horario_funcionamento'", [sessao.estabelecimentoId]);
    return rows[0]?.valor ?? padrao;
  });
  return NextResponse.json(normalizar(valor) ?? padrao);
}

export async function PATCH(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await admin(request);
  if (!sessao) return respostaAdministradorObrigatorio();
  const dados = normalizar(await request.json().catch(() => null));
  if (!dados) return NextResponse.json({ erro: "Revise os horários. Use início e fim válidos, sem turnos sobrepostos." }, { status: 400 });
  await comEstabelecimento(sessao.estabelecimentoId, (client) => client.query(
    `insert into estado_aplicacao (estabelecimento_id, chave, valor)
     values ($1, 'horario_funcionamento', $2::jsonb)
     on conflict (estabelecimento_id, chave) do update set valor = excluded.valor, updated_at = now()`,
    [sessao.estabelecimentoId, JSON.stringify(dados)]
  ));
  return NextResponse.json(dados);
}
