import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { respostaAdministradorObrigatorio, sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!(await sessaoEhAdministrador(sessao))) return respostaAdministradorObrigatorio();

  try {
    await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows: conexoes } = await client.query<{ ambiente: "producao" | "teste" }>(
        "select ambiente from mercado_pago_conexoes where estabelecimento_id = $1 for update",
        [sessao.estabelecimentoId],
      );
      if (conexoes[0]?.ambiente === "teste") {
        throw Object.assign(new Error("A credencial de teste da demonstração é gerenciada com segurança e não pode ser desconectada por aqui."), { status: 409 });
      }
      // Evita que o cardápio continue oferecendo um Pix automático sem uma
      // conta receptora vinculada.
      await client.query(
        `update configuracoes_pix
           set ativo = false, modo = 'manual'
         where estabelecimento_id = $1`,
        [sessao.estabelecimentoId],
      );
      await client.query(
        "delete from mercado_pago_conexoes where estabelecimento_id = $1",
        [sessao.estabelecimentoId],
      );
    });
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? 500;
    return NextResponse.json({ erro: status === 500 ? "Não foi possível desconectar o Mercado Pago." : (erro as Error).message }, { status });
  }

  return NextResponse.json({ conectado: false, ativo: false, modo: "manual" });
}
