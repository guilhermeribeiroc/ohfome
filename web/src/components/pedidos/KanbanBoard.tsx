"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ArrowRight, Bell, BellOff, BellRing, Check, ChefHat, Clock3, MapPin, MessageSquareText, Minus, PackageCheck, PackageSearch, Plus, Printer, Search, ShoppingBag, Truck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Mesa, Pedido, PedidoStatus, Produto } from "@/lib/types";
import { MESA_STATUS_LABEL, PEDIDO_STATUS_LABEL } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { imprimirPedido } from "@/lib/impressao";

const TODAS_COLUNAS: PedidoStatus[] = ["novo", "em_preparo", "pronto", "saiu_para_entrega", "finalizado"];
const PROXIMO_STATUS: Partial<Record<PedidoStatus, PedidoStatus>> = { novo: "em_preparo", em_preparo: "pronto", pronto: "saiu_para_entrega", saiu_para_entrega: "finalizado" };
const TIPO_LABEL: Record<Pedido["tipo"], string> = { mesa: "Mesa", balcao: "Balcão", delivery: "Delivery" };
const STATUS_ICON: Record<Exclude<PedidoStatus, "cancelado">, LucideIcon> = { novo: Bell, em_preparo: ChefHat, pronto: PackageCheck, saiu_para_entrega: Truck, finalizado: Check };
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

function descricaoPagamento(pedido: Pedido) {
  if (!pedido.formaPagamento) return null;
  if (pedido.formaPagamento === "cartao") return `Cartão · ${pedido.tipoCartao === "credito" ? "Crédito" : "Débito"}`;
  if (pedido.formaPagamento === "dinheiro") return pedido.trocoPara ? `Dinheiro · troco para R$ ${Number(pedido.trocoPara).toFixed(2).replace(".", ",")}` : "Dinheiro · sem troco";
  return "PIX";
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

export function KanbanBoard({ titulo = "Painel de pedidos", subtitulo = "Balcão em tempo real", colunas = TODAS_COLUNAS, permiteCriar = true, permiteCancelar = true, origem, modoCozinha = false }: KanbanBoardProps) {
  const url = origem ? `/api/pedidos?origem=${origem}` : "/api/pedidos";
  const { dados, setDados, recarregar } = usePolling<Pedido[]>(url, 4000);
  const pedidos = dados ?? [];
  const [somAtivo, setSomAtivo] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [pedidoArrastado, setPedidoArrastado] = useState<string | null>(null);
  const [colunaDestino, setColunaDestino] = useState<PedidoStatus | null>(null);
  const [pedidoDetalhe, setPedidoDetalhe] = useState<Pedido | null>(null);
  const [promptNotificar, setPromptNotificar] = useState<{ pedido: Pedido; status: PedidoStatus } | null>(null);
  const [notificando, setNotificando] = useState(false);

  async function moverPedido(pedidoId: string, status: PedidoStatus) {
    const pedidoAtual = pedidos.find((pedido) => pedido.id === pedidoId);
    if (!pedidoAtual || pedidoAtual.status === status) return;
    setDados((lista) => (lista ?? []).map((pedido) => pedido.id === pedidoId ? { ...pedido, status } : pedido));
    const resposta = await fetch(`/api/pedidos/${pedidoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!resposta.ok) { recarregar(); return; }
    if (pedidoAtual.clienteTelefone && status !== "cancelado") {
      setPromptNotificar({ pedido: { ...pedidoAtual, status }, status });
    }
  }

  useEffect(() => {
    if (!promptNotificar) return;
    const t = setTimeout(() => setPromptNotificar(null), 7000);
    return () => clearTimeout(t);
  }, [promptNotificar]);

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

  async function avancarStatus(pedidoId: string, atual: PedidoStatus) {
    const proximo = PROXIMO_STATUS[atual]; if (!proximo) return;
    await moverPedido(pedidoId, proximo);
  }

  function iniciarArraste(evento: DragEvent<HTMLElement>, pedidoId: string) {
    evento.dataTransfer.setData("text/ohfome-pedido", pedidoId);
    evento.dataTransfer.effectAllowed = "move";
    setPedidoArrastado(pedidoId);
  }

  async function soltarPedido(evento: DragEvent<HTMLElement>, status: PedidoStatus) {
    evento.preventDefault();
    const pedidoId = evento.dataTransfer.getData("text/ohfome-pedido");
    setPedidoArrastado(null); setColunaDestino(null);
    if (pedidoId) await moverPedido(pedidoId, status);
  }

  async function cancelarPedido(pedidoId: string) {
    setDados((lista) => (lista ?? []).map((pedido) => pedido.id === pedidoId ? { ...pedido, status: "cancelado" } : pedido));
    await fetch(`/api/pedidos/${pedidoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelado" }) });
    recarregar();
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


      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:grid lg:snap-none lg:overflow-visible" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}>
        {colunas.map((status) => {
          const itens = pedidos.filter((pedido) => pedido.status === status);
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
                  <article key={pedido.id} draggable onClick={() => setPedidoDetalhe(pedido)} onKeyDown={(evento) => { if (evento.key === "Enter") setPedidoDetalhe(pedido); }} tabIndex={0} role="button" onDragStart={(evento) => iniciarArraste(evento, pedido.id)} onDragEnd={() => { setPedidoArrastado(null); setColunaDestino(null); }} className={`group cursor-grab rounded-2xl border border-cream-200/80 bg-surface p-3.5 shadow-sm transition-all duration-200 active:cursor-grabbing hover:-translate-y-0.5 hover:border-cream-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 ${pedidoArrastado === pedido.id ? "opacity-45" : ""}`}>
                    <div className="flex items-start justify-between gap-3"><div><span className="font-display text-base font-bold tracking-tight text-ink-900">#{pedido.codigo}</span><p className="mt-0.5 text-[11px] text-ink-400">{pedido.formaRecebimento === "entrega" ? "Entrega" : pedido.formaRecebimento === "retirada" ? "Retirada" : TIPO_LABEL[pedido.tipo]}{pedido.mesaNumero ? ` · Mesa ${pedido.mesaNumero}` : ""}{pedido.clienteNome ? ` · ${pedido.clienteNome}` : ""}</p></div><span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-400"><Clock3 size={12} />{tempoDecorrido(pedido.createdAt)}</span></div>
                    <ul className="my-3 space-y-1.5 border-y border-cream-100 py-3">{pedido.itens.map((item) => <li key={item.id} className="flex gap-2 text-xs leading-5 text-ink-600"><b className="font-semibold text-ink-900">{item.quantidade}×</b><span>{item.produtoNome}</span></li>)}</ul>
                    {(pedido.enderecoEntrega || pedido.observacoes) && <div className="mb-3 space-y-1.5 rounded-xl bg-cream-50 p-2.5 text-[11px] leading-4 text-ink-600">{pedido.enderecoEntrega && <p className="flex gap-1.5"><MapPin size={13} className="mt-0.5 shrink-0 text-coral-600" /><span><b className="font-semibold text-ink-800">Entrega:</b> {pedido.enderecoEntrega}</span></p>}{pedido.observacoes && <p className="flex gap-1.5"><MessageSquareText size={13} className="mt-0.5 shrink-0 text-coral-600" /><span><b className="font-semibold text-ink-800">Obs.:</b> {pedido.observacoes}</span></p>}</div>}
                    <div className="flex items-center justify-between gap-2"><strong className="whitespace-nowrap font-display text-sm font-bold text-ink-900">R$ {pedido.total.toFixed(2).replace(".", ",")}</strong>{permiteCancelar && status === "novo" && <button onClick={(evento) => { evento.stopPropagation(); void cancelarPedido(pedido.id); }} className="flex h-10 w-10 items-center justify-center rounded-xl text-danger-600 transition hover:bg-danger-050" aria-label={`Cancelar pedido ${pedido.codigo}`}><X size={15} /></button>}</div>{status !== "finalizado" && <button onClick={(evento) => { evento.stopPropagation(); void avancarStatus(pedido.id, pedido.status); }} className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-900 px-3 text-[11px] font-semibold text-white transition active:scale-95">Avançar <ArrowRight size={13} /></button>}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {modalAberto && <NovoPedidoModal onFechar={() => setModalAberto(false)} onCriado={() => { setModalAberto(false); if (somAtivo) playBeep(); recarregar(); }} />}
      {pedidoDetalhe && <PedidoDetalheModal pedido={pedidoDetalhe} onFechar={() => setPedidoDetalhe(null)} onNotificar={(pedido) => { setPedidoDetalhe(null); setPromptNotificar({ pedido, status: pedido.status }); }} permitirReimpressao={modoCozinha} />}

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
    </section>
  );
}

function PedidoDetalheModal({ pedido, onFechar, onNotificar, permitirReimpressao }: { pedido: Pedido; onFechar: () => void; onNotificar: (pedido: Pedido) => void; permitirReimpressao: boolean }) {
  const pagamento = descricaoPagamento(pedido);
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
    <section className="of-modal-panel flex max-h-[90dvh] max-w-lg flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-cream-200 p-5"><div><p className="of-eyebrow">Pedido #{pedido.codigo}</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Detalhes do pedido</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar detalhes"><X size={17} /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><div className="rounded-2xl bg-cream-50 p-3.5 text-sm"><p className="font-semibold text-ink-900">{pedido.clienteNome || (pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : "Pedido no balcão")}</p>{pedido.clienteTelefone && <p className="mt-1 text-xs text-ink-500">WhatsApp: {pedido.clienteTelefone}</p>}{pedido.enderecoEntrega && <p className="mt-2 flex gap-1.5 text-xs leading-5 text-ink-600"><MapPin size={13} className="mt-0.5 shrink-0 text-coral-600" />{pedido.enderecoEntrega}</p>}{pagamento && <p className="mt-2 text-xs font-medium text-ink-700">Pagamento: {pagamento}</p>}{pedido.observacoes && <p className="mt-2 flex gap-1.5 text-xs leading-5 text-ink-600"><MessageSquareText size={13} className="mt-0.5 shrink-0 text-coral-600" />{pedido.observacoes}</p>}{pedido.clienteTelefone && <button onClick={() => onNotificar(pedido)} className="mt-3 flex min-h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-3 text-xs font-semibold text-white transition active:scale-95"><Bell size={13} /> Notificar cliente</button>}</div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">Itens do pedido</p><ul className="divide-y divide-cream-100 rounded-2xl border border-cream-200 bg-surface px-3.5">{pedido.itens.map((item) => <li key={item.id} className="py-3"><div className="flex items-center justify-between gap-3 text-sm"><span><b className="mr-2 text-ink-900">{item.quantidade}×</b>{item.produtoNome}</span><b className="shrink-0 text-ink-900">R$ {(item.precoUnitario * item.quantidade).toFixed(2).replace(".", ",")}</b></div>{item.observacoes && <p className="mt-1 pl-6 text-xs text-ink-500">Obs.: {item.observacoes}</p>}</li>)}</ul></div></div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 bg-surface p-5"><div className="flex flex-wrap gap-2"><button onClick={() => imprimirPedido(pedido, pedido.mesaNumero ? "Comanda da mesa" : "Via do pedido")} className="of-btn-secondary min-h-11 px-3"><Printer size={16} /> Imprimir</button>{permitirReimpressao && <button onClick={() => void reimprimirNaCozinha()} disabled={reimprimindo} className="of-btn-secondary min-h-11 px-3"><Printer size={16} /> {reimprimindo ? "Enviando..." : "Reimprimir cozinha"}</button>}{mensagemImpressao && <p className="basis-full text-xs text-ink-500">{mensagemImpressao}</p>}</div><div className="text-right"><span className="block text-xs text-ink-400">{pedido.formaRecebimento === "entrega" ? "Entrega" : pedido.formaRecebimento === "retirada" ? "Retirada" : TIPO_LABEL[pedido.tipo]}</span><strong className="font-display text-xl font-bold text-ink-900">R$ {pedido.total.toFixed(2).replace(".", ",")}</strong></div></footer>
    </section>
  </div>;
}

function NovoPedidoModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const { dados: produtos } = usePolling<Produto[]>("/api/produtos", 60000);
  const { dados: mesas } = usePolling<Mesa[]>("/api/mesas", 60000);
  const [itens, setItens] = useState<Record<string, number>>({}); const [busca, setBusca] = useState(""); const [mesaId, setMesaId] = useState(""); const [enviando, setEnviando] = useState(false); const [erro, setErro] = useState("");
  const filtrados = (produtos ?? []).filter((produto) => produto.nome.toLowerCase().includes(busca.toLowerCase()));
  const total = useMemo(() => Object.entries(itens).reduce((soma, [id, qtd]) => soma + ((produtos ?? []).find((produto) => produto.id === id)?.precoVenda ?? 0) * qtd, 0), [itens, produtos]);

  function ajustar(id: string, delta: number) { setItens((atual) => { const qtd = (atual[id] ?? 0) + delta; if (qtd <= 0) return Object.fromEntries(Object.entries(atual).filter(([chave]) => chave !== id)); return { ...atual, [id]: qtd }; }); }
  async function criar() { if (Object.keys(itens).length === 0) return; setEnviando(true); setErro(""); const res = await fetch("/api/pedidos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: mesaId ? "mesa" : "balcao", mesaId: mesaId || undefined, itens: Object.entries(itens).map(([produtoId, quantidade]) => ({ produtoId, quantidade })) }) }); setEnviando(false); if (!res.ok) { const dados = await res.json().catch(() => null); setErro(dados?.erro ?? "Não foi possível criar o pedido."); return; } onCriado(); }

  return <div className="of-modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo pedido"><div className="of-modal-panel flex h-[min(90dvh,720px)] max-w-lg flex-col">
    <header className="of-panel-header bg-surface"><div><p className="of-eyebrow">Balcão</p><h2 className="font-display text-lg font-bold tracking-tight">Novo pedido</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header>
    <div className="space-y-3 border-b border-cream-200 bg-surface p-4"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Mesa (opcional)</span><select value={mesaId} onChange={(evento) => setMesaId(evento.target.value)} className="of-field"><option value="">Pedido no balcão</option>{(mesas ?? []).filter((mesa) => mesa.status !== "reservada").map((mesa) => <option key={mesa.id} value={mesa.id}>Mesa {mesa.numero} · {MESA_STATUS_LABEL[mesa.status]}</option>)}</select></label><div className="relative"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item do cardápio" className="of-field !pl-10" /></div></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">{!(produtos ?? []).length ? <div className="flex min-h-full flex-col items-center justify-center rounded-2xl border border-dashed border-cream-300 bg-cream-50/60 px-6 text-center"><PackageSearch size={28} className="text-coral-500" /><p className="mt-3 text-sm font-semibold text-ink-900">Nenhum produto cadastrado</p><p className="mt-1 max-w-xs text-xs leading-5 text-ink-400">Cadastre os itens em Cardápio Digital antes de registrar a primeira venda no balcão.</p></div> : !filtrados.length ? <div className="flex min-h-full flex-col items-center justify-center text-center"><Search size={24} className="text-ink-400" /><p className="mt-3 text-sm font-semibold text-ink-600">Nenhum item encontrado</p><p className="mt-1 text-xs text-ink-400">Tente outro nome ou limpe a busca.</p></div> : <div className="space-y-2">{filtrados.map((produto) => { const qtd = itens[produto.id] ?? 0; return <div key={produto.id} className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 transition-all ${qtd > 0 ? "border-coral-200 bg-coral-050/65" : "border-cream-200 bg-surface"}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{produto.nome}</p><p className="mt-1 text-xs font-medium text-coral-600">R$ {produto.precoVenda.toFixed(2).replace(".", ",")}</p></div><div className="flex items-center gap-1.5 rounded-xl bg-cream-50 p-1"><button onClick={() => ajustar(produto.id, -1)} disabled={qtd === 0} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 disabled:opacity-30" aria-label={`Remover ${produto.nome}`}><Minus size={15} /></button><strong className="w-6 text-center font-display text-sm text-ink-900">{qtd}</strong><button onClick={() => ajustar(produto.id, 1)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-white shadow-sm active:scale-95" aria-label={`Adicionar ${produto.nome}`}><Plus size={15} /></button></div></div>; })}</div>}</div>
    <footer className="shrink-0 border-t border-cream-200 bg-surface p-4"><div className="mb-3 flex items-end justify-between"><span className="text-xs text-ink-400">{Object.values(itens).reduce((a,b) => a+b,0)} {Object.values(itens).reduce((a,b) => a+b,0) === 1 ? "item" : "itens"}</span><strong className="font-display text-xl tracking-tight text-ink-900">R$ {total.toFixed(2).replace(".", ",")}</strong></div>{erro && <p className="mb-2 rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-600">{erro}</p>}<button onClick={criar} disabled={enviando || Object.keys(itens).length === 0} className="of-btn-primary w-full">{enviando ? "Criando pedido..." : "Criar pedido"}<ArrowRight size={16} /></button></footer>
  </div></div>;
}
