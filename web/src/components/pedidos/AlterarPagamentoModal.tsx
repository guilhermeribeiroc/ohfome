"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { FormaPagamento, PedidoTipo, TipoCartao } from "@/lib/types";

type Forma = "dinheiro" | "cartao" | "pix";

export function AlterarPagamentoModal({ pedidoId, codigo, tipo, formaAtual, tipoCartaoAtual, onFechar, onSalvo }: {
  pedidoId: string;
  codigo: number;
  tipo: PedidoTipo;
  formaAtual?: FormaPagamento;
  tipoCartaoAtual?: TipoCartao;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [forma, setForma] = useState<Forma>(formaAtual === "cartao" || formaAtual === "pix" ? formaAtual : "dinheiro");
  const [tipoCartao, setTipoCartao] = useState<TipoCartao>(tipoCartaoAtual ?? "credito");
  const [troco, setTroco] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const formas: { id: Forma; rotulo: string }[] = [
    { id: "dinheiro", rotulo: "Dinheiro" },
    { id: "cartao", rotulo: "Cartão" },
    ...(tipo === "delivery" ? [] : [{ id: "pix" as const, rotulo: "Pix" }]),
  ];

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      const valorTroco = Number(troco.replace(/\./g, "").replace(",", "."));
      const resposta = await fetch(`/api/pedidos/${pedidoId}/pagamento`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formaPagamento: forma,
          tipoCartao: forma === "cartao" ? tipoCartao : undefined,
          trocoPara: forma === "dinheiro" && valorTroco > 0 ? valorTroco : undefined,
        }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) { setErro(corpo?.erro ?? "Não foi possível alterar o pagamento."); return; }
      onSalvo();
    } catch {
      setErro("Sem conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const botao = (ativo: boolean) => `rounded-xl border px-3 py-2.5 text-sm font-semibold ${ativo ? "border-coral-500 bg-coral-100 text-coral-700" : "border-cream-200 bg-white text-ink-600"}`;
  return <div className="of-modal-backdrop z-[70]" role="dialog" aria-modal="true" aria-label={`Alterar pagamento do pedido ${codigo}`}>
    <section className="of-modal-panel of-modal-scroll max-w-sm p-5">
      <header className="mb-4 flex items-start justify-between">
        <div><p className="of-eyebrow">Pedido #{codigo}</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Alterar pagamento</h2></div>
        <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
      </header>
      <div className={`grid gap-2 ${formas.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {formas.map((opcao) => <button key={opcao.id} type="button" aria-pressed={forma === opcao.id} onClick={() => setForma(opcao.id)} className={botao(forma === opcao.id)}>{opcao.rotulo}</button>)}
      </div>
      {forma === "cartao" && <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={tipoCartao === "credito"} onClick={() => setTipoCartao("credito")} className={botao(tipoCartao === "credito")}>Crédito</button>
        <button type="button" aria-pressed={tipoCartao === "debito"} onClick={() => setTipoCartao("debito")} className={botao(tipoCartao === "debito")}>Débito</button>
      </div>}
      {forma === "dinheiro" && <label className="mt-3 block text-xs font-semibold text-ink-700">Troco para (opcional)
        <input inputMode="decimal" value={troco} onChange={(evento) => setTroco(evento.target.value)} placeholder="R$ 0,00" className="of-field mt-1 !min-h-10" />
      </label>}
      <p className="mt-3 text-xs leading-5 text-ink-500">Vale para o pedido e para os adicionais dele. O financeiro passa a contar pela nova forma.</p>
      {erro && <p role="alert" className="mt-3 rounded-xl bg-danger-050 p-3 text-sm text-danger-600">{erro}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onFechar} className="of-btn-secondary min-h-11 flex-1">Cancelar</button>
        <button type="button" onClick={() => void salvar()} disabled={salvando} className="of-btn-primary min-h-11 flex-1">{salvando ? <Loader2 size={16} className="animate-spin" /> : null} Salvar</button>
      </div>
    </section>
  </div>;
}
