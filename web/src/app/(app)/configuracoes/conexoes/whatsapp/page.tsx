"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, Check, CheckCircle2, CircleAlert, Clock3, LoaderCircle,
  MessageCircle, QrCode, RefreshCw, ShieldCheck, Smartphone, Unplug, X,
} from "lucide-react";
import {
  atualizarAutomacaoWhatsApp, buscarConexaoWhatsApp, desconectarWhatsApp,
  iniciarConexaoWhatsApp, listarEventosWhatsApp,
  type ConexaoWhatsApp, type EventoWhatsApp, type ResultadoNotificacao,
  type StatusPedidoWhatsApp,
} from "@/lib/whatsapp-evolution-api";

const STATUS_LABEL: Record<StatusPedidoWhatsApp, string> = {
  novo: "Pedido recebido",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  finalizado: "Finalizado / entregue",
};

const RESULTADO_LABEL: Record<ResultadoNotificacao, string> = {
  pending: "Na fila",
  accepted: "Aceita pela Evolution",
  failed: "Falha no envio",
  uncertain: "Resultado incerto",
  ignored: "Ignorada",
};

function dataHora(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Horário indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

function mensagemDeErro(causa: unknown) {
  const erro = causa as (Error & { status?: number; codigo?: string }) | null;
  if (erro?.status === 404 || erro?.codigo === "WHATSAPP_INTEGRATION_NOT_CONFIGURED") {
    return "A interface está pronta, mas os endpoints da integração ainda não estão disponíveis. A conexão será liberada quando o backend for instalado.";
  }
  return erro instanceof Error ? erro.message : "Não foi possível comunicar com o serviço. Tente novamente.";
}

function classeResultado(resultado: ResultadoNotificacao) {
  if (resultado === "accepted") return "bg-basil-050 text-basil-700";
  if (resultado === "failed" || resultado === "uncertain") return "bg-red-50 text-red-700";
  if (resultado === "ignored") return "bg-cream-100 text-ink-500";
  return "bg-amber-50 text-amber-800";
}

export default function WhatsAppConexoesPage() {
  const [conexao, setConexao] = useState<ConexaoWhatsApp | null>(null);
  const [eventos, setEventos] = useState<EventoWhatsApp[]>([]);
  const [eventosErro, setEventosErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [operacao, setOperacao] = useState<"connect" | "disconnect" | "toggle" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [qrModalAberto, setQrModalAberto] = useState(false);

  const carregar = useCallback(async (mostrarCarregamento = false) => {
    if (mostrarCarregamento) setCarregando(true);
    try {
      const dados = await buscarConexaoWhatsApp();
      setConexao(dados);
      if (dados.status !== "connecting") setQrModalAberto(false);
      setErro(null);
      try {
        const historico = await listarEventosWhatsApp();
        setEventos(historico.items);
        setEventosErro(null);
      } catch (causa) {
        setEventosErro(mensagemDeErro(causa));
      }
    } catch (causa) {
      setErro(mensagemDeErro(causa));
    } finally {
      if (mostrarCarregamento) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [carregar]);

  useEffect(() => {
    if (conexao?.status !== "connecting") return;
    const timer = window.setInterval(() => { void carregar(); }, 4000);
    return () => window.clearInterval(timer);
  }, [conexao?.status, carregar]);


  async function conectar() {
    setOperacao("connect"); setErro(null); setAviso(null);
    try {
      setConexao(await iniciarConexaoWhatsApp());
      setQrModalAberto(true);
    } catch (causa) { setErro(mensagemDeErro(causa)); }
    finally { setOperacao(null); }
  }

  async function desconectar() {
    if (!window.confirm("Desconectar o WhatsApp deste restaurante? As mensagens automáticas deixarão de ser enviadas.")) return;
    setOperacao("disconnect"); setErro(null); setAviso(null);
    try {
      setConexao(await desconectarWhatsApp());
      setAviso("Número desconectado.");
    } catch (causa) { setErro(mensagemDeErro(causa)); }
    finally { setOperacao(null); }
  }

  async function alternarAutomacao() {
    if (!conexao) return;
    const novoValor = !conexao.automationEnabled;
    setOperacao("toggle"); setErro(null); setAviso(null);
    try {
      const retorno = await atualizarAutomacaoWhatsApp(novoValor);
      setConexao({ ...conexao, automationEnabled: retorno.automationEnabled });
      setAviso(retorno.automationEnabled ? "Atualizações automáticas ativadas." : "Atualizações automáticas desativadas.");
    } catch (causa) { setErro(mensagemDeErro(causa)); }
    finally { setOperacao(null); }
  }

  const conectado = conexao?.status === "connected" && conexao.connected;
  const qrDataValida = Boolean(conexao?.qrCodeDataUrl && conexao.qrCodeDataUrl.length < 1_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(conexao.qrCodeDataUrl));
  const qrValido = conexao?.status === "connecting" && qrDataValida;
  const integracaoAusente = erro?.includes("endpoints da integração ainda não estão disponíveis");

  return <div className="of-page pb-24">
    <Link href="/configuracoes" className="of-btn-secondary mb-5"><ArrowLeft size={16} /> Configurações</Link>
    <div className="of-page-header">
      <div><p className="of-eyebrow">Configurações · Conexões</p><h1 className="of-title">WhatsApp</h1><p className="of-subtitle">Conecte o número do restaurante e avise o cliente quando o pedido mudar de etapa.</p></div>
      <button type="button" onClick={() => void carregar(true)} disabled={carregando || Boolean(operacao)} className="of-btn-secondary"><RefreshCw size={16} className={carregando ? "animate-spin" : ""} /> Atualizar</button>
    </div>

    {erro && <div role="alert" className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${integracaoAusente ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-800"}`}><CircleAlert size={19} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">{integracaoAusente ? "Integração aguardando backend" : "Não foi possível carregar o WhatsApp"}</p><p className="mt-1">{erro}</p>{!integracaoAusente && <button type="button" onClick={() => void carregar(true)} className="mt-2 font-semibold underline underline-offset-2">Tentar novamente</button>}</div></div>}
    {aviso && <p role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-basil-050 p-3 text-sm text-basil-700"><CheckCircle2 size={17} />{aviso}</p>}

    <section className="mb-5 overflow-hidden rounded-[1.6rem] border border-ink-900 bg-ink-900 text-white shadow-[0_24px_60px_-38px_rgba(25,23,20,.7)]">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-white/75"><MessageCircle size={14} className="text-basil-300" /> Canal de pedidos</span>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-.04em] sm:text-3xl">Um aviso claro em cada etapa.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">O cliente recebe atualizações privadas quando o pedido é recebido, entra em preparo, fica pronto, sai para entrega e é finalizado.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${conectado ? "bg-basil-300/15 text-basil-200" : "bg-white/10 text-white/75"}`}>
              <i className={`h-2 w-2 rounded-full ${conectado ? "bg-basil-300" : conexao?.status === "error" ? "bg-red-300" : "bg-amber-300"}`} />
              {carregando ? "Verificando conexão" : conectado ? "Número conectado" : conexao?.status === "connecting" ? "Aguardando leitura do QR" : conexao?.status === "error" ? "Conexão com erro" : integracaoAusente ? "Backend pendente" : "Não conectado"}
            </span>
            {conectado && conexao.phone && <span className="text-xs text-white/60">{conexao.phone}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {!conectado ? <button type="button" onClick={() => void conectar()} disabled={Boolean(operacao) || carregando || !conexao || integracaoAusente} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coral-500 px-4 text-sm font-semibold text-white transition hover:bg-coral-400 disabled:cursor-not-allowed disabled:opacity-50">{operacao === "connect" ? <LoaderCircle size={17} className="animate-spin" /> : <QrCode size={17} />} {conexao?.status === "connecting" ? "Gerar novo QR" : "Conectar número"}</button> : <button type="button" onClick={() => void desconectar()} disabled={Boolean(operacao)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50">{operacao === "disconnect" ? <LoaderCircle size={17} className="animate-spin" /> : <Unplug size={17} />} Desconectar</button>}
        </div>
      </div>
    </section>

    {qrModalAberto && conexao?.status === "connecting" && <div className="of-modal-backdrop z-[70]" role="dialog" aria-modal="true" aria-label="Escanear QR Code do WhatsApp">
      <section className="of-modal-panel flex max-h-[90dvh] max-w-md flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-cream-200 p-5">
          <div><p className="of-eyebrow">Vincular aparelho</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Escaneie o QR Code</h2></div>
          <button type="button" onClick={() => setQrModalAberto(false)} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          <ol className="space-y-3 text-sm leading-6 text-ink-600">
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-coral-050 text-xs font-bold text-coral-700">1</span>Abra o WhatsApp no celular do restaurante.</li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-coral-050 text-xs font-bold text-coral-700">2</span>Acesse <b>Dispositivos conectados → Conectar dispositivo</b>.</li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-coral-050 text-xs font-bold text-coral-700">3</span>Aponte a câmera para o código abaixo.</li>
          </ol>
          <div className="mx-auto mt-5 w-fit rounded-2xl border border-cream-200 bg-white p-3 shadow-sm">
            {qrValido ? <Image src={conexao.qrCodeDataUrl ?? ""} alt="QR Code temporário para conectar o WhatsApp do restaurante" width={208} height={208} unoptimized className="h-52 w-52 object-contain" /> : <div className="flex h-52 w-52 items-center justify-center"><LoaderCircle size={28} className="animate-spin text-ink-400" /></div>}
            <p className="mt-2 text-center text-[11px] font-medium text-ink-500">Aguardando leitura…</p>
          </div>
          {conexao.qrExpiresAt && <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-400"><Clock3 size={14} /> Código temporário · expira {dataHora(conexao.qrExpiresAt)}</p>}
        </div>
        <footer className="shrink-0 border-t border-cream-200 bg-surface p-5"><button type="button" onClick={() => void conectar()} disabled={Boolean(operacao)} className="of-btn-secondary w-full">{operacao === "connect" ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />} Gerar novo QR</button></footer>
      </section>
    </div>}

    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <section className="of-panel overflow-hidden">
        <div className="flex items-start gap-4 border-b border-cream-200 p-5 sm:p-6"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-050 text-coral-600"><Smartphone size={21} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-ink-900">Atualizações automáticas</h2><p className="mt-1 text-sm leading-5 text-ink-500">Ative somente depois de conectar o número e revisar o consentimento no checkout.</p></div><button type="button" onClick={() => void alternarAutomacao()} disabled={!conectado || Boolean(operacao) || integracaoAusente} aria-pressed={Boolean(conexao?.automationEnabled)} aria-label={conexao?.automationEnabled ? "Desativar atualizações automáticas" : "Ativar atualizações automáticas"} className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${conexao?.automationEnabled ? "bg-basil-600" : "bg-cream-300"}`}>{operacao === "toggle" ? <LoaderCircle size={15} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" /> : <i className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${conexao?.automationEnabled ? "left-7" : "left-1"}`} />}</button></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">{Object.entries(STATUS_LABEL).map(([status, label], index) => <div key={status} className="flex items-center gap-2 rounded-xl bg-cream-50 px-3 py-2.5 text-xs text-ink-600"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-ink-400 ring-1 ring-cream-200">{index + 1}</span>{label}</div>)}</div>
        </div>
        </div>
        <div className="flex gap-3 bg-cream-50/70 p-5 text-xs leading-5 text-ink-500 sm:px-6"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-basil-700" /><p>Mensagens só são enviadas quando o cliente autoriza explicitamente no pedido. A confirmação da Evolution significa que ela aceitou o envio — não confirma entrega ou leitura pelo cliente.</p></div>
      </section>

      <section className="of-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-cream-200 p-5 sm:px-6"><div><p className="of-eyebrow">Rastreabilidade</p><h2 className="mt-1 font-display text-lg font-semibold text-ink-900">Atividade recente</h2></div><Clock3 size={18} className="text-ink-400" /></div>
        {eventosErro ? <p role="status" className="m-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Não foi possível carregar a atividade recente: {eventosErro}</p> : eventos.length ? <ul className="divide-y divide-cream-200">{eventos.map((evento) => <li key={evento.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">Pedido #{evento.orderCode} · {STATUS_LABEL[evento.status]}</p><p className="mt-1 text-xs text-ink-400">{dataHora(evento.createdAt)}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${classeResultado(evento.outcome)}`}>{evento.outcome === "accepted" && <Check size={12} />}{RESULTADO_LABEL[evento.outcome]}</span></li>)}</ul> : <div className="p-6 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-cream-50 text-ink-400"><Clock3 size={20} /></span><p className="mt-3 text-sm font-semibold text-ink-700">Ainda sem notificações</p><p className="mt-1 text-xs leading-5 text-ink-400">Quando a automação estiver ativa, as tentativas recentes aparecerão aqui.</p></div>}
      </section>
    </div>
  </div>;
}
