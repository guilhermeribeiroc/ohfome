"use client";

import { useEffect, useState } from "react";
import { Check, Search, UserRound, X } from "lucide-react";
import type { Cliente } from "@/lib/types";

/**
 * Campo de cliente para delivery e retirada: digite o nome (ou o telefone) e
 * escolha um cliente já cadastrado, ou deixe o nome digitado para cadastrar na
 * hora. O telefone é opcional. Quando o cliente é escolhido da lista, o
 * endereço dele já vem preenchido pelo pedido.
 */
export function ClienteRapido({ cliente, nome, telefone, onNome, onTelefone, onSelecionar, onLimpar, obrigatorio = true }: {
  cliente: Cliente | null;
  nome: string;
  telefone: string;
  onNome: (valor: string) => void;
  onTelefone: (valor: string) => void;
  onSelecionar: (cliente: Cliente) => void;
  onLimpar: () => void;
  obrigatorio?: boolean;
}) {
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [aberto, setAberto] = useState(false);
  const termo = nome.trim();

  useEffect(() => {
    if (cliente || termo.length < 2) return;
    const controlador = new AbortController();
    const temporizador = window.setTimeout(async () => {
      try {
        const resposta = await fetch(`/api/clientes/busca?q=${encodeURIComponent(termo)}`, { signal: controlador.signal });
        if (resposta.ok) setResultados(await resposta.json() as Cliente[]);
      } catch { /* a busca é só uma ajuda: o cliente pode ser digitado à mão */ }
    }, 220);
    return () => { controlador.abort(); window.clearTimeout(temporizador); };
  }, [termo, cliente]);

  if (cliente) {
    return <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
      <div className="min-w-0"><p className="flex items-center gap-1.5 text-sm font-bold text-ink-900"><Check size={15} className="text-emerald-600" />{cliente.nome}</p>
        <p className="mt-0.5 text-xs text-ink-500">{cliente.telefone || "Sem telefone"}{cliente.pontoReferencia ? ` · ${cliente.pontoReferencia}` : ""}</p></div>
      <button type="button" onClick={() => { onLimpar(); setResultados([]); }} className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-800"><X size={13} /> Trocar</button>
    </div>;
  }

  return <div className="space-y-2">
    <div className="relative">
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Nome do cliente{obrigatorio ? " *" : ""}</span>
        <span className="relative block"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input value={nome} onChange={(evento) => { onNome(evento.target.value); setAberto(true); }} onFocus={() => setAberto(true)} onBlur={() => window.setTimeout(() => setAberto(false), 150)} placeholder="Digite o nome ou o telefone" autoComplete="off" className="of-field !pl-9" /></span></label>
      {aberto && termo.length >= 2 && resultados.length > 0 && <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-cream-200 bg-surface p-1 shadow-lg">
        {resultados.map((item) => <button type="button" key={item.id} onMouseDown={(evento) => evento.preventDefault()} onClick={() => { onSelecionar(item); setResultados([]); setAberto(false); }} className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-cream-50"><UserRound size={14} className="mt-0.5 shrink-0 text-ink-400" /><span className="min-w-0"><b className="block text-ink-900">{item.nome}</b><span className="text-ink-400">{item.telefone || "sem telefone"}{item.endereco ? ` · ${item.endereco}` : ""}</span></span></button>)}
      </div>}
    </div>
    <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Telefone <span className="font-normal text-ink-400">(opcional)</span></span>
      <input value={telefone} onChange={(evento) => onTelefone(evento.target.value)} inputMode="tel" autoComplete="off" placeholder="(00) 00000-0000" className="of-field" /></label>
    {termo.length >= 2 && !resultados.length && <p className="text-[11px] text-ink-400">Cliente novo: será cadastrado junto com o pedido.</p>}
  </div>;
}
