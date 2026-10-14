import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { EvolutionApiErro, desconectarInstancia, estadoConexao } from "@/lib/evolution-api-client";
import { buscarConfigWhatsApp, montarEstadoConexao } from "@/lib/whatsapp-conexao";

function respostaIntegracaoAusente() {
  return NextResponse.json(
    { erro: "A integração com WhatsApp ainda não está configurada.", codigo: "WHATSAPP_INTEGRATION_NOT_CONFIGURED" },
    { status: 404 }
  );
}

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (sessao.role !== "admin") return respostaAcessoNegado();

  try {
    const config = await buscarConfigWhatsApp(sessao.estabelecimentoId);
    const conexao = await montarEstadoConexao(config.instancia, config.automationEnabled, true);
    return NextResponse.json(conexao);
  } catch (erro) {
    if (erro instanceof EvolutionApiErro && erro.status === 503) return respostaIntegracaoAusente();
    console.error("GET /api/configuracoes/conexoes/whatsapp", erro);
    return NextResponse.json({ erro: "Não foi possível consultar a conexão com o WhatsApp." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (sessao.role !== "admin") return respostaAcessoNegado();

  const body = await request.json().catch(() => null);
  if (typeof body?.automationEnabled !== "boolean") {
    return NextResponse.json({ erro: "Informe automationEnabled (true ou false)." }, { status: 400 });
  }
  const ativar = body.automationEnabled as boolean;

  try {
    const config = await buscarConfigWhatsApp(sessao.estabelecimentoId);
    if (ativar) {
      if (!config.instancia) return respostaIntegracaoAusente();
      const estado = await estadoConexao(config.instancia);
      if (estado !== "open") {
        return NextResponse.json({ erro: "Conecte um número antes de ativar as atualizações automáticas." }, { status: 409 });
      }
    }

    const automationEnabled = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      if (!ativar) {
        await client.query("select fn_whatsapp_desativar_automacao($1)", [sessao.estabelecimentoId]);
      }
      const { rows } = await client.query(
        `update estabelecimentos set whatsapp_automacao_ativa = $2 where id = $1
         returning whatsapp_automacao_ativa as "automationEnabled"`,
        [sessao.estabelecimentoId, ativar]
      );
      return rows[0]?.automationEnabled ?? false;
    });

    return NextResponse.json({ automationEnabled });
  } catch (erro) {
    if (erro instanceof EvolutionApiErro && erro.status === 503) return respostaIntegracaoAusente();
    console.error("PATCH /api/configuracoes/conexoes/whatsapp", erro);
    return NextResponse.json({ erro: "Não foi possível atualizar a automação do WhatsApp." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (sessao.role !== "admin") return respostaAcessoNegado();

  try {
    const config = await buscarConfigWhatsApp(sessao.estabelecimentoId);
    if (config.instancia) {
      await desconectarInstancia(config.instancia);
      await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
        await client.query("select fn_whatsapp_desativar_automacao($1)", [sessao.estabelecimentoId]);
        await client.query("update estabelecimentos set whatsapp_automacao_ativa = false where id = $1", [sessao.estabelecimentoId]);
      });
    }
    return NextResponse.json({
      status: "disconnected", connected: false, phone: null,
      automationEnabled: false, qrCodeDataUrl: null, qrExpiresAt: null,
      updatedAt: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("DELETE /api/configuracoes/conexoes/whatsapp", erro);
    return NextResponse.json({ erro: "Não foi possível desconectar o WhatsApp." }, { status: 502 });
  }
}
