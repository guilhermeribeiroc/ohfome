"use client";

import { useMemo, useState, type DragEvent } from "react";
import { Check, MapPin, Plus, Printer, Send, Trash2, UserRoundPlus, X } from "lucide-react";
import type { Entrega, Entregador, EntregaStatus, Produto } from "@/lib/types";
import { ENTREGA_STATUS_LABEL } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { imprimirEntrega } from "@/lib/impressao";

const COLUNAS: EntregaStatus[] = ["aguardando", "em_rota", "entregue"];
const GRADIENTE_CORAL = "linear-gradient(120deg, var(--color-coral-600), var(--color-coral-500), var(--color-mango-500))";
const CAMPO_CLASSE =
  "w-full rounded-xl bg-cream-50 px-3.5 py-3 text-sm text-ink-900 outline-none transition focus:ring-4 focus:ring-coral-100";

export function DeliveryModule() {
  const { dados: entregas, recarregar: recarregarEntregas } = usePolling<Entrega[]>("/api/entregas", 4000);
  const { dados: entregadores, recarregar: recarregarEntregadores } = usePolling<Entregador[]>("/api/entregadores", 4000);
  const [modalAberto, setModalAberto] = useState(false);
  const [novoEntregadorAberto, setNovoEntregadorAberto] = useState(false);
  const [entregaArrastada, setEntregaArrastada] = useState<string | null>(null);
  const [colunaDestino, setColunaDestino] = useState<EntregaStatus | null>(null);
  const [entregaDetalhe, setEntregaDetalhe] = useState<Entrega | null>(null);

  async function excluirEntregador(id: string, nome: string) {
    if (!confirm(`Remover "${nome}" da equipe de entrega?`)) return;
    const res = await fetch(`/api/entregadores/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      alert(dados?.erro ?? "Não foi possível remover.");
      return;
    }
    recarregarEntregadores();
  }

  async function atribuir(entregaId: string, entregadorId: string) {
    await fetch(`/api/entregas/${entregaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entregadorId }),
    });
    recarregarEntregas();
    recarregarEntregadores();
  }

  async function marcarEntregue(entregaId: string) {
    await fetch(`/api/entregas/${entregaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "entregue" }),
    });
    recarregarEntregas();
    recarregarEntregadores();
  }

  async function marcarSaiu(entregaId: string) {
    await fetch(`/api/entregas/${entregaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "em_rota" }),
    });
    recarregarEntregas();
  }

  async function moverEntrega(entregaId: string, status: EntregaStatus) {
    const entregaAtual = (entregas ?? []).find((entrega) => entrega.id === entregaId);
    if (!entregaAtual || entregaAtual.status === status) return;
    const resposta = await fetch(`/api/entregas/${entregaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!resposta.ok) { recarregarEntregas(); return; }
    recarregarEntregas(); recarregarEntregadores();
  }

  function iniciarArraste(evento: DragEvent<HTMLElement>, entregaId: string) {
    evento.dataTransfer.setData("text/ohfome-entrega", entregaId);
    evento.dataTransfer.effectAllowed = "move";
    setEntregaArrastada(entregaId);
  }

  async function soltarEntrega(evento: DragEvent<HTMLElement>, status: EntregaStatus) {
    evento.preventDefault();
    const entregaId = evento.dataTransfer.getData("text/ohfome-entrega");
    setEntregaArrastada(null); setColunaDestino(null);
    if (entregaId) await moverEntrega(entregaId, status);
  }

  return (
    <div className="of-page">
      <div className="of-page-header">
        <div><p className="of-eyebrow">Expedição</p>
          <h1 className="of-title">Delivery</h1>
          <p className="of-subtitle">Entregadores, atribuições e acompanhamento de cada saída.</p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="of-btn-primary w-full sm:w-auto"
        >
          <Plus size={17} /> Novo pedido delivery
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COLUNAS.map((status) => {
            const itens = (entregas ?? []).filter((e) => e.status === status);
            return (
              <div key={status} onDragOver={(evento) => { evento.preventDefault(); evento.dataTransfer.dropEffect = "move"; setColunaDestino(status); }} onDragLeave={() => setColunaDestino((atual) => atual === status ? null : atual)} onDrop={(evento) => void soltarEntrega(evento, status)} className={`of-panel overflow-hidden transition ${colunaDestino === status ? "ring-2 ring-coral-400 ring-offset-2" : ""}`}>
                <div className="flex items-center justify-between px-3.5 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          status === "aguardando"
                            ? "var(--color-status-novo)"
                            : status === "em_rota"
                              ? "var(--color-status-saiu_para_entrega)"
                              : "var(--color-status-pronto)",
                      }}
                    />
                    {ENTREGA_STATUS_LABEL[status]}
                  </span>
                  <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs font-semibold text-ink-400">{itens.length}</span>
                </div>
                <div className="flex flex-col gap-2.5 p-2.5 pt-0">
                  {itens.length === 0 && <p className="px-1 py-6 text-center text-xs text-ink-400">Nenhuma entrega</p>}
                  {itens.map((entrega) => {
                    const entregador = (entregadores ?? []).find((e) => e.id === entrega.entregadorId);
                    return (
                      <div key={entrega.id} draggable role="button" tabIndex={0} onClick={() => setEntregaDetalhe(entrega)} onKeyDown={(evento) => { if (evento.key === "Enter") setEntregaDetalhe(entrega); }} onDragStart={(evento) => iniciarArraste(evento, entrega.id)} onDragEnd={() => { setEntregaArrastada(null); setColunaDestino(null); }} className={`cursor-grab rounded-2xl border border-cream-200 bg-surface p-3.5 shadow-sm transition active:cursor-grabbing hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 ${entregaArrastada === entrega.id ? "opacity-45" : ""}`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-display text-sm font-bold text-coral-600">#{entrega.pedidoCodigo}</span>
                          <span className="text-sm font-bold text-ink-900">
                            R$ {entrega.total.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-ink-600">{entrega.clienteNome}</p>
                        <p className="mb-2.5 mt-1 flex items-start gap-1.5 text-xs leading-5 text-ink-400"><MapPin size={13} className="mt-0.5 shrink-0" />{entrega.endereco}</p>

                        {status === "aguardando" && <div className="space-y-2"><button onClick={(evento) => { evento.stopPropagation(); void marcarSaiu(entrega.id); }} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-900 px-3 text-[11px] font-semibold text-white transition active:scale-95"><Send size={13} /> Saiu para entrega</button>{(entregadores ?? []).some((e) => e.disponivel) && <select defaultValue="" onClick={(evento) => evento.stopPropagation()} onChange={(e) => e.target.value && atribuir(entrega.id, e.target.value)} className="w-full rounded-lg border border-cream-200 bg-surface px-2 py-2 text-xs text-ink-600 shadow-sm outline-none"><option value="" disabled>Atribuir entregador (opcional)</option>{(entregadores ?? []).filter((e) => e.disponivel).map((e) => <option key={e.id} value={e.id}>{e.nome} · {e.veiculo}</option>)}</select>}</div>}

                        {status === "em_rota" && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-ink-400">{entregador?.nome ?? "—"}</span>
                            <button
                              onClick={(evento) => { evento.stopPropagation(); void marcarEntregue(entrega.id); }}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20"
                            >
                              <Check size={13} /> Marcar entregue
                            </button>
                          </div>
                        )}

                        {status === "entregue" && (
                          <span className="text-xs text-ink-400">{entregador?.nome ?? "—"}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="of-panel overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Entregadores</p>
            <button onClick={() => setNovoEntregadorAberto(true)} className="of-btn-secondary !min-h-10 !px-3 !text-[11px]">
              <UserRoundPlus size={14} /> Novo
            </button>
          </div>
          <ul className="divide-y divide-cream-100 px-2 pb-2">
            {(entregadores ?? []).map((entregador) => (
              <li key={entregador.id} className="flex items-center justify-between px-2.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{entregador.nome}</p>
                  <p className="text-xs text-ink-400">{entregador.veiculo || "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      entregador.disponivel ? "bg-basil-050 text-basil-600" : "bg-cream-200 text-ink-400"
                    }`}
                  >
                    {entregador.disponivel ? "Disponível" : "Em rota"}
                  </span>
                  <button
                    onClick={() => excluirEntregador(entregador.id, entregador.nome)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-danger-600 hover:bg-danger-050"
                    aria-label={`Excluir ${entregador.nome}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {novoEntregadorAberto && (
        <NovoEntregadorModal
          onFechar={() => setNovoEntregadorAberto(false)}
          onCriado={() => {
            setNovoEntregadorAberto(false);
            recarregarEntregadores();
          }}
        />
      )}

      {modalAberto && (
        <NovoPedidoDeliveryModal
          onFechar={() => setModalAberto(false)}
          onCriado={() => {
            setModalAberto(false);
            recarregarEntregas();
          }}
        />
      )}
      {entregaDetalhe && <EntregaDetalheModal entrega={entregaDetalhe} entregadorNome={(entregadores ?? []).find((entregador) => entregador.id === entregaDetalhe.entregadorId)?.nome} onFechar={() => setEntregaDetalhe(null)} />}
    </div>
  );
}

function EntregaDetalheModal({ entrega, entregadorNome, onFechar }: { entrega: Entrega; entregadorNome?: string; onFechar: () => void }) {
  const pagamento = entrega.formaPagamento === "cartao" ? `Cartão · ${entrega.tipoCartao === "credito" ? "Crédito" : "Débito"}` : entrega.formaPagamento === "dinheiro" ? entrega.trocoPara ? `Dinheiro · troco para R$ ${Number(entrega.trocoPara).toFixed(2).replace(".", ",")}` : "Dinheiro · sem troco" : null;
  return <div className="of-modal-backdrop z-50" role="dialog" aria-modal="true" aria-label={`Detalhes da entrega ${entrega.pedidoCodigo}`}>
    <section className="of-modal-panel flex max-h-[90dvh] max-w-lg flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-cream-200 p-5"><div><p className="of-eyebrow">Entrega · Pedido #{entrega.pedidoCodigo}</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Ficha do entregador</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar detalhes"><X size={17} /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><div className="rounded-2xl bg-cream-50 p-3.5"><p className="font-semibold text-ink-900">{entrega.clienteNome}</p>{entrega.clienteTelefone && <p className="mt-1 text-xs text-ink-500">WhatsApp: {entrega.clienteTelefone}</p>}{entregadorNome && <p className="mt-1 text-xs text-ink-500">Entregador: {entregadorNome}</p>}<p className="mt-2 flex gap-1.5 text-xs leading-5 text-ink-600"><MapPin size={13} className="mt-0.5 shrink-0 text-coral-600" />{entrega.endereco}</p>{pagamento && <p className="mt-2 text-xs font-medium text-ink-700">Pagamento: {pagamento}</p>}{entrega.observacoes && <p className="mt-2 text-xs leading-5 text-ink-600">Obs.: {entrega.observacoes}</p>}</div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">Itens do pedido</p><ul className="divide-y divide-cream-100 rounded-2xl border border-cream-200 bg-surface px-3.5">{(entrega.itens ?? []).map((item, indice) => <li key={`${item.produtoNome}-${indice}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span><b className="mr-2 text-ink-900">{item.quantidade}×</b>{item.produtoNome}</span><b className="shrink-0 text-ink-900">R$ {(item.precoUnitario * item.quantidade).toFixed(2).replace(".", ",")}</b></li>)}</ul></div></div>
      <footer className="flex items-center justify-between gap-3 border-t border-cream-200 bg-surface p-5"><button onClick={() => imprimirEntrega(entrega, entregadorNome)} className="of-btn-secondary min-h-11 px-3"><Printer size={16} /> Imprimir</button><div className="text-right"><span className="block text-xs text-ink-400">{ENTREGA_STATUS_LABEL[entrega.status]}</span><strong className="font-display text-xl font-bold text-ink-900">R$ {entrega.total.toFixed(2).replace(".", ",")}</strong></div></footer>
    </section>
  </div>;
}

function NovoPedidoDeliveryModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const { dados: produtos } = usePolling<Produto[]>("/api/produtos", 60000);
  const [clienteNome, setClienteNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [itens, setItens] = useState<Record<string, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const total = useMemo(() => {
    if (!produtos) return 0;
    return Object.entries(itens).reduce((soma, [produtoId, qtd]) => {
      const produto = produtos.find((p) => p.id === produtoId);
      return soma + (produto?.precoVenda ?? 0) * qtd;
    }, 0);
  }, [itens, produtos]);

  function ajustar(produtoId: string, delta: number) {
    setItens((atual) => {
      const novaQtd = (atual[produtoId] ?? 0) + delta;
      if (novaQtd <= 0) {
        return Object.fromEntries(Object.entries(atual).filter(([chave]) => chave !== produtoId));
      }
      return { ...atual, [produtoId]: novaQtd };
    });
  }

  async function criar() {
    if (!clienteNome.trim() || !endereco.trim() || Object.keys(itens).length === 0) return;
    setEnviando(true);
    setErro("");
    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "delivery",
        clienteNome,
        endereco,
        itens: Object.entries(itens).map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
      }),
    });
    setEnviando(false);
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      setErro(dados?.erro ?? "Não foi possível criar o pedido.");
      return;
    }
    onCriado();
  }

  return (
    <div className="of-modal-backdrop">
      <div className="of-modal-panel flex max-w-md flex-col">
        <div className="flex items-center justify-between p-5">
          <p className="font-display text-lg font-bold text-ink-900">Novo pedido — Delivery</p>
          <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <div className="mb-4 space-y-2">
            <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" className={CAMPO_CLASSE} />
            <input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Endereço de entrega" className={CAMPO_CLASSE} />
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Itens</p>
          <div className="grid grid-cols-1 gap-2">
            {(produtos ?? []).map((produto) => {
              const qtd = itens[produto.id] ?? 0;
              return (
                <div key={produto.id} className="flex items-center justify-between rounded-2xl bg-cream-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{produto.nome}</p>
                    <p className="text-xs text-ink-400">R$ {produto.precoVenda.toFixed(2).replace(".", ",")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => ajustar(produto.id, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink-600 shadow-sm active:scale-90"
                    >
                      −
                    </button>
                    <span className="w-4 text-center text-sm font-bold text-ink-900">{qtd}</span>
                    <button
                      onClick={() => ajustar(produto.id, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm active:scale-90"
                      style={{ background: GRADIENTE_CORAL }}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          {erro && <p className="mb-2 text-xs font-medium text-danger-600">{erro}</p>}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-ink-400">{Object.keys(itens).length} item(ns)</span>
            <span className="font-display text-lg font-bold text-ink-900">R$ {total.toFixed(2).replace(".", ",")}</span>
          </div>
          <button
            onClick={criar}
            disabled={enviando || !clienteNome.trim() || !endereco.trim() || Object.keys(itens).length === 0}
            className="of-btn-primary w-full"
          >
            {enviando ? "Criando..." : "Criar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NovoEntregadorModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [veiculo, setVeiculo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    if (!nome.trim()) return;
    setEnviando(true);
    setErro("");
    const res = await fetch("/api/entregadores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, veiculo, telefone }),
    });
    setEnviando(false);
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      setErro(dados?.erro ?? "Não foi possível criar o entregador.");
      return;
    }
    onCriado();
  }

  return (
    <div className="of-modal-backdrop">
      <div className="of-modal-panel max-w-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-lg font-bold text-ink-900">Novo entregador</p>
          <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
        </div>

        <div className="space-y-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={CAMPO_CLASSE} />
          <input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Veículo (ex.: Moto)" className={CAMPO_CLASSE} />
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Telefone (opcional)" className={CAMPO_CLASSE} />

          {erro && <p className="text-xs font-medium text-danger-600">{erro}</p>}

          <button
            onClick={criar}
            disabled={enviando || !nome.trim()}
            className="of-btn-primary w-full"
          >
            {enviando ? "Criando..." : "Criar entregador"}
          </button>
        </div>
      </div>
    </div>
  );
}
