import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { EvolutionApiErro, criarInstancia, gerarNomeInstancia, obterQrCode } from "@/lib/evolution-api-client";
import { buscarConfigWhatsApp, type ConexaoWhatsApp } from "@/lib/whatsapp-conexao";

const QR_VALIDADE_MS = 45_000;

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();
  if (sessao.role !== "admin") return respostaAcessoNegado();

  try {
    const config = await buscarConfigWhatsApp(sessao.estabelecimentoId);
    let instancia = config.instancia;
    let qrBase64: string | null | undefined;

    if (!instancia) {
      instancia = gerarNomeInstancia(sessao.estabelecimentoId);
      const criado = await criarInstancia(instancia);
      qrBase64 = criado.qrcode?.base64;
      await comEstabelecimento(sessao.estabelecimentoId, (client) =>
        client.query("update estabelecimentos set whatsapp_instancia = $2 where id = $1", [sessao.estabelecimentoId, instancia])
      );
    } else {
      const qr = await obterQrCode(instancia);
      qrBase64 = qr.base64;
    }

    const resposta: ConexaoWhatsApp = {
      status: "connecting",
      connected: false,
      phone: null,
      automationEnabled: config.automationEnabled,
      qrCodeDataUrl: qrBase64 ?? null,
      qrExpiresAt: qrBase64 ? new Date(Date.now() + QR_VALIDADE_MS).toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(resposta);
  } catch (erro) {
    if (erro instanceof EvolutionApiErro && erro.status === 503) {
      return NextResponse.json(
        { erro: "A integração com WhatsApp ainda não está configurada.", codigo: "WHATSAPP_INTEGRATION_NOT_CONFIGURED" },
        { status: 404 }
      );
    }
    console.error("POST /api/configuracoes/conexoes/whatsapp/connect", erro);
    return NextResponse.json({ erro: "Não foi possível iniciar a conexão com o WhatsApp." }, { status: 502 });
  }
}
