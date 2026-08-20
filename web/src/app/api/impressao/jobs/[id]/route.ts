import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const ACOES = ["reservar", "heartbeat", "concluir", "falhar"] as const;
type Acao = (typeof ACOES)[number];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const acao = body?.acao as Acao | undefined;
  if (!acao || !ACOES.includes(acao)) return NextResponse.json({ erro: "Ação de impressão inválida." }, { status: 400 });
  const estacaoId = typeof body?.estacaoId === "string" ? body.estacaoId.slice(0, 120) : "";
  const tokenReserva = typeof body?.tokenReserva === "string" ? body.tokenReserva : "";

  const job = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    if (acao === "reservar") {
      if (!estacaoId) return null;
      const { rows } = await client.query(
        `update impressao_jobs
         set status = 'imprimindo', reservado_em = now(), ultimo_heartbeat_em = now(),
             estacao_id = $2, token_reserva = gen_random_uuid(), tentativas = tentativas + 1, erro = null
         where id = $1 and status = 'pendente'
         returning id, status, tentativas, token_reserva as "tokenReserva"`,
        [id, estacaoId]
      );
      return rows[0] ?? null;
    }

    if (!estacaoId || !tokenReserva) return null;

    if (acao === "heartbeat") {
      const { rows } = await client.query(
        `update impressao_jobs
         set ultimo_heartbeat_em = now()
         where id = $1 and status = 'imprimindo' and estacao_id = $2 and token_reserva = $3::uuid
         returning id, status, ultimo_heartbeat_em as "ultimoHeartbeatEm"`,
        [id, estacaoId, tokenReserva]
      );
      return rows[0] ?? null;
    }

    if (acao === "concluir") {
      const { rows } = await client.query(
        `update impressao_jobs
         set status = 'impresso', impresso_em = now(), concluido_em = now(), erro = null
         where id = $1 and status = 'imprimindo' and estacao_id = $2 and token_reserva = $3::uuid
         returning id, status, impresso_em as "impressoEm"`,
        [id, estacaoId, tokenReserva]
      );
      return rows[0] ?? null;
    }

    const erro = typeof body?.erro === "string" ? body.erro.slice(0, 500) : "Falha ao enviar para a impressora.";
    const { rows } = await client.query(
      `update impressao_jobs
       set status = case when tentativas >= 3 then 'falhou' else 'pendente' end,
           reservado_em = null,
           estacao_id = null,
           token_reserva = null,
           ultimo_heartbeat_em = null,
           erro = $2
       where id = $1 and status = 'imprimindo' and estacao_id = $3 and token_reserva = $4::uuid
       returning id, status, tentativas, erro`,
      [id, erro, estacaoId, tokenReserva]
    );
    return rows[0] ?? null;
  });

  if (!job) return NextResponse.json({ erro: "Este trabalho não está disponível para essa ação." }, { status: 409 });
  return NextResponse.json(job);
}
