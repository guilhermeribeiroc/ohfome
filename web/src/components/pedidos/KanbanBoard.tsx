"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowRight, Bell, BellOff, BellRing, Check, ChefHat, Clock3, Copy, Loader2, MapPin, MessageSquareText, Minus, PackageCheck, PackageSearch, Plus, Printer, QrCode, Search, ShoppingBag, Store, Trash2, Truck, UtensilsCrossed, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BairroEntrega, Cliente, Entregador, Mesa, Pedido, PedidoStatus, Produto } from "@/lib/types";
import { MESA_STATUS_LABEL, PEDIDO_STATUS_LABEL, nomeProdutoComTamanho } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { imprimirPedido, textoPagamento } from "@/lib/impressao";
import { useTenant } from "@/lib/tenant-context";
import { ClienteRapido } from "@/components/clientes/ClienteRapido";
import { CategoriaChips, CategoriaColuna } from "@/components/ui/CategoriaChips";

const TODAS_COLUNAS: PedidoStatus[] = ["novo", "em_preparo", "pronto", "saiu_para_entrega", "finalizado"];
const PROXIMO_STATUS: Partial<Record<PedidoStatus, PedidoStatus>> = { novo: "em_preparo", em_preparo: "pronto", pronto: "saiu_para_entrega", saiu_para_entrega: "finalizado" };
const STATUS_ICON: Record<Exclude<PedidoStatus, "cancelado">, LucideIcon> = { novo: Bell, em_preparo: ChefHat, pronto: PackageCheck, saiu_para_entrega: Truck, finalizado: Check };
type PedidoCanal = "delivery" | "mesa" | "retirada" | "balcao";

const CANAL_CONFIG: Record<PedidoCanal, { label: string; icon: LucideIcon; tone: string }> = {
  delivery: { label: "Delivery", icon: Truck, tone: "bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/25" },
  mesa: { label: "Mesa", icon: UtensilsCrossed, tone: "bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/25" },
  retirada: { label: "Retirada", icon: ShoppingBag, tone: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25" },
  balcao: { label: "Balcão", icon: Store, tone: "bg-ink-100 text-ink-700 ring-1 ring-ink-200" },
};
const STATUS_TONE: Record<Exclude<PedidoStatus, "cancelado">, string> = {
  novo: "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20",
  em_preparo: "bg-orange-500/10 text-orange-700 ring-1 ring-orange-500/20",
  pronto: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20",
  saiu_para_entrega: "bg-blue-500/10 text-blue-700 ring-1 ring-blue-500/20",
  finalizado: "bg-zinc-500/10 text-zinc-600 ring-1 ring-zinc-500/15",
};

function tempoDecorrido(iso: string) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h ${minutos % 60}min`;
}

function canalDoPedido(pedido: Pedido): PedidoCanal {
  if (pedido.tipo === "delivery") return "delivery";
  if (pedido.tipo === "mesa") return "mesa";
  if (pedido.formaRecebimento === "retirada") return "retirada";
  return "balcao";
}

function nomeCanal(pedido: Pedido) {
  const canal = canalDoPedido(pedido);
  if (canal === "mesa" && pedido.mesaNumero) return `Mesa ${String(pedido.mesaNumero).padStart(2, "0")}`;
  return CANAL_CONFIG[canal].label;
}

function resumoDoAtendimento(pedido: Pedido) {
  const canal = canalDoPedido(pedido);
  if (pedido.clienteNome) return pedido.clienteNome;
  if (canal === "mesa") return "Atendimento no salão";
  if (canal === "retirada") return "Retirada no balcão";
  if (canal === "delivery") return "Cliente delivery";
  return "Atendimento presencial";
}

interface PedidoCardProps {
  pedido: Pedido;
  status: PedidoStatus;
  arrastando: boolean;
  permiteCancelar: boolean;
  onAbrir: (pedido: Pedido) => void;
  onDragStart: (evento: DragEvent<HTMLElement>, pedidoId: string) => void;
  onDragEnd: () => void;
  onCancelar: (pedidoId: string) => void;
  onAvancar: (pedidoId: string, status: PedidoStatus) => void;
  podeAvancar: boolean;
}

// Comparação por conteúdo (não por referência) — o poller recria o array
// inteiro de pedidos a cada tick com qualquer mudança, então sem isso TODOS
// os cards re-renderizariam mesmo quando só 1 pedido muda. Os callbacks
// (useCallback no KanbanBoard) já são estáveis, então não entram na conta.
function pedidoCardIgual(anterior: PedidoCardProps, atual: PedidoCardProps) {
  return (
    anterior.status === atual.status &&
    anterior.arrastando === atual.arrastando &&
    anterior.permiteCancelar === atual.permiteCancelar &&
    anterior.podeAvancar === atual.podeAvancar &&
    JSON.stringify(anterior.pedido) === JSON.stringify(atual.pedido)
  );
}

const PedidoCard = memo(function PedidoCard({
  pedido,
  status,
  arrastando,
  permiteCancelar,
  onAbrir,
  onDragStart,
  onDragEnd,
  onCancelar,
  onAvancar,
  podeAvancar,
}: PedidoCardProps) {
  return (
    <article draggable onClick={() => onAbrir(pedido)} onKeyDown={(evento) => { if (evento.key === "Enter") onAbrir(pedido); }} tabIndex={0} role="button" onDragStart={(evento) => onDragStart(evento, pedido.id)} onDragEnd={onDragEnd} className={`group cursor-grab rounded-2xl border border-cream-200/80 bg-surface p-3.5 shadow-sm transition-all duration-200 active:cursor-grabbing hover:-translate-y-0.5 hover:border-cream-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 ${arrastando ? "opacity-45" : ""}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-display text-base font-bold tracking-tight text-ink-900">#{pedido.codigo}</span><PedidoCanalBadge pedido={pedido} />{pedido.pedidoPaiCodigo && <span className="inline-flex items-center rounded-full bg-coral-050 px-2 py-0.5 text-[10px] font-bold text-coral-600">Adicional #{pedido.pedidoPaiCodigo}</span>}</div><p className="mt-1 truncate text-[11px] font-medium text-ink-500">{resumoDoAtendimento(pedido)}</p></div><span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-ink-400"><Clock3 size={12} />{tempoDecorrido(pedido.createdAt)}</span></div>
      <ul className="my-3 space-y-1.5 border-y border-cream-100 py-3">{pedido.itens.map((item) => <li key={item.id} className="flex gap-2 text-xs leading-5 text-ink-600"><b className="font-semibold text-ink-900">{item.quantidade}×</b><span>{item.produtoNome}{item.pizza && <small className="block text-coral-600">{item.pizza.tamanhoNome} · {item.pizza.saborDoisNome ? `½ ${item.pizza.saborUmNome} / ½ ${item.pizza.saborDoisNome}` : item.pizza.saborUmNome}</small>}{item.opcoes?.map((opcao) => <small key={`${opcao.grupoNome}-${opcao.opcaoNome}`} className="block text-ink-500">{opcao.grupoNome}: {opcao.opcaoNome}</small>)}</span></li>)}</ul>
      {(pedido.enderecoEntrega || pedido.observacoes) && <div className="mb-3 space-y-1.5 rounded-xl bg-cream-50 p-2.5 text-[11px] leading-4 text-ink-600">{pedido.enderecoEntrega && <p className="flex gap-1.5 text-sm leading-5"><MapPin size={16} className="mt-0.5 shrink-0 text-coral-600" /><span><b className="font-semibold text-ink-800">Entrega:</b> <span className="font-semibold text-ink-800">{pedido.enderecoEntrega}</span></span></p>}{pedido.observacoes && <p className="flex gap-1.5"><MessageSquareText size={13} className="mt-0.5 shrink-0 text-coral-600" /><span><b className="font-semibold text-ink-800">Obs.:</b> {pedido.observacoes}</span></p>}</div>}
      <div className="flex items-center justify-between gap-2"><strong className="whitespace-nowrap font-display text-sm font-bold text-ink-900">R$ {pedido.total.toFixed(2).replace(".", ",")}</strong>{permiteCancelar && status === "novo" && <button onClick={(evento) => { evento.stopPropagation(); void onCancelar(pedido.id); }} className="flex h-10 w-10 items-center justify-center rounded-xl text-danger-600 transition hover:bg-danger-050" aria-label={`Cancelar pedido ${pedido.codigo}`}><X size={15} /></button>}</div>{status !== "finalizado" && podeAvancar && <button onClick={(evento) => { evento.stopPropagation(); void onAvancar(pedido.id, pedido.status); }} className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-900 px-3 text-[11px] font-semibold text-white transition active:scale-95">{status === "pronto" ? (pedido.tipo === "delivery" ? "Selecionar entregador" : "Finalizar") : "Avançar"} <ArrowRight size={13} /></button>}
    </article>
  );
}, pedidoCardIgual);

function PedidoCanalBadge({ pedido }: { pedido: Pedido }) {
  const canal = canalDoPedido(pedido);
  const { icon: Icon, tone } = CANAL_CONFIG[canal];
  return <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-extrabold uppercase tracking-[.09em] ${tone}`} aria-label={`Canal do pedido: ${nomeCanal(pedido)}`}><Icon aria-hidden size={12} strokeWidth={2.25} />{nomeCanal(pedido)}</span>;
}

function linkWhatsapp(telefone: string, mensagem: string) {
  const digitos = telefone.replace(/\D/g, "");
  const comDdi = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(mensagem)}`;
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 880; gain.gain.setValueAtTime(.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .35);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .35);
  } catch { /* dispositivo sem Web Audio */ }
}

interface KanbanBoardProps { titulo?: string; subtitulo?: string; colunas?: PedidoStatus[]; permiteCriar?: boolean; permiteCancelar?: boolean; origem?: "app"; modoCozinha?: boolean; }

export function KanbanBoard({ titulo = "Painel de pedidos", subtitulo = "Central de pedidos em tempo real", colunas = TODAS_COLUNAS, permiteCriar = true, permiteCancelar = true, origem, modoCozinha = false }: KanbanBoardProps) {
  const url = origem ? `/api/pedidos?origem=${origem}` : "/api/pedidos";
  const { dados, setDados, recarregar } = usePolling<Pedido[]>(url, 4000);
  const pedidos = useMemo(() => dados ?? [], [dados]);
  const { usuarioAtual } = useTenant();
  const souAdmin = usuarioAtual?.role === "admin";
  const [somAtivo, setSomAtivo] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [pedidoArrastado, setPedidoArrastado] = useState<string | null>(null);
  const [colunaDestino, setColunaDestino] = useState<PedidoStatus | null>(null);
  const [pedidoDetalhe, setPedidoDetalhe] = useState<Pedido | null>(null);
  const [promptNotificar, setPromptNotificar] = useState<{ pedido: Pedido; status: PedidoStatus } | null>(null);
  const [confirmacaoAutomatica, setConfirmacaoAutomatica] = useState<{ codigo: number; status: PedidoStatus } | null>(null);
  const [notificando, setNotificando] = useState(false);
  const [avisoErro, setAvisoErro] = useState<string | null>(null);
  const [pedidoParaDespachar, setPedidoParaDespachar] = useState<Pedido | null>(null);
  const [filtroCanal, setFiltroCanal] = useState<"todos" | PedidoCanal>("todos");
  const pedidosFiltrados = useMemo(() => filtroCanal === "todos" ? pedidos : pedidos.filter((pedido) => canalDoPedido(pedido) === filtroCanal), [filtroCanal, pedidos]);
  const quantidadePorCanal = useMemo(() => {
    const quantidades: Record<"todos" | PedidoCanal, number> = { todos: pedidos.length, delivery: 0, mesa: 0, retirada: 0, balcao: 0 };
    for (const pedido of pedidos) quantidades[canalDoPedido(pedido)] += 1;
    return quantidades;
  }, [pedidos]);
  const mostrarFiltrosDeCanal = !modoCozinha && !origem;

  // Ref em vez de closure direta sobre `pedidos` — assim os handlers abaixo
  // (useCallback com deps estaveis) sempre leem o pedido mais recente sem
  // precisar trocar de referencia a cada poll, o que permite memoizar
  // PedidoCard por conteudo sem arriscar usar dados desatualizados.
  const pedidosRef = useRef(pedidos);
  useEffect(() => { pedidosRef.current = pedidos; }, [pedidos]);

  const moverPedido = useCallback(async (pedidoId: string, status: PedidoStatus) => {
    const pedidoAtual = pedidosRef.current.find((pedido) => pedido.id === pedidoId);
    if (!pedidoAtual || pedidoAtual.status === status) return;
    if (pedidoAtual.tipo === "delivery" && status === "saiu_para_entrega") {
      setPedidoParaDespachar(pedidoAtual);
      return;
    }
    setDados((lista) => (lista ?? []).map((pedido) => pedido.id === pedidoId ? { ...pedido, status } : pedido));
    const resposta = await fetch(`/api/pedidos/${pedidoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!resposta.ok) {
      const falha = await resposta.json().catch(() => null) as { erro?: string } | null;
      setAvisoErro(`Pedido #${pedidoAtual.codigo}: ${falha?.erro ?? "não foi possível mudar o status."}`);
      recarregar();
      return;
    }
    if (pedidoAtual.notificacaoAutomatica && status !== "cancelado") {
      setConfirmacaoAutomatica({ codigo: pedidoAtual.codigo, status });
    } else if (pedidoAtual.clienteTelefone && status !== "cancelado") {
      setPromptNotificar({ pedido: { ...pedidoAtual, status }, status });
    }
  }, [setDados, recarregar]);

  async function despacharPedido(entregadorId: string) {
    if (!pedidoParaDespachar) return { erro: "Pedido não encontrado." };
    const resposta = await fetch(`/api/pedidos/${pedidoParaDespachar.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "saiu_para_entrega", entregadorId }) });
    if (!resposta.ok) { const dados = await resposta.json().catch(() => null); return { erro: dados?.erro ?? "Não foi possível despachar o pedido." }; }
    const atualizado = await resposta.json().catch(() => null) as { status?: PedidoStatus } | null;
    setDados((lista) => (lista ?? []).map((pedido) => pedido.id === pedidoParaDespachar.id ? { ...pedido, status: atualizado?.status ?? "saiu_para_entrega" } : pedido));
    if (pedidoParaDespachar.notificacaoAutomatica) setConfirmacaoAutomatica({ codigo: pedidoParaDespachar.codigo, status: "saiu_para_entrega" });
    else if (pedidoParaDespachar.clienteTelefone) setPromptNotificar({ pedido: { ...pedidoParaDespachar, status: "saiu_para_entrega" }, status: "saiu_para_entrega" });
    setPedidoParaDespachar(null);
    return {};
  }

  useEffect(() => {
    if (!promptNotificar) return;
    const t = setTimeout(() => setPromptNotificar(null), 7000);
    return () => clearTimeout(t);
  }, [promptNotificar]);

  useEffect(() => {
    if (!avisoErro) return;
    const t = setTimeout(() => setAvisoErro(null), 7000);
    return () => clearTimeout(t);
  }, [avisoErro]);

  useEffect(() => {
    if (!confirmacaoAutomatica) return;
    const t = setTimeout(() => setConfirmacaoAutomatica(null), 5000);
    return () => clearTimeout(t);
  }, [confirmacaoAutomatica]);

  async function confirmarNotificacao() {
    if (!promptNotificar) return;
    setNotificando(true);
    const resposta = await fetch(`/api/pedidos/${promptNotificar.pedido.id}/notificar`, { method: "POST" });
    setNotificando(false);
    setPromptNotificar(null);
    if (!resposta.ok) return;
    const { telefone, mensagem } = await resposta.json();
    window.open(linkWhatsapp(telefone, mensagem), "_blank", "noopener,noreferrer");
    recarregar();
  }

  const avancarStatus = useCallback(async (pedidoId: string, atual: PedidoStatus) => {
    // Só delivery sai "para entrega"; balcão, retirada e mesa terminam em "pronto → finalizado".
    // Mandar saiu_para_entrega para esses tipos era recusado pelo servidor e o card voltava sem aviso.
    const tipo = pedidosRef.current.find((pedido) => pedido.id === pedidoId)?.tipo;
    const proximo = atual === "pronto" && tipo !== "delivery" ? "finalizado" : PROXIMO_STATUS[atual];
    if (!proximo) return;
    await moverPedido(pedidoId, proximo);
  }, [moverPedido]);

  const iniciarArraste = useCallback((evento: DragEvent<HTMLElement>, pedidoId: string) => {
    evento.dataTransfer.setData("text/ohfome-pedido", pedidoId);
    evento.dataTransfer.effectAllowed = "move";
    setPedidoArrastado(pedidoId);
  }, []);

  const finalizarArraste = useCallback(() => {
    setPedidoArrastado(null); setColunaDestino(null);
  }, []);

  async function soltarPedido(evento: DragEvent<HTMLElement>, status: PedidoStatus) {
    evento.preventDefault();
    const pedidoId = evento.dataTransfer.getData("text/ohfome-pedido");
    setPedidoArrastado(null); setColunaDestino(null);
    if (pedidoId) await moverPedido(pedidoId, status);
  }

  const cancelarPedido = useCallback(async (pedidoId: string) => {
    setDados((lista) => (lista ?? []).map((pedido) => pedido.id === pedidoId ? { ...pedido, status: "cancelado" } : pedido));
    await fetch(`/api/pedidos/${pedidoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelado" }) });
    recarregar();
  }, [setDados, recarregar]);

  async function excluirPedido(pedido: Pedido) {
    if (!confirm(`Excluir o pedido #${pedido.codigo} definitivamente? Esta ação não pode ser desfeita.`)) return;
    setPedidoDetalhe(null);
    setDados((lista) => (lista ?? []).filter((item) => item.id !== pedido.id));
    const resposta = await fetch(`/api/pedidos/${pedido.id}`, { method: "DELETE" });
    if (!resposta.ok) { recarregar(); return; }
  }

  return (
    <section className={origem ? "" : "of-page"}>
      <header className="of-page-header">
        <div><p className="of-eyebrow">Operação ao vivo</p><h1 className="of-title">{titulo}</h1><p className="of-subtitle">{subtitulo}. Atualização automática a cada poucos segundos.</p></div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={() => setSomAtivo((valor) => !valor)} className="of-btn-secondary flex-1 sm:flex-none" aria-pressed={somAtivo}>{somAtivo ? <Bell size={16} /> : <BellOff size={16} />}<span className="hidden sm:inline">Alertas</span></button>
          {permiteCriar && <button onClick={() => setModalAberto(true)} className="of-btn-primary flex-1 sm:flex-none"><Plus size={17} /> Novo pedido</button>}
        </div>
      </header>

      {avisoErro && <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-2xl bg-danger-050 px-4 py-3 text-sm font-medium text-danger-700"><span>{avisoErro}</span><button onClick={() => setAvisoErro(null)} className="shrink-0" aria-label="Fechar aviso"><X size={16} /></button></div>}

      {mostrarFiltrosDeCanal && <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar pedidos por canal">
        {(["todos", "delivery", "mesa", "retirada", "balcao"] as const).map((canal) => {
          const ativo = filtroCanal === canal;
          const config = canal === "todos" ? null : CANAL_CONFIG[canal];
          const Icon = config?.icon ?? PackageSearch;
          const rotulo = config?.label ?? "Todos";
          return <button key={canal} onClick={() => setFiltroCanal(canal)} aria-pressed={ativo} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 ${ativo ? "border-ink-900 bg-ink-900 text-white shadow-sm" : "border-cream-200 bg-surface text-ink-600 hover:border-cream-300 hover:bg-cream-50"}`}><Icon aria-hidden size={15} /><span>{rotulo}</span><span className={`rounded-md px-1.5 py-0.5 text-[10px] ${ativo ? "bg-white/15 text-white" : "bg-cream-100 text-ink-500"}`}>{quantidadePorCanal[canal]}</span></button>;
        })}
      </nav>}

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:grid lg:snap-none lg:overflow-visible" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}>
        {colunas.map((status) => {
          const itens = pedidosFiltrados.filter((pedido) => pedido.status === status);
          const Icon = STATUS_ICON[status as Exclude<PedidoStatus, "cancelado">];
          return (
            <section key={status} onDragOver={(evento) => { evento.preventDefault(); evento.dataTransfer.dropEffect = "move"; setColunaDestino(status); }} onDragLeave={() => setColunaDestino((atual) => atual === status ? null : atual)} onDrop={(evento) => void soltarPedido(evento, status)} className={`of-panel min-w-[86vw] snap-center overflow-hidden transition sm:min-w-[330px] lg:min-w-0 ${colunaDestino === status ? "ring-2 ring-coral-400 ring-offset-2" : ""}`}>
              <header className="of-panel-header sticky top-0 z-10 bg-surface/95 backdrop-blur">
                <span className={`of-status ${STATUS_TONE[status as Exclude<PedidoStatus, "cancelado">]}`}><Icon size={13} />{PEDIDO_STATUS_LABEL[status]}</span>
                <strong className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cream-100 px-2 font-display text-xs text-ink-600">{itens.length}</strong>
              </header>
              <div className="flex min-h-36 flex-col gap-2.5 p-2.5">
                {itens.length === 0 && <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-cream-300 text-center"><ShoppingBag size={20} className="mb-2 text-ink-400" /><p className="text-xs font-medium text-ink-400">Nenhum pedido aqui</p></div>}
                {itens.map((pedido) => (
                  <PedidoCard
                    key={pedido.id}
                    pedido={pedido}
                    status={status}
                    arrastando={pedidoArrastado === pedido.id}
                    permiteCancelar={permiteCancelar}
                    onAbrir={setPedidoDetalhe}
                    onDragStart={iniciarArraste}
                    onDragEnd={finalizarArraste}
                    onCancelar={cancelarPedido}
                    onAvancar={avancarStatus}
                    podeAvancar={!(modoCozinha && status === "pronto")}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {modalAberto && <NovoPedidoCentralModal onFechar={() => setModalAberto(false)} onCriado={() => { setModalAberto(false); if (somAtivo) playBeep(); recarregar(); }} />}
      {pedidoDetalhe && <PedidoDetalheModal pedido={pedidoDetalhe} onFechar={() => setPedidoDetalhe(null)} onNotificar={(pedido) => { setPedidoDetalhe(null); setPromptNotificar({ pedido, status: pedido.status }); }} permitirReimpressao={modoCozinha} permitirExcluir={souAdmin} onExcluir={excluirPedido} />}
      {pedidoParaDespachar && <DespacharPedidoModal pedido={pedidoParaDespachar} onFechar={() => setPedidoParaDespachar(null)} onDespachar={despacharPedido} />}

      {promptNotificar && (
        <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-sm items-start gap-3 overflow-hidden rounded-2xl bg-ink-900 p-4 text-white shadow-2xl sm:right-4 sm:left-auto" style={{ animation: "onb-pop .3s cubic-bezier(.2,.8,.2,1) both" }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-mango-400"><BellRing size={17} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Avisar {promptNotificar.pedido.clienteNome || "o cliente"}?</p>
            <p className="mt-0.5 text-xs leading-5 text-white/60">Pedido #{promptNotificar.pedido.codigo} agora está &ldquo;{PEDIDO_STATUS_LABEL[promptNotificar.status]}&rdquo;.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={confirmarNotificacao} disabled={notificando} className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-ink-900 transition active:scale-95 disabled:opacity-60">{notificando ? "Enviando..." : <><Bell size={13} /> Notificar</>}</button>
              <button onClick={() => setPromptNotificar(null)} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-white/60 transition hover:text-white">Agora não</button>
            </div>
          </div>
          <button onClick={() => setPromptNotificar(null)} className="shrink-0 text-white/40 transition hover:text-white" aria-label="Fechar aviso"><X size={15} /></button>
        </div>
      )}
      {confirmacaoAutomatica && <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-sm items-start gap-3 rounded-2xl bg-emerald-700 p-4 text-white shadow-2xl sm:right-4 sm:left-auto"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15"><Check size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Mensagem automática enfileirada</p><p className="mt-0.5 text-xs leading-5 text-white/75">Pedido #{confirmacaoAutomatica.codigo}: atualização para “{PEDIDO_STATUS_LABEL[confirmacaoAutomatica.status]}” será enviada ao cliente.</p></div><button onClick={() => setConfirmacaoAutomatica(null)} className="shrink-0 text-white/60 hover:text-white" aria-label="Fechar confirmação"><X size={15} /></button></div>}
    </section>
  );
}

function PedidoDetalheModal({ pedido, onFechar, onNotificar, permitirReimpressao, permitirExcluir, onExcluir }: { pedido: Pedido; onFechar: () => void; onNotificar: (pedido: Pedido) => void; permitirReimpressao: boolean; permitirExcluir: boolean; onExcluir: (pedido: Pedido) => void }) {
  const pagamento = textoPagamento(pedido);
  const [reimprimindo, setReimprimindo] = useState(false);
  const [mensagemImpressao, setMensagemImpressao] = useState("");

  async function reimprimirNaCozinha() {
    setReimprimindo(true); setMensagemImpressao("");
    try {
      const resposta = await fetch("/api/impressao/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedidoId: pedido.id }) });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível enfileirar a reimpressão.");
      setMensagemImpressao("Reimpressão enviada para a fila da cozinha.");
    } catch (erro) {
      setMensagemImpressao((erro as Error).message || "Não foi possível enfileirar a reimpressão.");
    } finally { setReimprimindo(false); }
  }

  return <div className="of-modal-backdrop z-50" role="dialog" aria-modal="true" aria-label={`Detalhes do pedido ${pedido.codigo}`}>
    <section className="of-modal-panel flex h-[min(90dvh,820px)] max-w-lg flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-cream-200 p-5"><div><p className="of-eyebrow">Pedido #{pedido.codigo}</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Detalhes do pedido</h2><div className="mt-2"><PedidoCanalBadge pedido={pedido} /></div>{pedido.pedidoPaiCodigo && <span className="mt-1.5 inline-flex items-center rounded-full bg-coral-050 px-2.5 py-1 text-[11px] font-bold text-coral-600">Adicional do pedido #{pedido.pedidoPaiCodigo}</span>}</div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar detalhes"><X size={17} /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><div className="rounded-2xl bg-cream-50 p-3.5 text-sm"><p className="font-semibold text-ink-900">{pedido.clienteNome || (pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : "Pedido presencial")}</p>{pedido.clienteTelefone && <p className="mt-1 text-xs text-ink-500">WhatsApp: {pedido.clienteTelefone}</p>}{pedido.enderecoEntrega && <p className="mt-2 flex gap-1.5 text-xs leading-5 text-ink-600"><MapPin size={13} className="mt-0.5 shrink-0 text-coral-600" />{pedido.enderecoEntrega}</p>}{pagamento && <p className="mt-2 text-xs font-medium text-ink-700">Pagamento: {pagamento}</p>}{pedido.observacoes && <p className="mt-2 flex gap-1.5 text-xs leading-5 text-ink-600"><MessageSquareText size={13} className="mt-0.5 shrink-0 text-coral-600" />{pedido.observacoes}</p>}{pedido.clienteTelefone && <button onClick={() => onNotificar(pedido)} className="mt-3 flex min-h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-3 text-xs font-semibold text-white transition active:scale-95"><Bell size={13} /> Notificar cliente</button>}</div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">Itens do pedido</p><ul className="divide-y divide-cream-100 rounded-2xl border border-cream-200 bg-surface px-3.5">{pedido.itens.map((item) => <li key={item.id} className="py-3"><div className="flex items-center justify-between gap-3 text-sm"><span><b className="mr-2 text-ink-900">{item.quantidade}×</b>{item.produtoNome}</span><b className="shrink-0 text-ink-900">R$ {(item.precoUnitario * item.quantidade).toFixed(2).replace(".", ",")}</b></div>{item.opcoes?.map((opcao) => <p key={`${opcao.grupoNome}-${opcao.opcaoNome}`} className="mt-1 pl-6 text-xs font-medium text-coral-600">{opcao.grupoNome}: {opcao.opcaoNome}</p>)}{item.observacoes && <p className="mt-1 pl-6 text-xs text-ink-500">Obs.: {item.observacoes}</p>}</li>)}</ul></div></div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 bg-surface p-5"><div className="flex flex-wrap gap-2"><button onClick={() => imprimirPedido(pedido, pedido.mesaNumero ? "Comanda da mesa" : "Via do pedido")} className="of-btn-secondary min-h-11 px-3"><Printer size={16} /> Imprimir</button>{permitirReimpressao && <button onClick={() => void reimprimirNaCozinha()} disabled={reimprimindo} className="of-btn-secondary min-h-11 px-3"><Printer size={16} /> {reimprimindo ? "Enviando..." : "Reimprimir cozinha"}</button>}{permitirExcluir && <button onClick={() => onExcluir(pedido)} className="of-icon-btn min-h-11 !w-11 text-danger-600 hover:!bg-danger-050" aria-label={`Excluir pedido ${pedido.codigo}`}><Trash2 size={16} /></button>}{mensagemImpressao && <p className="basis-full text-xs text-ink-500">{mensagemImpressao}</p>}</div><div className="text-right"><div className="mb-1 flex justify-end"><PedidoCanalBadge pedido={pedido} /></div><strong className="font-display text-xl font-bold text-ink-900">R$ {pedido.total.toFixed(2).replace(".", ",")}</strong></div></footer>
    </section>
  </div>;
}

// Linha da lista de novo pedido: produto comum ou UM sabor de pizza (o produto real é o mesmo).
type ProdutoLinha = Produto & { produtoRealId?: string; saborFixoId?: string };
const idDoProduto = (chave: string) => chave.split("~")[0];

// Escolha de uma pergunta do produto (pão, adicionais...). Com definePreco, o valor da opção é o preço
// COMPLETO do item (pão Bola R$ 8, Árabe R$ 9) e não um acréscimo.
type EscolhaOpcao = { grupoId: string; opcaoId: string; acrescimo: number; definePreco?: boolean; opcaoNome?: string };
const precoComOpcoes = (base: number, opcoes: EscolhaOpcao[]) => {
  const soma = opcoes.reduce((total, opcao) => total + opcao.acrescimo, 0);
  return opcoes.some((opcao) => opcao.definePreco) ? soma : base + soma;
};

// Chips de categoria no topo da lista de produtos (Pizzas, Calzones, Pastéis...):
// junto com a busca, evitam rolar o cardápio inteiro para achar um item.
function FiltroCategorias({ produtos, valor, onChange, modo = "chips" }: { produtos: Produto[]; valor: string; onChange: (categoria: string) => void; modo?: "chips" | "coluna" }) {
  const itens = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const produto of produtos) { const nome = produto.categoriaNome || "Sem categoria"; contagem.set(nome, (contagem.get(nome) ?? 0) + 1); }
    return [{ valor: "", rotulo: "Todas", quantidade: produtos.length }, ...[...contagem.entries()].map(([nome, quantidade]) => ({ valor: nome, rotulo: nome, quantidade }))];
  }, [produtos]);
  return modo === "coluna" ? <CategoriaColuna itens={itens} valor={valor} onChange={onChange} /> : <CategoriaChips itens={itens} valor={valor} onChange={onChange} />;
}

export function NovoPedidoModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const { dados: produtos } = usePolling<Produto[]>("/api/produtos", 60000);
  const { dados: mesas } = usePolling<Mesa[]>("/api/mesas", 60000);
  const [itens, setItens] = useState<Record<string, number>>({}); const [busca, setBusca] = useState(""); const [categoriaFiltro, setCategoriaFiltro] = useState(""); const [mesaId, setMesaId] = useState(""); const [modalidade, setModalidade] = useState<"preparo" | "imediata">("preparo"); const [formaPagamento, setFormaPagamento] = useState<"dinheiro" | "cartao" | "pix">("dinheiro"); const [tipoCartao, setTipoCartao] = useState<"credito" | "debito">("credito"); const [confirmarRecebimento, setConfirmarRecebimento] = useState(false); const [enviando, setEnviando] = useState(false); const [erro, setErro] = useState(""); const [chaveIdempotencia] = useState(() => crypto.randomUUID());
  const filtrados = (produtos ?? [])
    .map((produto) => ({ ...produto, nome: nomeProdutoComTamanho(produto) }))
    .filter((produto) => !categoriaFiltro || (produto.categoriaNome || "Sem categoria") === categoriaFiltro)
    .filter((produto) => produto.nome.toLowerCase().includes(busca.toLowerCase()));
  const total = useMemo(() => Object.entries(itens).reduce((soma, [id, qtd]) => soma + ((produtos ?? []).find((produto) => produto.id === id)?.precoVenda ?? 0) * qtd, 0), [itens, produtos]);

  function ajustar(id: string, delta: number) { setItens((atual) => { const produto = (produtos ?? []).find((item) => item.id === id); const qtd = (atual[id] ?? 0) + delta; if (delta > 0 && produto?.controlaEstoqueUnidades && qtd > (produto.estoqueDisponivel ?? 0)) { setErro(`${nomeProdutoComTamanho(produto)} está esgotado ou sem saldo suficiente.`); return atual; } if (qtd <= 0) return Object.fromEntries(Object.entries(atual).filter(([chave]) => chave !== id)); return { ...atual, [id]: qtd }; }); }
  async function criar() { if (Object.keys(itens).length === 0) return; if (!mesaId && modalidade === "imediata" && !confirmarRecebimento) { setErro("Confirme a entrega e o recebimento para concluir a venda imediata."); return; } setEnviando(true); setErro(""); const res = await fetch("/api/pedidos", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": chaveIdempotencia }, body: JSON.stringify({ tipo: mesaId ? "mesa" : "balcao", mesaId: mesaId || undefined, modalidade: mesaId ? "preparo" : modalidade, confirmarRecebimento: modalidade === "imediata" && confirmarRecebimento, formaPagamento: modalidade === "imediata" ? formaPagamento : undefined, tipoCartao: modalidade === "imediata" && formaPagamento === "cartao" ? tipoCartao : undefined, itens: Object.entries(itens).map(([produtoId, quantidade]) => ({ produtoId, quantidade })) }) }); setEnviando(false); if (!res.ok) { const dados = await res.json().catch(() => null); setErro(dados?.erro ?? "Não foi possível criar o pedido."); return; } onCriado(); }

  return <div className="of-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo pedido"><div className="of-modal-panel flex h-[min(90dvh,720px)] max-w-lg flex-col">
    <header className="of-panel-header bg-surface"><div><p className="of-eyebrow">Central de pedidos</p><h2 className="font-display text-lg font-bold tracking-tight">Novo pedido</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header>
    <div className="space-y-3 border-b border-cream-200 bg-surface p-4"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Mesa (opcional)</span><select value={mesaId} onChange={(evento) => setMesaId(evento.target.value)} className="of-field"><option value="">Pedido de balcão</option>{(mesas ?? []).filter((mesa) => mesa.status !== "reservada").map((mesa) => <option key={mesa.id} value={mesa.id}>Mesa {mesa.numero} · {MESA_STATUS_LABEL[mesa.status]}</option>)}</select></label>{!mesaId && <><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Destino do balcão</span><select value={modalidade} onChange={(evento) => setModalidade(evento.target.value as "preparo" | "imediata")} className="of-field"><option value="preparo">Preparar para retirada</option><option value="imediata">Venda imediata (não envia à cozinha)</option></select></label>{modalidade === "imediata" && <div className="rounded-xl bg-amber-500/10 p-3"><select value={formaPagamento} onChange={(evento) => setFormaPagamento(evento.target.value as "dinheiro" | "cartao" | "pix")} className="of-field !min-h-10"><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="pix">Pix</option></select>{formaPagamento === "cartao" && <select value={tipoCartao} onChange={(evento) => setTipoCartao(evento.target.value as "credito" | "debito")} className="mt-2 of-field !min-h-10"><option value="credito">Crédito</option><option value="debito">Débito</option></select>}<label className="mt-2 flex items-start gap-2 text-xs text-ink-700"><input type="checkbox" checked={confirmarRecebimento} onChange={(evento) => setConfirmarRecebimento(evento.target.checked)} className="mt-0.5" />Confirmo que os itens foram entregues e o pagamento foi recebido.</label></div>}</>}<div className="relative"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item do cardápio" className="of-field !pl-10" /></div><FiltroCategorias produtos={produtos ?? []} valor={categoriaFiltro} onChange={setCategoriaFiltro} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">{!(produtos ?? []).length ? <div className="flex min-h-full flex-col items-center justify-center rounded-2xl border border-dashed border-cream-300 bg-cream-50/60 px-6 text-center"><PackageSearch size={28} className="text-coral-500" /><p className="mt-3 text-sm font-semibold text-ink-900">Nenhum produto cadastrado</p><p className="mt-1 max-w-xs text-xs leading-5 text-ink-400">Cadastre os itens em Cardápio Digital antes de registrar a primeira venda na Central de pedidos.</p></div> : !filtrados.length ? <div className="flex min-h-full flex-col items-center justify-center text-center"><Search size={24} className="text-ink-400" /><p className="mt-3 text-sm font-semibold text-ink-600">Nenhum item encontrado</p><p className="mt-1 text-xs text-ink-400">Tente outro nome ou limpe a busca.</p></div> : <div className="space-y-2">{filtrados.map((produto) => { const qtd = itens[produto.id] ?? 0; const esgotado = produto.controlaEstoqueUnidades && (produto.estoqueDisponivel ?? 0) <= qtd; return <div key={produto.id} className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 transition-all ${qtd > 0 ? "border-coral-200 bg-coral-050/65" : "border-cream-200 bg-surface"}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{produto.nome}</p><p className="mt-1 text-xs font-medium text-coral-600">R$ {produto.precoVenda.toFixed(2).replace(".", ",")}{produto.controlaEstoqueUnidades ? ` · ${esgotado ? "Esgotado" : `${produto.estoqueDisponivel} disponíveis`}` : ""}</p></div><div className="flex items-center gap-1.5 rounded-xl bg-cream-50 p-1"><button onClick={() => ajustar(produto.id, -1)} disabled={qtd === 0} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 disabled:opacity-30" aria-label={`Remover ${produto.nome}`}><Minus size={15} /></button><strong className="w-6 text-center font-display text-sm text-ink-900">{qtd}</strong><button onClick={() => ajustar(produto.id, 1)} disabled={esgotado} className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-white shadow-sm active:scale-95 disabled:opacity-30" aria-label={`Adicionar ${produto.nome}`}><Plus size={15} /></button></div></div>; })}</div>}</div>
    <footer className="shrink-0 border-t border-cream-200 bg-surface p-4"><div className="mb-3 flex items-end justify-between"><span className="text-xs text-ink-400">{Object.values(itens).reduce((a,b) => a+b,0)} {Object.values(itens).reduce((a,b) => a+b,0) === 1 ? "item" : "itens"}</span><strong className="font-display text-xl tracking-tight text-ink-900">R$ {total.toFixed(2).replace(".", ",")}</strong></div>{erro && <p className="mb-2 rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-600">{erro}</p>}<button onClick={criar} disabled={enviando || Object.keys(itens).length === 0} className="of-btn-primary w-full">{enviando ? "Criando pedido..." : modalidade === "imediata" && !mesaId ? "Concluir venda imediata" : "Enviar para preparo"}<ArrowRight size={16} /></button></footer>
  </div></div>;
}

export function NovoPedidoCentralModal({ onFechar, onCriado, tipoInicial = "balcao", travarTipo = false }: { onFechar: () => void; onCriado: () => void; tipoInicial?: "balcao" | "retirada" | "delivery" | "mesa"; travarTipo?: boolean }) {
  const { dados: produtos } = usePolling<Produto[]>("/api/produtos", 60000);
  const { dados: mesas } = usePolling<Mesa[]>("/api/mesas", 60000);
  const { dados: bairros } = usePolling<BairroEntrega[]>("/api/entrega/bairros", 60000);
  const [tipo, setTipo] = useState<"balcao" | "retirada" | "delivery" | "mesa">(tipoInicial);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  // Cliente novo (delivery/retirada) e nome opcional (balcão/mesa), sem precisar cadastrar antes.
  const [clienteNomeDigitado, setClienteNomeDigitado] = useState("");
  const [clienteTelefoneDigitado, setClienteTelefoneDigitado] = useState("");
  const [nomeAvulso, setNomeAvulso] = useState("");
  const [avisoWhatsapp, setAvisoWhatsapp] = useState(true);
  const [endereco, setEndereco] = useState("");
  const [bairroId, setBairroId] = useState("");
  const [mesaId, setMesaId] = useState("");
  const [modalidade, setModalidade] = useState<"preparo" | "imediata">("preparo");
  const [formaPagamento, setFormaPagamento] = useState<"dinheiro" | "cartao" | "pix">("dinheiro");
  const [tipoCartao, setTipoCartao] = useState<"credito" | "debito">("credito");
  const [trocoPara, setTrocoPara] = useState("");
  const [pixAutomatico, setPixAutomatico] = useState(false);
  const [confirmarRecebimento, setConfirmarRecebimento] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<Record<string, number>>({});
  const [opcoesPorProduto, setOpcoesPorProduto] = useState<Record<string, EscolhaOpcao[]>>({});
  const [produtoConfigurando, setProdutoConfigurando] = useState<Produto | null>(null);
  const [pizzaPorProduto, setPizzaPorProduto] = useState<Record<string, { tamanhoId: string; saborUmId: string; saborDoisId?: string; preco: number; resumo: string }>>({});
  const [pizzaConfigurando, setPizzaConfigurando] = useState<ProdutoLinha | null>(null);
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [cobrancaPix, setCobrancaPix] = useState<{ copiaCola?: string; qrCodeBase64?: string; expiraEm?: string } | null>(null);
  const [chaveIdempotencia] = useState(() => crypto.randomUUID());
  const bairrosAtivos = (bairros ?? []).filter((bairro) => bairro.ativo);
  const bairroSelecionadoId = bairroId || (cliente ? bairrosAtivos.find((bairro) => bairro.nome === cliente.bairro)?.id ?? "" : "");
  const taxaEntrega = bairrosAtivos.find((bairro) => bairro.id === bairroSelecionadoId)?.taxa ?? 0;
  // Nome com tamanho so precisa ser recalculado quando a lista de produtos muda
  // (a cada 60s de polling) — sem isso, cada letra digitada na busca refazia
  // esse map pra lista inteira do cardapio, o que pesa em PC fraco de loja com
  // catalogo grande.
  const linhas: ProdutoLinha[] = useMemo(() => (produtos ?? []).flatMap((produto): ProdutoLinha[] => {
    if (produto.tipoProduto !== "pizza" || !produto.pizzaSaboresLista?.length) return [produto];
    return produto.pizzaSaboresLista.map((sabor) => {
      const valores = Object.values(sabor.precos);
      return { ...produto, id: `${produto.id}~${sabor.id}`, produtoRealId: produto.id, saborFixoId: sabor.id, nome: sabor.nome, precoVenda: valores.length ? Math.min(...valores) : produto.precoVenda };
    });
  }), [produtos]);
  const linhasComNome = useMemo(() => linhas.map((produto) => ({ ...produto, nome: nomeProdutoComTamanho(produto) })), [linhas]);
  const filtrados = useMemo(() => linhasComNome.filter((produto) => !categoriaFiltro || (produto.categoriaNome || "Sem categoria") === categoriaFiltro).filter((produto) => produto.nome.toLowerCase().includes(busca.toLowerCase())), [linhasComNome, categoriaFiltro, busca]);
  const subtotal = useMemo(() => Object.entries(itens).reduce((soma, [id, quantidade]) => soma + (pizzaPorProduto[id]?.preco ?? precoComOpcoes((produtos ?? []).find((produto) => produto.id === idDoProduto(id))?.precoVenda ?? 0, opcoesPorProduto[id] ?? [])) * quantidade, 0), [itens, produtos, opcoesPorProduto, pizzaPorProduto]);

  function selecionarCliente(novoCliente: Cliente) {
    setCliente(novoCliente); setEndereco(novoCliente.endereco ?? ""); setBairroId("");
  }
  function ajustar(id: string, delta: number) {
    setItens((atual) => { const produto = (produtos ?? []).find((item) => item.id === idDoProduto(id)); const quantidade = (atual[id] ?? 0) + delta; if (delta > 0 && produto?.controlaEstoqueUnidades && quantidade > (produto.estoqueDisponivel ?? 0)) { setErro(`${nomeProdutoComTamanho(produto)} está esgotado ou sem saldo suficiente.`); return atual; } if (quantidade <= 0) return Object.fromEntries(Object.entries(atual).filter(([chave]) => chave !== id)); return { ...atual, [id]: quantidade }; });
  }
  async function adicionar(produto: Produto) {
    if (produto.tipoProduto === "pizza") { setPizzaConfigurando(produto); return; }
    const resposta = await fetch(`/api/produtos/${produto.id}/opcoes`);
    const grupos = await resposta.json().catch(() => []);
    if (resposta.ok && Array.isArray(grupos) && grupos.some((grupo) => grupo.ativo && grupo.opcoes?.some((opcao: { ativo: boolean }) => opcao.ativo))) { setProdutoConfigurando(produto); return; }
    ajustar(produto.id, 1);
  }
  async function criar() {
    if (!Object.keys(itens).length) return;
    if (tipo === "delivery" && ((!cliente && !clienteNomeDigitado.trim()) || !endereco.trim() || !bairroSelecionadoId)) { setErro("Informe o nome do cliente, o bairro e o endereço para o delivery."); return; }
    if (tipo === "retirada" && !cliente && !clienteNomeDigitado.trim()) { setErro("Informe o nome do cliente para a retirada."); return; }
    if (tipo === "mesa" && !mesaId) { setErro("Selecione a mesa."); return; }
    if (tipo === "balcao" && modalidade === "imediata" && !pixAutomatico && !confirmarRecebimento) { setErro("Confirme a entrega e o recebimento para concluir a venda imediata."); return; }
    setEnviando(true); setErro("");
    const resposta = await fetch("/api/pedidos", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": chaveIdempotencia }, body: JSON.stringify({
      tipo: tipo === "retirada" ? "balcao" : tipo, formaRecebimento: tipo === "retirada" ? "retirada" : undefined, mesaId: tipo === "mesa" ? mesaId : undefined, modalidade: tipo === "balcao" ? modalidade : "preparo", confirmarRecebimento: tipo === "balcao" && modalidade === "imediata" && !pixAutomatico && confirmarRecebimento, formaPagamento: tipo !== "mesa" ? formaPagamento : undefined, tipoCartao: formaPagamento === "cartao" ? tipoCartao : undefined, trocoPara: formaPagamento === "dinheiro" && trocoPara.trim() ? Number(trocoPara.replace(",", ".")) : undefined, pixAutomatico: formaPagamento === "pix" && pixAutomatico, observacoes: observacoes.trim() || undefined,
      clienteId: (tipo === "delivery" || tipo === "retirada") ? cliente?.id : undefined, clienteNome: (tipo === "delivery" || tipo === "retirada") ? (cliente?.nome ?? (clienteNomeDigitado.trim() || undefined)) : undefined, clienteTelefone: (tipo === "delivery" || tipo === "retirada") && !cliente ? (clienteTelefoneDigitado.trim() || undefined) : undefined, clienteNomeAvulso: (tipo === "balcao" || tipo === "mesa") ? (nomeAvulso.trim() || undefined) : undefined, endereco: tipo === "delivery" ? endereco : undefined, bairroId: tipo === "delivery" ? bairroSelecionadoId : undefined, whatsappConsentimento: tipo === "retirada" && avisoWhatsapp, itens: Object.entries(itens).map(([chave, quantidade]) => ({ produtoId: idDoProduto(chave), quantidade, opcoes: opcoesPorProduto[chave]?.map(({ grupoId, opcaoId }) => ({ grupoId, opcaoId })), pizza: pizzaPorProduto[chave] ? { tamanhoId: pizzaPorProduto[chave].tamanhoId, saborUmId: pizzaPorProduto[chave].saborUmId, saborDoisId: pizzaPorProduto[chave].saborDoisId } : undefined })),
    }) });
    setEnviando(false);
    if (!resposta.ok) { const dados = await resposta.json().catch(() => null); setErro(dados?.erro ?? "Não foi possível criar o pedido."); return; }
    const dados = await resposta.json().catch(() => null);
    if (dados?.cobranca?.copiaCola) { setCobrancaPix(dados.cobranca); return; }
    onCriado();
  }
  return <div className="of-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo pedido"><section className="of-modal-panel flex h-[min(90dvh,760px)] max-w-lg flex-col md:max-w-3xl"><header className="of-panel-header bg-surface"><div><p className="of-eyebrow">Central de pedidos</p><h2 className="font-display text-lg font-bold tracking-tight">Novo pedido</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="space-y-3 border-b border-cream-200 bg-surface p-4"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Tipo de atendimento</span><select value={tipo} onChange={(evento) => { setTipo(evento.target.value as "balcao" | "retirada" | "delivery" | "mesa"); setErro(""); }} disabled={travarTipo} className="of-field disabled:opacity-70"><option value="balcao">Balcão</option><option value="retirada">Retirada</option><option value="delivery">Delivery</option><option value="mesa">Mesa</option></select></label>
      {tipo === "delivery" && <div className="space-y-3 rounded-2xl bg-cream-50 p-3"><ClienteRapido cliente={cliente} nome={clienteNomeDigitado} telefone={clienteTelefoneDigitado} onNome={setClienteNomeDigitado} onTelefone={setClienteTelefoneDigitado} onSelecionar={selecionarCliente} onLimpar={() => { setCliente(null); setClienteNomeDigitado(""); }} /><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Bairro *</span><select value={bairroSelecionadoId} onChange={(evento) => setBairroId(evento.target.value)} className="of-field"><option value="">Selecione o bairro</option>{bairrosAtivos.map((bairro) => <option key={bairro.id} value={bairro.id}>{bairro.nome} · R$ {bairro.taxa.toFixed(2).replace(".", ",")}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Endereço *</span><textarea value={endereco} onChange={(evento) => setEndereco(evento.target.value)} rows={2} maxLength={300} className="of-field resize-none py-2.5 text-base" placeholder="Rua, número e complemento" /></label></div>}
      {tipo === "retirada" && <div className="space-y-3 rounded-2xl bg-cream-50 p-3"><ClienteRapido cliente={cliente} nome={clienteNomeDigitado} telefone={clienteTelefoneDigitado} onNome={setClienteNomeDigitado} onTelefone={setClienteTelefoneDigitado} onSelecionar={selecionarCliente} onLimpar={() => { setCliente(null); setClienteNomeDigitado(""); }} /><label className={`flex items-start gap-2 text-xs ${(cliente?.telefone || clienteTelefoneDigitado.replace(/\D/g, "").length >= 10) ? "text-ink-700" : "text-ink-400"}`}><input type="checkbox" checked={avisoWhatsapp} disabled={!(cliente?.telefone || clienteTelefoneDigitado.replace(/\D/g, "").length >= 10)} onChange={(evento) => setAvisoWhatsapp(evento.target.checked)} className="mt-0.5" />Avisar o cliente por WhatsApp quando o pedido estiver pronto{!(cliente?.telefone || clienteTelefoneDigitado.replace(/\D/g, "").length >= 10) && " (informe o telefone do cliente)"}</label></div>}
      {(tipo === "balcao" || tipo === "mesa") && <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Nome do cliente <span className="font-normal text-ink-400">(opcional)</span></span><input value={nomeAvulso} onChange={(evento) => setNomeAvulso(evento.target.value)} maxLength={80} placeholder="Para chamar o cliente e aparecer na comanda" className="of-field" autoComplete="off" /></label>}
      {tipo === "mesa" && <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Mesa *</span><select value={mesaId} onChange={(evento) => setMesaId(evento.target.value)} className="of-field"><option value="">Selecione a mesa</option>{(mesas ?? []).filter((mesa) => mesa.status !== "reservada").map((mesa) => <option key={mesa.id} value={mesa.id}>Mesa {mesa.numero} · {MESA_STATUS_LABEL[mesa.status]}</option>)}</select></label>}
      {tipo === "balcao" && <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Destino do balcão</span><select value={modalidade} onChange={(evento) => setModalidade(evento.target.value as "preparo" | "imediata")} className="of-field"><option value="preparo">Preparar para retirada</option><option value="imediata">Venda imediata (não envia à cozinha)</option></select></label>}
      {tipo !== "mesa" && <div className="rounded-xl bg-amber-500/10 p-3"><p className="mb-2 text-xs font-bold text-ink-700">Pagamento</p><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => { setFormaPagamento("dinheiro"); setPixAutomatico(false); }} className={`rounded-xl border px-2 py-2 text-left text-xs font-semibold ${formaPagamento === "dinheiro" ? "border-coral-500 bg-coral-100 text-coral-700" : "border-cream-200 bg-white text-ink-600"}`}>Dinheiro</button><button type="button" onClick={() => { setFormaPagamento("cartao"); setPixAutomatico(false); }} className={`rounded-xl border px-2 py-2 text-left text-xs font-semibold ${formaPagamento === "cartao" ? "border-coral-500 bg-coral-100 text-coral-700" : "border-cream-200 bg-white text-ink-600"}`}>Cartão</button><button type="button" onClick={() => setFormaPagamento("pix")} className={`rounded-xl border px-2 py-2 text-left text-xs font-semibold ${formaPagamento === "pix" ? "border-coral-500 bg-coral-100 text-coral-700" : "border-cream-200 bg-white text-ink-600"}`}>Pix</button></div>{formaPagamento === "dinheiro" && <label className="mt-2 block text-xs font-semibold text-ink-700">Troco para:<input inputMode="decimal" value={trocoPara} onChange={(evento) => setTrocoPara(evento.target.value)} placeholder="R$ 0,00" className="of-field mt-1 !min-h-10" /></label>}{formaPagamento === "cartao" && <select value={tipoCartao} onChange={(evento) => setTipoCartao(evento.target.value as "credito" | "debito")} className="mt-2 of-field !min-h-10"><option value="credito">Cartão de crédito</option><option value="debito">Cartão de débito</option></select>}{formaPagamento === "pix" && <><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPixAutomatico(true)} className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold ${pixAutomatico ? "border-coral-500 bg-coral-100 text-coral-700" : "border-cream-200 bg-white text-ink-600"}`}><QrCode size={15} className="mb-1" />Pix automático</button><button type="button" onClick={() => setPixAutomatico(false)} className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold ${!pixAutomatico ? "border-ink-500 bg-ink-100 text-ink-800" : "border-cream-200 bg-white text-ink-600"}`}>{tipo === "delivery" ? "Pix na entrega" : "Pix manual"}</button></div>{pixAutomatico ? <p className="mt-2 text-xs text-ink-600">O QR Code será gerado agora. O pedido só vai à cozinha quando o pagamento for confirmado.</p> : null}</>}{tipo === "balcao" && modalidade === "imediata" && !pixAutomatico ? <label className="mt-2 flex items-start gap-2 text-xs text-ink-700"><input type="checkbox" checked={confirmarRecebimento} onChange={(evento) => setConfirmarRecebimento(evento.target.checked)} className="mt-0.5" />Confirmo que os itens foram entregues e o pagamento foi recebido.</label> : null}</div>}
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Observações do pedido <span className="font-normal text-ink-400">(opcional)</span></span><textarea value={observacoes} onChange={(evento) => setObservacoes(evento.target.value)} rows={2} maxLength={500} placeholder="Ex.: sem cebola, entregar na portaria, ponto da carne..." className="of-field resize-none py-2.5" /></label>
      <div className="relative"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar item do cardápio" className="of-field !pl-10" /></div><div className="md:hidden"><FiltroCategorias produtos={linhas} valor={categoriaFiltro} onChange={setCategoriaFiltro} /></div></div>
    <div className="flex gap-4 p-4"><aside className="sticky top-2 hidden max-h-[calc(90dvh-10rem)] w-52 shrink-0 self-start overflow-y-auto pr-1 md:block"><FiltroCategorias modo="coluna" produtos={linhas} valor={categoriaFiltro} onChange={setCategoriaFiltro} /></aside><div className="min-w-0 flex-1"><div className="space-y-2">{filtrados.map((produto) => { const quantidade = (itens[produto.id] ?? 0) + Object.entries(itens).filter(([chave]) => chave.startsWith(`${produto.id}~o`)).reduce((total, [, qtd]) => total + qtd, 0); const esgotado = produto.controlaEstoqueUnidades && (produto.estoqueDisponivel ?? 0) <= quantidade; const pizza = pizzaPorProduto[produto.id]; return <div key={produto.id} className={`flex min-h-[70px] items-center gap-3 rounded-2xl border p-3 ${quantidade > 0 ? "border-coral-200 bg-coral-050/65" : "border-cream-200 bg-surface"}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{produto.nome}</p><p className="mt-1 text-xs text-coral-600">R$ {(pizza?.preco ?? produto.precoVenda).toFixed(2).replace(".", ",")}{pizza ? ` · ${pizza.resumo}` : opcoesPorProduto[produto.id]?.length ? ` + ${opcoesPorProduto[produto.id].map((opcao) => `R$ ${opcao.acrescimo.toFixed(2).replace(".", ",")}`).join(" + ")}` : ""}</p></div><div className="flex items-center gap-1.5 rounded-xl bg-cream-50 p-1"><button onClick={() => ajustar(produto.id, -1)} disabled={!(itens[produto.id] ?? 0)} className="flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-30"><Minus size={15} /></button><strong className="w-6 text-center text-sm">{quantidade}</strong><button onClick={() => void adicionar(produto)} disabled={esgotado} className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-white disabled:opacity-30"><Plus size={15} /></button></div></div>; })}</div>{Object.entries(itens).some(([chave]) => chave.includes("~")) && <div className="mt-4 rounded-2xl border border-cream-200 bg-cream-50/70 p-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">Itens com escolhas (pão, sabor...)</p><div className="divide-y divide-cream-200">{Object.entries(itens).filter(([chave]) => chave.includes("~")).map(([chave, qtd]) => { const base = (produtos ?? []).find((item) => item.id === idDoProduto(chave)); const pizza = pizzaPorProduto[chave]; const opcoes = opcoesPorProduto[chave] ?? []; const nome = pizza ? (linhas.find((linha) => linha.id === chave)?.nome ?? base?.nome) : base?.nome; const unitario = pizza?.preco ?? precoComOpcoes(base?.precoVenda ?? 0, opcoes); return <div key={chave} className="flex items-center gap-2 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{nome}</p><p className="truncate text-xs text-ink-500">{pizza ? pizza.resumo : opcoes.map((opcao) => opcao.opcaoNome).join(" · ")} · R$ {unitario.toFixed(2).replace(".", ",")}</p></div><div className="flex items-center gap-1 rounded-xl bg-white p-1"><button onClick={() => ajustar(chave, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg" aria-label="Diminuir"><Minus size={14} /></button><strong className="w-5 text-center text-sm">{qtd}</strong><button onClick={() => ajustar(chave, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-white" aria-label="Aumentar"><Plus size={14} /></button></div></div>; })}</div></div>}</div></div>
    </div>
    <footer className="shrink-0 border-t border-cream-200 bg-surface p-4"><div className="mb-3 flex items-end justify-between"><span className="text-xs text-ink-400">{Object.values(itens).reduce((a, b) => a + b, 0)} itens{tipo === "delivery" && taxaEntrega > 0 ? ` · taxa R$ ${taxaEntrega.toFixed(2).replace(".", ",")}` : ""}</span><strong className="font-display text-xl tracking-tight text-ink-900">R$ {(subtotal + (tipo === "delivery" ? taxaEntrega : 0)).toFixed(2).replace(".", ",")}</strong></div>{erro && <p className="mb-2 rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-600">{erro}</p>}<button onClick={() => void criar()} disabled={enviando || !Object.keys(itens).length} className="of-btn-primary w-full">{enviando ? "Criando pedido..." : formaPagamento === "pix" && pixAutomatico ? "Gerar QR Code Pix" : tipo === "balcao" && modalidade === "imediata" ? "Concluir venda imediata" : "Enviar para preparo"}<ArrowRight size={16} /></button></footer>
  {produtoConfigurando && <OpcoesNoPedidoModal produto={produtoConfigurando} selecionadas={[]} onFechar={() => setProdutoConfigurando(null)} onConfirmar={(opcoes) => { const chave = `${produtoConfigurando.id}~o${opcoes.map((opcao) => opcao.opcaoId).sort().join(".")}`; setOpcoesPorProduto((atuais) => ({ ...atuais, [chave]: opcoes })); ajustar(chave, 1); setProdutoConfigurando(null); }} />}{pizzaConfigurando && <PizzaNoPedidoModal produto={pizzaConfigurando} onFechar={() => setPizzaConfigurando(null)} onConfirmar={(pizza) => { const anterior = pizzaPorProduto[pizzaConfigurando.id]; const igual = anterior && anterior.tamanhoId === pizza.tamanhoId && anterior.saborUmId === pizza.saborUmId && anterior.saborDoisId === pizza.saborDoisId; setPizzaPorProduto((atuais) => ({ ...atuais, [pizzaConfigurando.id]: pizza })); if (anterior && !igual) setItens((atual) => ({ ...atual, [pizzaConfigurando.id]: 0 })); ajustar(pizzaConfigurando.id, 1); setPizzaConfigurando(null); }} />}{cobrancaPix && <div className="of-modal-backdrop z-[90]" role="dialog" aria-modal="true" aria-label="QR Code Pix"><section className="of-modal-panel max-w-sm p-5 text-center"><button onClick={() => { setCobrancaPix(null); onCriado(); }} className="of-icon-btn float-right" aria-label="Fechar"><X size={17} /></button><QrCode className="mx-auto mt-2 text-coral-600" size={34} /><h2 className="mt-3 font-display text-xl font-bold">Pix aguardando pagamento</h2><p className="mt-1 text-sm text-ink-600">A cozinha receberá o pedido assim que o Mercado Pago confirmar.</p>{cobrancaPix.qrCodeBase64 && <img src={`data:image/png;base64,${cobrancaPix.qrCodeBase64}`} alt="QR Code Pix" className="mx-auto mt-4 h-52 w-52 rounded-xl" />}{cobrancaPix.copiaCola && <button onClick={() => void navigator.clipboard?.writeText(cobrancaPix.copiaCola!)} className="of-btn-secondary mt-4 w-full"><Copy size={15} />Copiar código Pix</button>}<p className="mt-3 text-xs text-ink-500">Válido até {cobrancaPix.expiraEm ? new Date(cobrancaPix.expiraEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "a expiração configurada"}.</p></section></div>}</section></div>;
}

function PizzaNoPedidoModal({ produto, onFechar, onConfirmar }: { produto: ProdutoLinha; onFechar: () => void; onConfirmar: (pizza: { tamanhoId: string; saborUmId: string; saborDoisId?: string; preco: number; resumo: string }) => void }) {
  type Tamanho = { id: string; nome: string; precoSaborUnico: number; precoMeioAMeio?: number | null; permiteMeioAMeio?: boolean; ativo: boolean };
  type Sabor = { id: string; nome: string; acrescimo: number; permiteMeioAMeio?: boolean; ativo: boolean; precos?: Record<string, number> };
  const [dados, setDados] = useState<{ regraMeioAMeio: "maior_valor" | "media" | "preco_fixo"; tamanhos: Tamanho[]; sabores: Sabor[] } | null>(null);
  type PizzaCombinavel = { produtoId: string; produtoNome: string; tamanhos: { nome: string; precoSaborUnico: number; permiteMeioAMeio?: boolean }[]; sabores: { id: string; nome: string; acrescimo: number; permiteMeioAMeio?: boolean; precos: Record<string, number> }[] };
  const [combinaveis, setCombinaveis] = useState<PizzaCombinavel[] | null>(null);
  const [tamanhoId, setTamanhoId] = useState(""); const [saborUmId, setSaborUmId] = useState(produto.saborFixoId ?? ""); const [saborDoisId, setSaborDoisId] = useState(""); const [erro, setErro] = useState("");
  useEffect(() => { fetch("/api/pizzas/sabores-combinaveis").then((resposta) => resposta.ok ? resposta.json() : null).then((lista) => setCombinaveis(Array.isArray(lista) ? lista : null)).catch(() => setCombinaveis(null)); }, []);
  useEffect(() => { fetch(`/api/produtos/${produto.produtoRealId ?? produto.id}/pizza`).then((resposta) => resposta.ok ? resposta.json() : null).then(setDados).catch(() => setErro("Não foi possível carregar esta pizza.")); }, [produto.id, produto.produtoRealId]);
  const sabores = (dados?.sabores ?? []).filter((sabor) => sabor.ativo);
  const saborFixo = sabores.find((sabor) => sabor.id === produto.saborFixoId);
  const temTabela = (sabor?: Sabor) => Boolean(sabor?.precos && Object.keys(sabor.precos).length);
  // Sabor com tabela de preços só é vendido nos tamanhos em que tem preço.
  const tamanhos = (dados?.tamanhos ?? []).filter((tamanho) => tamanho.ativo && (!saborFixo || !temTabela(saborFixo) || saborFixo.precos?.[tamanho.nome] !== undefined));
  const tamanhoAtual = tamanhos.find((item) => item.id === tamanhoId); const saborUmAtual = sabores.find((item) => item.id === saborUmId);
  const meioAMeioLiberado = tamanhoAtual?.permiteMeioAMeio !== false && saborUmAtual?.permiteMeioAMeio !== false;
  // 2º sabor: de qualquer pizza que tenha o mesmo tamanho (pelo nome), inclusive de outra pizza (doce + salgada).
  // Se a lista geral não carregar, cai no comportamento antigo (só os sabores desta pizza).
  const produtoRealId = produto.produtoRealId ?? produto.id;
  const segundosSaboresBrutos = (combinaveis ?? [{ produtoId: produtoRealId, produtoNome: "", tamanhos: (dados?.tamanhos ?? []).filter((tamanho) => tamanho.ativo), sabores: sabores.map((sabor) => ({ ...sabor, acrescimo: Number(sabor.acrescimo), precos: sabor.precos ?? {} })) }]).flatMap((pizza) => {
    const tamanhoEquivalente = tamanhoAtual && pizza.tamanhos.find((tamanho) => tamanho.nome.trim().toLowerCase() === tamanhoAtual.nome.trim().toLowerCase());
    if (!tamanhoEquivalente || tamanhoEquivalente.permiteMeioAMeio === false) return [];
    return pizza.sabores
      .filter((sabor) => sabor.id !== saborUmId && sabor.permiteMeioAMeio !== false && (!Object.keys(sabor.precos).length || sabor.precos[tamanhoEquivalente.nome] !== undefined))
      .map((sabor) => ({ ...sabor, produtoId: pizza.produtoId, produtoNome: pizza.produtoNome, valor: sabor.precos[tamanhoEquivalente.nome] ?? Number(tamanhoEquivalente.precoSaborUnico) + Number(sabor.acrescimo) }));
  });
  // Cadastros duplicados (mesma pizza e mesmo sabor) aparecem uma vez só.
  const segundosSabores = segundosSaboresBrutos.filter((sabor, indice, todos) => todos.findIndex((outro) => outro.produtoNome === sabor.produtoNome && outro.nome.trim().toLowerCase() === sabor.nome.trim().toLowerCase()) === indice);
  const gruposSegundoSabor = Array.from(new Set(segundosSabores.map((sabor) => sabor.produtoNome)));
  const motivoSemMeio = tamanhoAtual?.permiteMeioAMeio === false ? "Este tamanho é só de um sabor." : saborUmAtual?.permiteMeioAMeio === false ? "O primeiro sabor vai sempre inteiro." : "";
  function confirmar() { const tamanho = tamanhos.find((item) => item.id === tamanhoId); const saborUm = sabores.find((item) => item.id === saborUmId); const saborDois = saborDoisId ? segundosSabores.find((item) => item.id === saborDoisId) : null; if (!tamanho || !saborUm || (saborDoisId && !saborDois) || saborUmId === saborDoisId) { setErro("Escolha tamanho e sabor(es) diferentes."); return; } if (saborDois && !meioAMeioLiberado) { setErro("Essa combinação de meio a meio não é permitida."); return; } const valorNoTamanho = (sabor: Sabor) => sabor.precos?.[tamanho.nome] ?? Number(tamanho.precoSaborUnico) + Number(sabor.acrescimo); const valorUm = valorNoTamanho(saborUm); const valorDois = saborDois ? saborDois.valor : undefined; const preco = !saborDois ? valorUm : dados?.regraMeioAMeio === "maior_valor" ? Math.max(valorUm, valorDois!) : dados?.regraMeioAMeio === "media" ? (valorUm + valorDois!) / 2 : Number(tamanho.precoMeioAMeio); onConfirmar({ tamanhoId, saborUmId, saborDoisId: saborDois?.id, preco, resumo: `${tamanho.nome} · ${saborDois ? `½ ${saborUm.nome} / ½ ${saborDois.nome}` : saborUm.nome}` }); }
  return <div className="of-modal-backdrop z-[80]" role="dialog" aria-modal="true" aria-label={`Montar ${produto.nome}`}><section className="of-modal-panel of-modal-scroll max-w-md p-5"><header className="flex items-start justify-between"><div><p className="of-eyebrow">Monte sua pizza</p><h2 className="font-display text-xl font-bold">{nomeProdutoComTamanho(produto)}</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header>{!dados ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-ink-400" size={20} /></div> : <div className="mt-4 space-y-4"><label className="block text-sm font-bold">Tamanho<select value={tamanhoId} onChange={(evento) => { setTamanhoId(evento.target.value); if (tamanhos.find((item) => item.id === evento.target.value)?.permiteMeioAMeio === false) setSaborDoisId(""); }} className="of-field mt-1"><option value="">Selecione</option>{tamanhos.map((tamanho) => <option key={tamanho.id} value={tamanho.id}>{tamanho.nome} · R$ {Number(tamanho.precoSaborUnico).toFixed(2).replace(".", ",")}</option>)}</select></label>{produto.saborFixoId ? <p className="text-sm font-bold">Sabor<span className="mt-1 block rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-800">{produto.nome}</span></p> : <label className="block text-sm font-bold">Sabor inteiro<select value={saborUmId} onChange={(evento) => { setSaborUmId(evento.target.value); if (sabores.find((item) => item.id === evento.target.value)?.permiteMeioAMeio === false) setSaborDoisId(""); }} className="of-field mt-1"><option value="">Selecione</option>{sabores.map((sabor) => <option key={sabor.id} value={sabor.id}>{sabor.nome}{sabor.precos?.[tamanhoAtual?.nome ?? ""] !== undefined ? ` · R$ ${Number(sabor.precos?.[tamanhoAtual?.nome ?? ""]).toFixed(2).replace(".", ",")}` : Number(sabor.acrescimo) ? ` (+ R$ ${Number(sabor.acrescimo).toFixed(2).replace(".", ",")})` : ""}</option>)}</select></label>}<label className="block text-sm font-bold">Segundo sabor <span className="text-xs font-medium text-ink-400">(opcional, meio a meio)</span><select value={saborDoisId} onChange={(evento) => setSaborDoisId(evento.target.value)} disabled={!meioAMeioLiberado} className="of-field mt-1 disabled:opacity-60"><option value="">Pizza de um sabor</option>{gruposSegundoSabor.map((grupo) => grupo && gruposSegundoSabor.length > 1 ? <optgroup key={grupo} label={grupo}>{segundosSabores.filter((sabor) => sabor.produtoNome === grupo).map((sabor) => <option key={sabor.id} value={sabor.id}>{sabor.nome}</option>)}</optgroup> : segundosSabores.filter((sabor) => sabor.produtoNome === grupo).map((sabor) => <option key={sabor.id} value={sabor.id}>{sabor.nome}</option>))}</select>{motivoSemMeio && <span className="mt-1 block text-xs font-medium text-ink-400">{motivoSemMeio}</span>}</label>{erro && <p className="rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-700">{erro}</p>}<button onClick={confirmar} className="of-btn-primary w-full">Adicionar pizza</button></div>}</section></div>;
}

function OpcoesNoPedidoModal({ produto, selecionadas, onFechar, onConfirmar }: { produto: Produto; selecionadas: EscolhaOpcao[]; onFechar: () => void; onConfirmar: (opcoes: EscolhaOpcao[]) => void }) {
  const [grupos, setGrupos] = useState<{ id: string; nome: string; minimoSelecoes: number; maximoSelecoes: number; definePreco?: boolean; ativo: boolean; opcoes: { id: string; nome: string; acrescimo: number; ativo: boolean }[] }[]>([]);
  const [escolhas, setEscolhas] = useState(selecionadas);
  const [erro, setErro] = useState("");
  useEffect(() => { fetch(`/api/produtos/${produto.id}/opcoes`).then((resposta) => resposta.ok ? resposta.json() : []).then((dados) => setGrupos(Array.isArray(dados) ? dados.filter((grupo) => grupo.ativo) : [])); }, [produto.id]);
  function alternar(grupo: { id: string; maximoSelecoes: number; definePreco?: boolean }, opcao: { id: string; nome: string; acrescimo: number }) {
    const escolha: EscolhaOpcao = { grupoId: grupo.id, opcaoId: opcao.id, acrescimo: Number(opcao.acrescimo), definePreco: grupo.definePreco, opcaoNome: opcao.nome };
    setEscolhas((atuais) => {
      if (atuais.some((item) => item.opcaoId === opcao.id)) return atuais.filter((item) => item.opcaoId !== opcao.id);
      const outras = atuais.filter((item) => item.grupoId !== grupo.id);
      const desteGrupo = atuais.filter((item) => item.grupoId === grupo.id);
      // Resposta única (ex.: pão): a nova escolha troca a anterior.
      if (desteGrupo.length >= grupo.maximoSelecoes) return [...outras, ...desteGrupo.slice(1), escolha].filter((item, indice, todos) => grupo.maximoSelecoes > 1 || item.grupoId !== grupo.id || indice === todos.length - 1);
      return [...atuais, escolha];
    });
  }
  function confirmar() { for (const grupo of grupos) { const quantidade = escolhas.filter((item) => item.grupoId === grupo.id).length; if (quantidade < grupo.minimoSelecoes || quantidade > grupo.maximoSelecoes) { setErro(`Em ${grupo.nome}, escolha entre ${grupo.minimoSelecoes} e ${grupo.maximoSelecoes} opção(ões).`); return; } } onConfirmar(escolhas); }
  return <div className="of-modal-backdrop z-[80]" role="dialog" aria-modal="true" aria-label={`Personalizar ${produto.nome}`}><section className="of-modal-panel of-modal-scroll max-w-md p-5"><header className="flex items-start justify-between"><div><p className="of-eyebrow">Personalize seu item</p><h2 className="font-display text-xl font-bold">{nomeProdutoComTamanho(produto)}</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header><div className="mt-4 space-y-4">{grupos.map((grupo) => <fieldset key={grupo.id}><legend className="text-sm font-bold text-ink-900">{grupo.nome} <span className="text-xs font-medium text-ink-400">{grupo.minimoSelecoes ? `· obrigatório (${grupo.minimoSelecoes})` : "· opcional"}</span></legend><div className="mt-2 space-y-2">{grupo.opcoes.filter((opcao) => opcao.ativo).map((opcao) => { const marcado = escolhas.some((item) => item.opcaoId === opcao.id); return <label key={opcao.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-cream-200 bg-cream-50 px-3 py-2.5 text-sm"><span className="flex items-center gap-2"><input type="checkbox" checked={marcado} onChange={() => alternar(grupo, opcao)} />{opcao.nome}</span><span className="text-xs font-semibold text-coral-600">{Number(opcao.acrescimo) ? `${grupo.definePreco ? "" : "+ "}R$ ${Number(opcao.acrescimo).toFixed(2).replace(".", ",")}` : "Sem acréscimo"}</span></label>; })}</div></fieldset>)}</div>{erro && <p className="mt-3 rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-700">{erro}</p>}<button onClick={confirmar} className="of-btn-primary mt-5 w-full">Adicionar ao pedido</button></section></div>;
}

function DespacharPedidoModal({ pedido, onFechar, onDespachar }: { pedido: Pedido; onFechar: () => void; onDespachar: (entregadorId: string) => Promise<{ erro?: string }> }) {
  const { dados: entregadores } = usePolling<Entregador[]>("/api/entregadores", 10000);
  const [entregadorId, setEntregadorId] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function confirmar() { if (!entregadorId) { setErro("Selecione um entregador."); return; } setEnviando(true); const resultado = await onDespachar(entregadorId); setEnviando(false); if (resultado.erro) setErro(resultado.erro); }
  const ativos = (entregadores ?? []).filter((entregador) => entregador.ativo !== false);
  return <div className="of-modal-backdrop z-[70]" role="dialog" aria-modal="true" aria-label={`Despachar pedido ${pedido.codigo}`}><section className="of-modal-panel of-modal-scroll max-w-sm p-5"><header className="mb-4 flex items-start justify-between"><div><p className="of-eyebrow">Pedido #{pedido.codigo}</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Selecionar entregador</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header><p className="mb-4 text-sm text-ink-600">Escolha quem levará este pedido antes de marcar como saiu para entrega.</p>{ativos.length ? <select value={entregadorId} onChange={(evento) => setEntregadorId(evento.target.value)} className="of-field"><option value="">Selecione o entregador</option>{ativos.map((entregador) => <option key={entregador.id} value={entregador.id}>{entregador.nome}{entregador.cargaAtiva ? ` · ${entregador.cargaAtiva} em rota` : ""}{entregador.veiculo ? ` · ${entregador.veiculo}` : ""}</option>)}</select> : <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">Não há entregador ativo. Cadastre ou ative um na área Delivery.</p>}{erro && <p className="mt-3 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-700">{erro}</p>}<button onClick={() => void confirmar()} disabled={enviando || !ativos.length} className="of-btn-primary mt-5 w-full">{enviando ? "Despachando..." : "Confirmar saída para entrega"}</button></section></div>;
}
