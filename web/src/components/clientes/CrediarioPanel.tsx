"use client";

import { useMemo, useState } from "react";
import { HandCoins, Loader2, Search, X } from "lucide-react";
import { usePolling } from "@/lib/use-polling";

type ClienteCrediario = {
  id: string; nome: string; telefone?: string | null; limiteCrediario: number | null;
  compras: number; pago: number; saldo: number; ultimaCompra?: string | null; ultimoPagamento?: string | null;
};
type Extrato = {
  cliente: { id: string; nome: string; telefone?: string | null; crediario: boolean; limiteCrediario: number | null };
  saldo: number;
  compras: { id: string; codigo: number; total: number; status: string; data: string; itens: string }[];
  pagamentos: { id: string; valor: number; forma: "dinheiro" | "pix" | "cartao"; observacao?: string | null; data: string; usuarioNome?: string | null }[];
};

const dinheiro = (valor: number) => `R$ ${valor.toFixed(2).replace(".", ",")}`;
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const FORMA: Record<"dinheiro" | "pix" | "cartao", string> = { dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão" };
const paraNumero = (texto: string) => Number(texto.replace(/\./g, "").replace(",", "."));

function Extrato({ clienteId, onFechar, onMudou }: { clienteId: string; onFechar: () => void; onMudou: () => void }) {
  const { dados, recarregar } = usePolling<Extrato>(`/api/crediario/${clienteId}`, 15000);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<"dinheiro" | "pix" | "cartao">("dinheiro");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  const linhas = useMemo(() => {
    if (!dados) return [];
    return [
      ...dados.compras.map((compra) => ({ chave: `c${compra.id}`, data: compra.data, tipo: "compra" as const, titulo: `Pedido #${compra.codigo}`, detalhe: compra.itens, valor: compra.total })),
      ...dados.pagamentos.map((pagamento) => ({ chave: `p${pagamento.id}`, data: pagamento.data, tipo: "pagamento" as const, titulo: `Pagamento · ${FORMA[pagamento.forma]}`, detalhe: [pagamento.observacao, pagamento.usuarioNome ? `recebido por ${pagamento.usuarioNome}` : null].filter(Boolean).join(" · "), valor: pagamento.valor })),
    ].sort((a, b) => b.data.localeCompare(a.data));
  }, [dados]);

  async function receber() {
    setErro(""); setAviso("");
    const numero = paraNumero(valor);
    if (!(numero > 0)) { setErro("Informe o valor recebido."); return; }
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/crediario/${clienteId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: numero, forma, observacao }) });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) { setErro(corpo?.erro ?? "Não foi possível registrar o pagamento."); return; }
      setValor(""); setObservacao("");
      setAviso(corpo?.saldoDepois > 0 ? `Pagamento registrado. Falta receber ${dinheiro(corpo.saldoDepois)}.` : "Pagamento registrado. Conta quitada!");
      recarregar(); onMudou();
    } catch { setErro("Sem conexão. Tente novamente."); }
    finally { setSalvando(false); }
  }

  return <div className="of-modal-backdrop z-50" role="dialog" aria-modal="true" aria-label="Extrato do crediário">
    <section className="of-modal-panel flex h-[min(92dvh,840px)] max-w-lg flex-col overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-cream-200 p-5">
        <div className="min-w-0"><p className="of-eyebrow">Crediário</p><h2 className="truncate font-display text-xl font-bold tracking-tight text-ink-900">{dados?.cliente.nome ?? "Carregando..."}</h2>
          {dados?.cliente.telefone && <p className="text-xs text-ink-500">{dados.cliente.telefone}</p>}</div>
        <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
      </header>
      {!dados ? <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-ink-400" size={22} /></div> : <>
        <div className="grid grid-cols-2 gap-3 border-b border-cream-100 bg-cream-50/60 p-4">
          <div><p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Deve</p><p className={`font-display text-2xl font-bold ${dados.saldo > 0 ? "text-danger-600" : "text-emerald-700"}`}>{dinheiro(Math.max(0, dados.saldo))}</p></div>
          <div><p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Limite</p><p className="font-display text-2xl font-bold text-ink-900">{dados.cliente.limiteCrediario ? dinheiro(dados.cliente.limiteCrediario) : "Sem limite"}</p></div>
        </div>
        {dados.saldo > 0 && <div className="space-y-2 border-b border-cream-100 p-4">
          <p className="text-xs font-bold text-ink-800">Receber pagamento <span className="font-normal text-ink-500">(pode ser só uma parte)</span></p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={valor} onChange={(evento) => setValor(evento.target.value)} inputMode="decimal" placeholder="Valor R$" aria-label="Valor recebido" className="of-field !min-h-10" />
            <button type="button" onClick={() => setValor(dados.saldo.toFixed(2).replace(".", ","))} className="of-btn-secondary !min-h-10 !px-3 !text-xs">Tudo ({dinheiro(dados.saldo)})</button>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Como pagou">
            {(["dinheiro", "pix", "cartao"] as const).map((opcao) => <button key={opcao} type="button" aria-pressed={forma === opcao} onClick={() => setForma(opcao)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${forma === opcao ? "border-coral-500 bg-coral-100 text-coral-700" : "border-cream-200 bg-white text-ink-600"}`}>{FORMA[opcao]}</button>)}
          </div>
          <input value={observacao} onChange={(evento) => setObservacao(evento.target.value)} maxLength={200} placeholder="Observação (opcional)" aria-label="Observação" className="of-field !min-h-10" />
          {erro && <p role="alert" className="rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-700">{erro}</p>}
          <button type="button" onClick={() => void receber()} disabled={salvando} className="of-btn-primary w-full">{salvando ? <><Loader2 size={15} className="animate-spin" />Registrando...</> : <><HandCoins size={16} /> Registrar pagamento</>}</button>
        </div>}
        {aviso && <p role="status" className="mx-4 mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">{aviso}</p>}
        <ul className="min-h-0 flex-1 divide-y divide-cream-100 overflow-y-auto px-4 pb-3 pt-1">
          {!linhas.length && <li className="py-8 text-center text-sm text-ink-500">Ainda não há compras nem pagamentos no crediário.</li>}
          {linhas.map((linha) => <li key={linha.chave} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0"><p className="text-sm font-semibold text-ink-900">{linha.titulo}</p>
              {linha.detalhe && <p className="mt-0.5 text-xs leading-4 text-ink-500">{linha.detalhe}</p>}
              <p className="mt-0.5 text-[11px] text-ink-400">{dataHora(linha.data)}</p></div>
            <b className={`shrink-0 text-sm ${linha.tipo === "compra" ? "text-danger-600" : "text-emerald-700"}`}>{linha.tipo === "compra" ? "+" : "−"} {dinheiro(linha.valor)}</b>
          </li>)}
        </ul>
      </>}
    </section>
  </div>;
}

export function CrediarioPanel() {
  const { dados, recarregar } = usePolling<{ clientes: ClienteCrediario[]; totalAReceber: number }>("/api/crediario", 15000);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.clientes ?? []).filter((cliente) => !termo || `${cliente.nome} ${cliente.telefone ?? ""}`.toLowerCase().includes(termo));
  }, [dados, busca]);
  const devendo = (dados?.clientes ?? []).filter((cliente) => cliente.saldo > 0).length;

  return <section className="of-panel overflow-hidden">
    <div className="grid grid-cols-2 gap-3 border-b border-cream-100 bg-cream-50/60 p-4 sm:p-5">
      <div><p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Total a receber</p><p className="font-display text-2xl font-bold text-ink-900">{dinheiro(dados?.totalAReceber ?? 0)}</p></div>
      <div><p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Clientes devendo</p><p className="font-display text-2xl font-bold text-ink-900">{devendo}</p></div>
    </div>
    <div className="border-b border-cream-200 p-4"><div className="relative max-w-lg"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar cliente do crediário" aria-label="Buscar cliente do crediário" className="of-field !pl-10" /></div></div>
    {!dados ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-ink-400" size={22} /></div>
      : !clientes.length ? <div className="px-6 py-12 text-center"><p className="text-sm font-semibold text-ink-700">{(dados.clientes.length ? "Nenhum cliente encontrado." : "Nenhum cliente com crediário ainda.")}</p>{!dados.clientes.length && <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-500">Na aba Clientes, edite um cliente fixo e ligue &quot;Cliente de crediário&quot;. Depois, na hora do pedido, escolha a forma de pagamento Crediário.</p>}</div>
      : <ul className="divide-y divide-cream-100">{clientes.map((cliente) => <li key={cliente.id}><button type="button" onClick={() => setAberto(cliente.id)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-cream-50 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-050 font-display text-xs font-bold text-coral-700">{cliente.nome.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{cliente.nome}</p><p className="mt-0.5 truncate text-xs text-ink-500">{cliente.telefone || "Sem telefone"}{cliente.limiteCrediario ? ` · limite ${dinheiro(cliente.limiteCrediario)}` : ""}{cliente.ultimaCompra ? ` · última compra ${new Date(cliente.ultimaCompra).toLocaleDateString("pt-BR")}` : ""}</p></div>
          <b className={`shrink-0 text-base ${cliente.saldo > 0 ? "text-danger-600" : "text-emerald-700"}`}>{cliente.saldo > 0 ? dinheiro(cliente.saldo) : "Em dia"}</b>
        </button></li>)}</ul>}
    {aberto && <Extrato clienteId={aberto} onFechar={() => setAberto(null)} onMudou={recarregar} />}
  </section>;
}
