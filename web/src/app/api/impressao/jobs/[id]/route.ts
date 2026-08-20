import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";

const ACOES = ["reservar", "concluir", "falhar"] as const;
type Acao = (typeof ACOES)[number];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const acao = body?.acao as Acao | undefined;
  if (!acao || !ACOES.includes(acao)) return NextResponse.json({ erro: "Ação de impressão inválida." }, { status: 400 });

  const job = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    if (acao === "reservar") {
      const { rows } = await client.query(
        `update impressao_jobs
         set status = 'imprimindo', reservado_em = now(), tentativas = tentativas + 1, erro = null
         where id = $1 and status = 'pendente'
         returning id, status, tentativas`,
        [id]
      );
      return rows[0] ?? null;
    }

    if (acao === "concluir") {
      const { rows } = await client.query(
        `update impressao_jobs
         set status = 'impresso', impresso_em = now(), erro = null
         where id = $1 and status = 'imprimindo'
         returning id, status, impresso_em as "impressoEm"`,
        [id]
      );
      return rows[0] ?? null;
    }

    const erro = typeof body?.erro === "string" ? body.erro.slice(0, 500) : "Falha ao enviar para a impressora.";
    const { rows } = await client.query(
      `update impressao_jobs
       set status = case when tentativas >= 3 then 'falhou' else 'pendente' end,
           reservado_em = null,
           erro = $2
       where id = $1 and status = 'imprimindo'
       returning id, status, tentativas, erro`,
      [id, erro]
    );
    return rows[0] ?? null;
  });

  if (!job) return NextResponse.json({ erro: "Este trabalho não está disponível para essa ação." }, { status: 409 });
  return NextResponse.json(job);
}
