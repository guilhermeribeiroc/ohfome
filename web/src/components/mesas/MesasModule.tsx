"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Banknote, Check, CreditCard, DoorOpen, Minus, Plus, Printer, QrCode, Search, Settings2, Users, X } from "lucide-react";
import type { Mesa, MesaStatus, Pedido, Produto } from "@/lib/types";
import { MESA_STATUS_LABEL, nomeProdutoComTamanho } from "@/lib/types";
import { mascararMoeda, numeroDaMoeda } from "@/lib/moeda";
import { usePolling } from "@/lib/use-polling";

const GRADIENTE_CORAL = "linear-gradient(120deg, var(--color-coral-600), var(--color-coral-500), var(--color-mango-500))";

const STATUS_STYLE: Record<MesaStatus, string> = {
  livre: "bg-cream-100 text-ink-600",
  ocupada: "bg-coral-050 text-coral-600 shadow-md shadow-coral-500/15 ring-2 ring-coral-400/50",
  aguardando_conta: "bg-mango-400/10 text-mango-500 shadow-md shadow-mango-500/15 ring-2 ring-mango-400/50",
  reservada: "bg-status-em_preparo/10 text-status-em_preparo shadow-md shadow-status-em_preparo/15 ring-2 ring-status-em_preparo/50",
};

const STATUS_DOT: Record<MesaStatus, string> = {
  livre: "bg-ink-400",
  ocupada: "bg-coral-500",
  aguardando_conta: "bg-mango-500",
  reservada: "bg-status-em_preparo",
};

const FORMAS_PAGAMENTO = [
  { formaPagamento: "dinheiro" as const, tipoCartao: undefined, label: "Dinheiro", texto: "Dinheiro · sem troco", icon: Banknote },
  { formaPagamento: "pix" as const, tipoCartao: undefined, label: "Pix", texto: "PIX", icon: QrCode },
  { formaPagamento: "cartao" as const, tipoCartao: "debito" as const, label: "Débito", texto: "Cartão · Débito", icon: CreditCard },
  { formaPagamento: "cartao" as const, tipoCartao: "credito" as const, label: "Crédito", texto: "Cartão · Crédito", icon: CreditCard },
];

interface ItemLancado {
  produtoId: string;
  nome: string;
  precoUnitario: number;
  quantidade: number;
}

export function MesasModule() {
  const { dados: mesas, recarregar: recarregarMesas } = usePolling<Mesa[]>("/api/mesas", 5000);
  const { dados: produtos } = usePolling<Produto[]>("/api/produtos", 60000);
  const { dados: pedidos } = usePolling<Pedido[]>("/api/pedidos", 5000);

  const [mesaAbertaId, setMesaAbertaId] = useState<string | null>(null);
  const [itensPorMesa, setItensPorMesa] = useState<Record<string, ItemLancado[]>>({});
  const [obsPorMesa, setObsPorMesa] = useState<Record<string, string>>({});
  const [pagamentoPorMesa, setPagamentoPorMesa] = useState<Record<string, number | null>>({});
  const [enviando, setEnviando] = useState(false);
  const [enviados, setEnviados] = useState<Record<string, boolean>>({});
  const [gerenciarAberto, setGerenciarAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [fecharContaAberto, setFecharContaAberto] = useState(false);

  const mesaAberta = (mesas ?? []).find((m) => m.id === mesaAbertaId) ?? null;
  const itensAtuais = useMemo(() => mesaAbertaId ? itensPorMesa[mesaAbertaId] ?? [] : [], [itensPorMesa, mesaAbertaId]);
  const obsAtual = mesaAbertaId ? obsPorMesa[mesaAbertaId] ?? "" : "";
  const pagamentoAtualIndice = mesaAbertaId ? pagamentoPorMesa[mesaAbertaId] ?? null : null;
  const totalAtual = useMemo(
    () => itensAtuais.reduce((soma, item) => soma + item.precoUnitario * item.quantidade, 0),
    [itensAtuais]
  );
  const pedidosDaMesa = useMemo(
    () => mesaAberta ? (pedidos ?? []).filter((pedido) => pedido.mesaNumero === mesaAberta.numero) : [],
    [mesaAberta, pedidos]
  );
  const totalComanda = useMemo(
    () => pedidosDaMesa.reduce((soma, pedido) => soma + Number(pedido.total), 0) + totalAtual,
    [pedidosDaMesa, totalAtual]
  );

  function abrirMesa(mesa: Mesa) {
    navigator.vibrate?.(12);
    setMesaAbertaId(mesa.id);
  }

  function ajustarItem(produto: Produto, delta: number) {
    if (!mesaAbertaId) return;
    if (delta > 0) navigator.vibrate?.(10);
    setItensPorMesa((atual) => {
      const lista = atual[mesaAbertaId] ?? [];
      const existente = lista.find((i) => i.produtoId === produto.id);
      let novaLista: ItemLancado[];
      if (existente) {
        const novaQtd = existente.quantidade + delta;
        novaLista =
          novaQtd <= 0
            ? lista.filter((i) => i.produtoId !== produto.id)
            : lista.map((i) => (i.produtoId === produto.id ? { ...i, quantidade: novaQtd } : i));
      } else if (delta > 0) {
        novaLista = [...lista, { produtoId: produto.id, nome: nomeProdutoComTamanho(produto), precoUnitario: produto.precoVenda, quantidade: 1 }];
      } else {
        novaLista = lista;
      }
      return { ...atual, [mesaAbertaId]: novaLista };
    });
  }

  async function lancarPedido() {
    if (!mesaAbertaId || itensAtuais.length === 0) return;
    setEnviando(true);
    const observacoes = obsPorMesa[mesaAbertaId]?.trim();
    const pagamento = pagamentoAtualIndice !== null ? FORMAS_PAGAMENTO[pagamentoAtualIndice] : null;
    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "mesa",
        mesaId: mesaAbertaId,
        itens: itensAtuais.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, observacoes: observacoes || undefined })),
        formaPagamento: pagamento?.formaPagamento,
        tipoCartao: pagamento?.tipoCartao,
      }),
    });
    setEnviando(false);
    if (!res.ok) return;

    setItensPorMesa((atual) => ({ ...atual, [mesaAbertaId]: [] }));
    setObsPorMesa((atual) => ({ ...atual, [mesaAbertaId]: "" }));
    setPagamentoPorMesa((atual) => ({ ...atual, [mesaAbertaId]: null }));
    setEnviados((atual) => ({ ...atual, [mesaAbertaId]: true }));
    recarregarMesas();
    setTimeout(() => setEnviados((atual) => ({ ...atual, [mesaAbertaId]: false })), 2500);
  }

  async function confirmarFechamento(pagamento: { formaPagamento: "dinheiro" | "pix" | "cartao"; tipoCartao?: "credito" | "debito"; trocoPara?: number; texto: string }) {
    if (!mesaAberta) return;
    // Imprime primeiro (ainda dentro do clique do usuario, senao o navegador
    // bloqueia o popup) e so depois libera a mesa no servidor.
    imprimirComanda(pagamento.texto);
    const resposta = await fetch(`/api/mesas/${mesaAberta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "livre", formaPagamento: pagamento.formaPagamento, tipoCartao: pagamento.tipoCartao, trocoPara: pagamento.trocoPara }),
    });
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => null);
      alert(dados?.erro ?? "Não foi possível fechar a conta.");
      return;
    }
    navigator.vibrate?.(12);
    setFecharContaAberto(false);
    setMesaAbertaId(null);
    recarregarMesas();
  }

  function imprimirComanda(pagamentoTexto?: string) {
    if (!mesaAberta) return;
    const escapar = (valor: string) => valor.replace(/[&<>"']/g, (caractere) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[caractere] ?? caractere);
    const itens = [
      ...pedidosDaMesa.flatMap((pedido) => pedido.itens.map((item) => ({ nome: item.produtoNome, quantidade: item.quantidade, valor: item.precoUnitario * item.quantidade }))),
      ...itensAtuais.map((item) => ({ nome: item.nome, quantidade: item.quantidade, valor: item.precoUnitario * item.quantidade })),
    ];
    const janela = window.open("", "_blank", "width=420,height=700");
    if (!janela) return;
    janela.document.write(`<!doctype html><html><head><title>Comanda mesa ${mesaAberta.numero}</title><style>body{font:14px Arial,sans-serif;color:#171717;padding:20px}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#666}.pagamento{display:inline-block;background:#f3eee7;border-radius:99px;padding:5px 12px;font-size:12px;font-weight:700;color:#8d3c29;margin-bottom:14px}.item{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px dashed #bbb}.total{display:flex;justify-content:space-between;font-size:18px;font-weight:700;margin-top:18px;padding-top:12px;border-top:2px solid #171717}@media print{body{padding:0}}</style></head><body><h1>Comanda · Mesa ${mesaAberta.numero}</h1><p>${new Date().toLocaleString("pt-BR")}</p>${pagamentoTexto ? `<span class="pagamento">Pagamento: ${escapar(pagamentoTexto)}</span>` : ""}${itens.length ? itens.map((item) => `<div class="item"><span>${item.quantidade}× ${escapar(item.nome)}</span><strong>R$ ${item.valor.toFixed(2).replace(".", ",")}</strong></div>`).join("") : "<p>Sem itens lançados.</p>"}<div class="total"><span>Total${pagamentoTexto ? "" : " parcial"}</span><span>R$ ${totalComanda.toFixed(2).replace(".", ",")}</span></div><script>window.onload=()=>window.print()<\/script></body></html>`);
    janela.document.close();
  }

  return (
    <div className="of-page">
      <div className="of-page-header">
        <div><p className="of-eyebrow">Salão em tempo real</p>
          <h1 className="of-title">Mesas & Garçom</h1>
          <p className="of-subtitle">Toque em uma mesa para abrir a comanda e lançar itens com rapidez.</p>
        </div>
        <button
          onClick={() => setGerenciarAberto(true)}
          className="of-btn-secondary"
        >
          <Settings2 size={16} /> Gerenciar mesas
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {(mesas ?? []).map((mesa) => (
          <button
            key={mesa.id}
            onClick={() => abrirMesa(mesa)}
            className={`group relative flex min-h-36 flex-col items-start justify-between overflow-hidden rounded-[1.35rem] border border-cream-200 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[.98] ${STATUS_STYLE[mesa.status]}`}
          >
            <div className="flex w-full items-center justify-between"><span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[mesa.status]}`} /><ArrowRight size={15} className="opacity-35 transition-transform group-hover:translate-x-0.5" /></div>
            <div><span className="block font-display text-3xl font-bold tracking-[-.06em]">{String(mesa.numero).padStart(2, "0")}</span><span className="mt-1 block text-[11px] font-semibold">{MESA_STATUS_LABEL[mesa.status]}</span></div>
            <span className="inline-flex items-center gap-1.5 text-[10px] opacity-65"><Users size={12} />{mesa.capacidade} lugares</span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-4 text-xs font-medium text-ink-400">
        {(Object.keys(MESA_STATUS_LABEL) as MesaStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s]}`} />
            {MESA_STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {mesaAberta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-cream-50 md:left-[272px]">
          <div className="flex items-center justify-between gap-2 border-b border-cream-200 bg-surface/95 p-4 backdrop-blur sm:p-5">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-ink-900">Mesa {mesaAberta.numero}</p>
              <p className="text-xs text-ink-400">{mesaAberta.capacidade} lugares</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {mesaAberta.status !== "livre" && (
                <button
                  onClick={() => setFecharContaAberto(true)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-basil-050 px-3.5 text-xs font-semibold text-basil-700 transition active:scale-95"
                >
                  <DoorOpen size={16} /> Desocupar
                </button>
              )}
              <button onClick={() => setMesaAbertaId(null)} className="of-icon-btn shrink-0" aria-label="Fechar comanda"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-5xl">{pedidosDaMesa.length > 0 && <section className="mb-5 rounded-2xl border border-cream-200 bg-surface p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-400">Comanda em aberto</p><p className="mt-1 text-sm font-semibold text-ink-900">{pedidosDaMesa.length} lançamento(s) já enviado(s)</p></div><strong className="font-display text-lg text-ink-900">R$ {pedidosDaMesa.reduce((soma, pedido) => soma + Number(pedido.total), 0).toFixed(2).replace(".", ",")}</strong></div><div className="space-y-2">{pedidosDaMesa.flatMap((pedido) => pedido.itens).map((item, indice) => <div key={`${item.id}-${indice}`} className="flex justify-between gap-3 text-sm"><span className="text-ink-600"><b className="mr-2 text-ink-900">{item.quantidade}×</b>{item.produtoNome}</span><span className="font-medium text-ink-800">R$ {(item.precoUnitario * item.quantidade).toFixed(2).replace(".", ",")}</span></div>)}</div></section>}<div className="sticky top-0 z-10 -mx-1 mb-4 bg-cream-50/95 px-1 pb-3 backdrop-blur"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-ink-400">Adicionar nova rodada</p><div className="relative"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item do cardápio" className="of-field pl-10" /></div></div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {(produtos ?? []).filter((produto) => produto.nome.toLowerCase().includes(busca.toLowerCase())).map((produto) => {
                const qtd = itensAtuais.find((i) => i.produtoId === produto.id)?.quantidade ?? 0;
                return (
                  <div
                    key={produto.id}
                    className={`flex min-h-[78px] items-center justify-between rounded-2xl border p-3.5 transition-all ${qtd > 0 ? "border-coral-400/50 bg-coral-050 shadow-sm" : "border-cream-200 bg-surface"}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{nomeProdutoComTamanho(produto)}</p>
                      <p className="text-xs text-ink-400">R$ {produto.precoVenda.toFixed(2).replace(".", ",")}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => ajustarItem(produto, -1)}
                        className="of-icon-btn !h-11 !min-h-11 !w-11"
                        aria-label={`Remover ${produto.nome}`}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-4 text-center text-sm font-bold text-ink-900">{qtd}</span>
                      <button
                        onClick={() => ajustarItem(produto, 1)}
                        className="of-icon-btn !h-11 !min-h-11 !w-11 !border-ink-900 !bg-ink-900 !text-white"
                        aria-label={`Adicionar ${produto.nome}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div></div>
          </div>

          <div className="border-t border-cream-200 bg-surface/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:p-5">
            {itensAtuais.length > 0 && (
              <label className="mb-3 block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[.1em] text-ink-400">Observações desta rodada (opcional)</span>
                <textarea
                  value={obsAtual}
                  onChange={(e) => mesaAbertaId && setObsPorMesa((atual) => ({ ...atual, [mesaAbertaId]: e.target.value }))}
                  placeholder="Ex.: sem cebola, ponto da carne, tirar pimenta..."
                  rows={2}
                  className="of-field resize-none text-sm"
                />
              </label>
            )}
            {itensAtuais.length > 0 && (
              <div className="mb-3">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[.1em] text-ink-400">Forma de pagamento (opcional)</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {FORMAS_PAGAMENTO.map((opcao, indice) => {
                    const Icon = opcao.icon;
                    const ativo = pagamentoAtualIndice === indice;
                    return (
                      <button
                        key={opcao.label}
                        type="button"
                        onClick={() => mesaAbertaId && setPagamentoPorMesa((atual) => ({ ...atual, [mesaAbertaId]: ativo ? null : indice }))}
                        className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-center transition-all active:scale-95 ${ativo ? "border-ink-900 bg-ink-900 text-white" : "border-cream-200 bg-cream-50 text-ink-500"}`}
                        aria-pressed={ativo}
                      >
                        <Icon size={16} />
                        <span className="text-[10px] font-semibold leading-none">{opcao.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-ink-400">{itensAtuais.length} item(ns) nesta rodada · Total da mesa</span>
              <span className="font-display text-lg font-bold text-ink-900">
                R$ {totalComanda.toFixed(2).replace(".", ",")}
              </span>
            </div>
            <div className="flex gap-2"><button onClick={() => imprimirComanda()} className="of-btn-secondary min-h-12 shrink-0 px-4" aria-label="Imprimir comanda"><Printer size={17} /><span className="hidden sm:inline">Imprimir</span></button><button onClick={lancarPedido} disabled={itensAtuais.length === 0 || enviando} className="of-btn-primary flex-1">{enviando ? "Lançando..." : enviados[mesaAbertaId ?? ""] ? <><Check size={17} /> Pedido lançado</> : <>Lançar pedido <ArrowRight size={17} /></>}</button></div>
          </div>
        </div>
      )}

      {fecharContaAberto && mesaAberta && (
        <FecharContaModal
          mesa={mesaAberta}
          total={totalComanda}
          onFechar={() => setFecharContaAberto(false)}
          onConfirmar={confirmarFechamento}
        />
      )}

      {gerenciarAberto && (
        <GerenciarMesasModal
          mesas={mesas ?? []}
          onFechar={() => setGerenciarAberto(false)}
          onAlterou={recarregarMesas}
        />
      )}
    </div>
  );
}

function FecharContaModal({
  mesa,
  total,
  onFechar,
  onConfirmar,
}: {
  mesa: Mesa;
  total: number;
  onFechar: () => void;
  onConfirmar: (pagamento: { formaPagamento: "dinheiro" | "pix" | "cartao"; tipoCartao?: "credito" | "debito"; trocoPara?: number; texto: string }) => Promise<void>;
}) {
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoPara, setTrocoPara] = useState("");
  const [enviando, setEnviando] = useState(false);

  const opcaoSelecionada = selecionado !== null ? FORMAS_PAGAMENTO[selecionado] : null;
  const ehDinheiro = opcaoSelecionada?.formaPagamento === "dinheiro";
  const trocoInvalido = ehDinheiro && precisaTroco && numeroDaMoeda(trocoPara) <= 0;

  function selecionar(indice: number) {
    navigator.vibrate?.(8);
    setSelecionado(indice);
    setPrecisaTroco(false);
    setTrocoPara("");
  }

  async function confirmar() {
    if (selecionado === null || trocoInvalido) return;
    const opcao = FORMAS_PAGAMENTO[selecionado];
    setEnviando(true);
    await onConfirmar({
      formaPagamento: opcao.formaPagamento,
      tipoCartao: opcao.tipoCartao,
      trocoPara: ehDinheiro && precisaTroco ? numeroDaMoeda(trocoPara) : undefined,
      texto: ehDinheiro && precisaTroco && numeroDaMoeda(trocoPara) > 0
        ? `Dinheiro · troco para R$ ${numeroDaMoeda(trocoPara).toFixed(2).replace(".", ",")}`
        : opcao.texto,
    });
    setEnviando(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-900/45 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={`Fechar conta da mesa ${mesa.numero}`}>
      <div className="flex w-full max-w-sm flex-col rounded-t-[2rem] bg-surface shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-start justify-between p-5 pb-4">
          <div>
            <p className="of-eyebrow">Mesa {mesa.numero}</p>
            <p className="font-display text-lg font-bold leading-tight text-ink-900">Como foi pago?</p>
          </div>
          <button onClick={onFechar} className="of-icon-btn shrink-0" aria-label="Cancelar"><X size={17} /></button>
        </div>

        <div className="px-5">
          <div className="rounded-2xl bg-cream-50 px-4 py-3.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-ink-400">Total da conta</p>
            <p className="mt-0.5 font-display text-[1.7rem] font-bold leading-none tracking-tight text-ink-900">R$ {total.toFixed(2).replace(".", ",")}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-5">
          {FORMAS_PAGAMENTO.map((opcao, indice) => {
            const Icon = opcao.icon;
            const ativo = selecionado === indice;
            return (
              <button
                key={opcao.label}
                type="button"
                onClick={() => selecionar(indice)}
                className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 transition-all active:scale-95 ${ativo ? "border-ink-900 bg-ink-900 text-white shadow-lg shadow-ink-900/20" : "border-cream-200 bg-cream-50 text-ink-600"}`}
              >
                <Icon size={21} />
                <span className="text-xs font-semibold">{opcao.label}</span>
              </button>
            );
          })}
        </div>

        {ehDinheiro && (
          <div className="mx-5 mb-5 rounded-2xl border border-cream-200 bg-cream-50 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink-700">Precisa de troco?</span>
              <div className="flex rounded-xl bg-cream-100 p-1">
                <button type="button" onClick={() => { setPrecisaTroco(false); setTrocoPara(""); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!precisaTroco ? "bg-white text-ink-900 shadow-sm" : "text-ink-400"}`}>Não</button>
                <button type="button" onClick={() => setPrecisaTroco(true)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${precisaTroco ? "bg-white text-ink-900 shadow-sm" : "text-ink-400"}`}>Sim</button>
              </div>
            </div>
            {precisaTroco && (
              <>
                <label className="mt-3 flex items-center overflow-hidden rounded-xl border border-cream-200 bg-white"><span className="px-3 text-sm font-semibold text-ink-400">R$</span><input inputMode="decimal" autoFocus value={trocoPara} onChange={(evento) => setTrocoPara(mascararMoeda(evento.target.value))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-sm outline-none" /></label>
                <p className="mt-1.5 text-xs text-ink-400">O cliente vai pagar com esse valor — a equipe leva o troco.</p>
              </>
            )}
          </div>
        )}

        <div className="p-5 pt-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {trocoInvalido && <p className="mb-2 text-xs font-medium text-coral-600">Informe o valor que o cliente vai pagar.</p>}
          <button onClick={() => void confirmar()} disabled={selecionado === null || enviando || trocoInvalido} className="of-primary-btn min-h-12 w-full disabled:opacity-40">
            {enviando ? "Liberando mesa..." : <><DoorOpen size={17} /> Confirmar e liberar mesa</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function GerenciarMesasModal({
  mesas,
  onFechar,
  onAlterou,
}: {
  mesas: Mesa[];
  onFechar: () => void;
  onAlterou: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [capacidade, setCapacidade] = useState("4");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function adicionar() {
    if (!numero) return;
    setEnviando(true);
    setErro("");
    const res = await fetch("/api/mesas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numero: Number(numero), capacidade: Number(capacidade) || 4 }),
    });
    setEnviando(false);
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      setErro(dados?.erro ?? "Não foi possível criar a mesa.");
      return;
    }
    setNumero("");
    onAlterou();
  }

  async function excluir(id: string, numeroMesa: number) {
    if (!confirm(`Excluir a mesa ${numeroMesa}?`)) return;
    const res = await fetch(`/api/mesas/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      alert(dados?.erro ?? "Não foi possível excluir.");
      return;
    }
    onAlterou();
  }

  async function alterarCapacidade(id: string, novaCapacidade: number) {
    await fetch(`/api/mesas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capacidade: novaCapacidade }),
    });
    onAlterou();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/45 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-t-[2rem] bg-surface shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-center justify-between p-5">
          <p className="font-display text-lg font-bold text-ink-900">Gerenciar mesas</p>
          <button onClick={onFechar} className="rounded-full bg-cream-100 px-3.5 py-2 text-sm font-semibold text-ink-600">
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <ul className="mb-4 space-y-2">
            {mesas.map((mesa) => (
              <li key={mesa.id} className="flex items-center justify-between rounded-2xl bg-cream-50 p-3">
                <span className="text-sm font-medium text-ink-900">Mesa {mesa.numero}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    defaultValue={mesa.capacidade}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v > 0 && v !== mesa.capacidade) alterarCapacidade(mesa.id, v);
                    }}
                    className="w-14 rounded-lg bg-white px-1.5 py-1.5 text-center text-xs shadow-sm"
                    title="Capacidade"
                  />
                  <button onClick={() => excluir(mesa.id, mesa.numero)} className="text-xs font-semibold text-danger-600 hover:underline">
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-5 pt-0">
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Número"
              className="w-20 rounded-xl bg-cream-50 px-2.5 py-2.5 text-sm text-ink-900 outline-none focus:ring-4 focus:ring-coral-100"
            />
            <input
              type="number"
              min={1}
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
              placeholder="Lugares"
              className="w-20 rounded-xl bg-cream-50 px-2.5 py-2.5 text-sm text-ink-900 outline-none focus:ring-4 focus:ring-coral-100"
            />
            <button
              onClick={adicionar}
              disabled={enviando || !numero}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white shadow-md shadow-coral-500/25 disabled:opacity-40"
              style={{ background: GRADIENTE_CORAL }}
            >
              + Adicionar mesa
            </button>
          </div>
          {erro && <p className="mt-2 text-xs font-medium text-danger-600">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
