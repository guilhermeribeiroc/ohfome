import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { respostaAdministradorObrigatorio, sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!(await sessaoEhAdministrador(sessao))) return respostaAdministradorObrigatorio();

  await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
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

  return NextResponse.json({ conectado: false, ativo: false, modo: "manual" });
}
