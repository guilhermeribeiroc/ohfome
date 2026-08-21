import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { respostaAdministradorObrigatorio, sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";
import { criarVerifierPkce, urlAutorizacaoMercadoPago, MercadoPagoErro } from "@/lib/mercado-pago";

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (!await sessaoEhAdministrador(sessao)) return respostaAdministradorObrigatorio();

  try {
    const state = randomUUID();
    const verifier = criarVerifierPkce();
    await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      await client.query("delete from mercado_pago_oauth_states where expira_em < now() or usuario_id = $1", [sessao.usuarioId]);
      await client.query(`insert into mercado_pago_oauth_states (state, estabelecimento_id, usuario_id, code_verifier, expira_em)
        values ($1, $2, $3, $4, now() + interval '10 minutes')`, [state, sessao.estabelecimentoId, sessao.usuarioId, verifier]);
    });
    return NextResponse.redirect(urlAutorizacaoMercadoPago(state, verifier));
  } catch (erro) {
    const mensagem = erro instanceof MercadoPagoErro ? erro.message : "Não foi possível iniciar a conexão Mercado Pago.";
    return NextResponse.json({ erro: mensagem }, { status: erro instanceof MercadoPagoErro ? erro.status : 500 });
  }
}
