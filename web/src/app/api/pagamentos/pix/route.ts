import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { respostaAdministradorObrigatorio, sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";

async function sessaoAdmin(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return null;
  return await sessaoEhAdministrador(sessao) ? sessao : null;
}

export async function GET(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await sessaoAdmin(request);
  if (!sessao) return respostaAdministradorObrigatorio();

  const configuracao = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query<{
      ativo: boolean;
      modo: "manual" | "mercado_pago";
      chaveManual: string | null;
      instrucaoManual: string | null;
      expiracaoMinutos: number;
      collectorId: string | null;
      conectadoEm: Date | null;
    }>(`select coalesce(cp.ativo, false) as ativo, coalesce(cp.modo, 'manual') as modo,
          cp.chave_manual as "chaveManual", cp.instrucao_manual as "instrucaoManual",
          coalesce(cp.expiracao_minutos, 30) as "expiracaoMinutos",
          mp.collector_id as "collectorId", mp.conectado_em as "conectadoEm"
        from estabelecimentos e
        left join configuracoes_pix cp on cp.estabelecimento_id = e.id
        left join mercado_pago_conexoes mp on mp.estabelecimento_id = e.id
        where e.id = $1`, [sessao.estabelecimentoId]);
    return rows[0];
  });
  return NextResponse.json({ ...configuracao, mercadoPagoConectado: Boolean(configuracao?.collectorId) });
}

export async function PATCH(request: NextRequest) {
  if (!autenticarRequisicao(request)) return respostaNaoAutenticado();
  const sessao = await sessaoAdmin(request);
  if (!sessao) return respostaAdministradorObrigatorio();
  const body = await request.json().catch(() => null);
  const modo = body?.modo === "mercado_pago" ? "mercado_pago" : body?.modo === "manual" ? "manual" : null;
  const ativo = body?.ativo === true;
  const chaveManual = typeof body?.chaveManual === "string" ? body.chaveManual.trim() : "";
  const instrucaoManual = typeof body?.instrucaoManual === "string" ? body.instrucaoManual.trim() : "";
  const expiracaoMinutos = 30;

  if (!modo) return NextResponse.json({ erro: "Escolha o modo Pix." }, { status: 400 });
  if (chaveManual.length > 200 || instrucaoManual.length > 500) {
    return NextResponse.json({ erro: "A chave ou instrução Pix é longa demais." }, { status: 400 });
  }

  try {
    const configuracao = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      if (ativo && modo === "mercado_pago") {
        const { rows } = await client.query("select 1 from mercado_pago_conexoes where estabelecimento_id = $1", [sessao.estabelecimentoId]);
        if (!rows[0]) throw Object.assign(new Error("Conecte uma conta Mercado Pago antes de ativar Pix automático."), { status: 409 });
      }
      const { rows } = await client.query(`insert into configuracoes_pix
        (estabelecimento_id, ativo, modo, chave_manual, instrucao_manual, expiracao_minutos)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (estabelecimento_id) do update set ativo = excluded.ativo, modo = excluded.modo,
          chave_manual = excluded.chave_manual, instrucao_manual = excluded.instrucao_manual,
          expiracao_minutos = excluded.expiracao_minutos
        returning ativo, modo, chave_manual as "chaveManual", instrucao_manual as "instrucaoManual", expiracao_minutos as "expiracaoMinutos"`,
        [sessao.estabelecimentoId, ativo, modo, chaveManual || null, instrucaoManual || null, expiracaoMinutos]);
      return rows[0];
    });
    return NextResponse.json(configuracao);
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? 500;
    return NextResponse.json({ erro: status === 500 ? "Não foi possível salvar a configuração Pix." : (erro as Error).message }, { status });
  }
}
