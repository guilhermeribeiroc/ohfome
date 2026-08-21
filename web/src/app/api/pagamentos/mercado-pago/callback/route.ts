import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao } from "@/lib/api-auth";
import { sessaoEhAdministrador } from "@/lib/admin-auth";
import { comEstabelecimento } from "@/lib/db";
import { cifrarSegredo, MercadoPagoErro, trocarCodigoMercadoPago } from "@/lib/mercado-pago";

function destino(request: NextRequest, estado: "conectado" | "erro", mensagem?: string) {
  const url = new URL("/configuracoes/pagamentos", request.url);
  url.searchParams.set("mercadoPago", estado);
  if (mensagem) url.searchParams.set("mensagem", mensagem);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return destino(request, "erro", "Sessão expirada. Entre novamente e refaça a conexão.");
  if (!(await sessaoEhAdministrador(sessao))) return destino(request, "erro", "Somente administradores podem conectar o Mercado Pago.");
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code || !/^[0-9a-f-]{36}$/i.test(state)) return destino(request, "erro", "A autorização Mercado Pago não foi concluída.");

  try {
    await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query<{ codeVerifier: string }>(`select code_verifier as "codeVerifier" from mercado_pago_oauth_states
        where state = $1 and usuario_id = $2 and estabelecimento_id = $3 and expira_em > now() for update`, [state, sessao.usuarioId, sessao.estabelecimentoId]);
      const oauth = rows[0];
      if (!oauth) throw new MercadoPagoErro("Esta autorização expirou. Tente conectar novamente.", 400);
      const token = await trocarCodigoMercadoPago(code, oauth.codeVerifier);
      if (!token.user_id) throw new MercadoPagoErro("O Mercado Pago não informou a conta autorizada.", 502);
      const expiraEm = new Date(Date.now() + Math.max(60, token.expires_in ?? 60 * 60) * 1000);
      await client.query(`insert into mercado_pago_conexoes
        (estabelecimento_id, collector_id, access_token_cifrado, refresh_token_cifrado, token_expira_em, scope)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (estabelecimento_id) do update set collector_id = excluded.collector_id,
          access_token_cifrado = excluded.access_token_cifrado, refresh_token_cifrado = excluded.refresh_token_cifrado,
          token_expira_em = excluded.token_expira_em, scope = excluded.scope, conectado_em = now()`,
        [sessao.estabelecimentoId, String(token.user_id), cifrarSegredo(token.access_token), cifrarSegredo(token.refresh_token), expiraEm, token.scope ?? null]);
      await client.query("delete from mercado_pago_oauth_states where state = $1", [state]);
    });
    return destino(request, "conectado");
  } catch (erro) {
    return destino(request, "erro", erro instanceof MercadoPagoErro ? erro.message : "Não foi possível concluir a conexão Mercado Pago.");
  }
}
