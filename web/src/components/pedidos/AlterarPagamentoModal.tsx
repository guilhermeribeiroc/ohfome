"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { FormaPagamento, TipoCartao } from "@/lib/types";

type Forma = "dinheiro" | "cartao" | "pix";
type Modo = Forma | "dividir" | "crediario";

const ROTULO: Record<Forma, string> = { dinheiro: "Dinheiro", cartao: "Cartão", pix: "Pix" };

const paraNumero = (texto: string) => Number(texto.replace(/\./g, "").replace(",", "."));
const dinheiro = (valor: number) => `R$ ${valor.toFixed(2).replace(".", ",")}`;
const centavos = (valor: number) => Math.round(valor * 100) / 100;

export function AlterarPagamentoModal({ pedidoId, codigo, total = 0, formaAtual, tipoCartaoAtual, onFechar, onSalvo }: {
  pedidoId: string;
  codigo: number;
  /** Total do pedido: base do "Dividir em duas formas" (a segunda parte é o resto). */
  total?: number;
  formaAtual?: FormaPagamento;
  tipoCartaoAtual?: TipoCartao;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [modo, setModo] = useState<Modo>(formaAtual === "cartao" || formaAtual === "pix" || formaAtual === "crediario" ? formaAtual : "dinheiro");
  const [tipoCartao, setTipoCartao] = useState<TipoCartao>(tipoCartaoAtual ?? "credito");
  const [troco, setTroco] = useState("");
  // Dividir em duas formas: a 2ª parte é sempre o que sobra do total.
  const [forma1, setForma1] = useState<Forma>("dinheiro");
  const [forma2, setForma2] = useState<Forma>("cartao");
  const [valor1, setValor1] = useState("");
  const [cartao1, setCartao1] = useState<TipoCartao>("credito");
  const [cartao2, setCartao2] = useState<TipoCartao>("credito");
  const [troco1, setTroco1] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const numero1 = centavos(paraNumero(valor1 || "0"));
  const resto = centavos(total - (Number.isFinite(numero1) ? numero1 : 0));

  function trocarForma1(nova: Forma) {
    setForma1(nova);
    if (forma2 === nova) setForma2((["dinheiro", "cartao", "pix"] as const).find((f) => f !== nova) ?? "cartao");
  }

  async function salvar() {
    setErro("");
    let corpo: Record<string, unknown>;
    if (modo === "dividir") {
      if (!(total > 0)) { setErro("Não consegui ler o total do pedido. Feche e abra de novo."); return; }
      if (!(numero1 > 0) || numero1 >= total) { setErro(`Digite o valor da primeira forma (maior que zero e menor que ${dinheiro(total)}).`); return; }
      const troco1Numero = paraNumero(troco1 || "0");
      corpo = {
        formaPagamento: "misto",
        partes: [
          { forma: forma1, valor: numero1, tipoCartao: forma1 === "cartao" ? cartao1 : undefined, trocoPara: forma1 === "dinheiro" && troco1Numero > 0 ? troco1Numero : undefined },
          { forma: forma2, valor: resto, tipoCartao: forma2 === "cartao" ? cartao2 : undefined },
        ],
      };
    } else if (modo === "crediario") {
      corpo = { formaPagamento: "crediario" };
    } else {
      const valorTroco = paraNumero(troco);
      corpo = { formaPagamento: modo, tipoCartao: modo === "cartao" ? tipoCartao : undefined, trocoPara: modo === "dinheiro" && valorTroco > 0 ? valorTroco : undefined };
    }
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/pedidos/${pedidoId}/pagamento`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) { setErro(dados?.erro ?? "Não foi possível alterar o pagamento."); return; }
      onSalvo();
    } catch {
      setErro("Sem conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const botao = (ativo: boolean) => `rounded-xl border px-3 py-2.5 text-sm font-semibold ${ativo ? "border-coral-500 bg-coral-100 text-coral-700" : "border-cream-200 bg-white text-ink-600"}`;
  const selecao = (valor: Forma, aoMudar: (forma: Forma) => void, rotulo: string, bloqueada?: Forma) => (
    <select value={valor} onChange={(evento) => aoMudar(evento.target.value as Forma)} aria-label={rotulo} className="of-field !min-h-10">
      {(["dinheiro", "cartao", "pix"] as const).filter((f) => f !== bloqueada).map((f) => <option key={f} value={f}>{ROTULO[f]}</option>)}
    </select>
  );
  const tipoDoCartao = (valor: TipoCartao, aoMudar: (tipo: TipoCartao) => void, rotulo: string) => (
    <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={rotulo}>
      <button type="button" aria-pressed={valor === "credito"} onClick={() => aoMudar("credito")} className={botao(valor === "credito")}>Crédito</button>
      <button type="button" aria-pressed={valor === "debito"} onClick={() => aoMudar("debito")} className={botao(valor === "debito")}>Débito</button>
    </div>
  );

  return <div className="of-modal-backdrop z-[70]" role="dialog" aria-modal="true" aria-label={`Alterar pagamento do pedido ${codigo}`}>
    <section className="of-modal-panel of-modal-scroll max-w-sm p-5">
      <header className="mb-4 flex items-start justify-between">
        <div><p className="of-eyebrow">Pedido #{codigo}</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Alterar pagamento</h2></div>
        <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
      </header>
      <div className="grid grid-cols-2 gap-2">
        {(["dinheiro", "cartao", "pix"] as const).map((forma) => <button key={forma} type="button" aria-pressed={modo === forma} onClick={() => setModo(forma)} className={botao(modo === forma)}>{ROTULO[forma]}</button>)}
        <button type="button" aria-pressed={modo === "dividir"} onClick={() => setModo("dividir")} className={botao(modo === "dividir")}>Dividir em 2 formas</button>
        <button type="button" aria-pressed={modo === "crediario"} onClick={() => setModo("crediario")} className={botao(modo === "crediario")}>Crediário</button>
      </div>

      {modo === "crediario" && <p className="mt-3 rounded-xl bg-cream-50 p-3 text-xs leading-5 text-ink-700">Vai para a conta do cliente do pedido (fiado). O cliente precisa ter crediário ligado em Clientes e o pedido precisa ter um cliente.</p>}
      {modo === "cartao" && tipoDoCartao(tipoCartao, setTipoCartao, "Tipo do cartão")}
      {modo === "dinheiro" && <label className="mt-3 block text-xs font-semibold text-ink-700">Troco para (opcional)
        <input inputMode="decimal" value={troco} onChange={(evento) => setTroco(evento.target.value)} placeholder="R$ 0,00" className="of-field mt-1 !min-h-10" />
      </label>}

      {modo === "dividir" && <div className="mt-3 space-y-3 rounded-2xl bg-cream-50 p-3">
        <p className="text-xs font-semibold text-ink-700">Total do pedido: <b className="text-ink-900">{dinheiro(total)}</b></p>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-500">1ª forma</p>
          <div className="grid grid-cols-2 gap-2">
            {selecao(forma1, trocarForma1, "Primeira forma de pagamento")}
            <input inputMode="decimal" value={valor1} onChange={(evento) => setValor1(evento.target.value)} placeholder="Valor R$" aria-label="Valor da primeira forma" className="of-field !min-h-10" />
          </div>
          {forma1 === "cartao" && tipoDoCartao(cartao1, setCartao1, "Tipo do cartão da primeira forma")}
          {forma1 === "dinheiro" && <input inputMode="decimal" value={troco1} onChange={(evento) => setTroco1(evento.target.value)} placeholder="Troco para (opcional)" aria-label="Troco da parte em dinheiro" className="of-field mt-2 !min-h-10" />}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-500">2ª forma (o que sobra)</p>
          <div className="grid grid-cols-2 gap-2">
            {selecao(forma2, setForma2, "Segunda forma de pagamento", forma1)}
            <div className="of-field flex !min-h-10 items-center font-semibold text-ink-900" aria-label="Valor da segunda forma">{numero1 > 0 && resto > 0 ? dinheiro(resto) : "—"}</div>
          </div>
          {forma2 === "cartao" && tipoDoCartao(cartao2, setCartao2, "Tipo do cartão da segunda forma")}
        </div>
      </div>}

      <p className="mt-3 text-xs leading-5 text-ink-500">{modo === "dividir" ? "O financeiro conta cada parte na sua forma." : "Vale para o pedido e para os adicionais dele. O financeiro passa a contar pela nova forma."}</p>
      {erro && <p role="alert" className="mt-3 rounded-xl bg-danger-050 p-3 text-sm text-danger-600">{erro}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onFechar} className="of-btn-secondary min-h-11 flex-1">Cancelar</button>
        <button type="button" onClick={() => void salvar()} disabled={salvando} className="of-btn-primary min-h-11 flex-1">{salvando ? <Loader2 size={16} className="animate-spin" /> : null} Salvar</button>
      </div>
    </section>
  </div>;
}
