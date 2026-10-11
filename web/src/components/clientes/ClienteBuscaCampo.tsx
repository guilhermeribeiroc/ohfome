"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Cliente } from "@/lib/types";
import { ClienteFormModal } from "./ClienteFormModal";

export function ClienteBuscaCampo({ cliente, onSelecionar }: { cliente: Cliente | null; onSelecionar: (cliente: Cliente) => void }) {
  const [busca, setBusca] = useState(cliente?.nome ?? "");
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [cadastroAberto, setCadastroAberto] = useState(false);

  useEffect(() => {
    if (busca.trim().length < 2 || cliente?.nome === busca) return;
    const controlador = new AbortController();
    const temporizador = window.setTimeout(async () => {
      try {
        const resposta = await fetch(`/api/clientes/busca?q=${encodeURIComponent(busca)}`, { signal: controlador.signal });
        if (resposta.ok) setResultados(await resposta.json() as Cliente[]);
      } catch { /* a busca não deve impedir o cadastro manual */ }
    }, 220);
    return () => { controlador.abort(); window.clearTimeout(temporizador); };
  }, [busca, cliente?.id, cliente?.nome]);

  return <div className="relative">
    <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Cliente *</span><div className="relative"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Busque por nome ou telefone" className="of-field !pl-9" /></div></label>
    {busca.trim().length >= 2 && cliente?.nome !== busca && resultados.length > 0 && <div className="absolute z-30 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-cream-200 bg-surface p-1 shadow-lg">{resultados.map((item) => <button type="button" key={item.id} onClick={() => { onSelecionar(item); setBusca(item.nome); setResultados([]); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs transition hover:bg-cream-50"><b className="text-ink-900">{item.nome}</b><span className="ml-2 text-ink-400">{item.telefone || "sem telefone"}{item.endereco ? ` · ${item.endereco}` : ""}</span></button>)}</div>}
    <button type="button" onClick={() => setCadastroAberto(true)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-coral-700 hover:text-coral-800"><Plus size={14} />Cadastrar novo cliente</button>
    {cadastroAberto && <ClienteFormModal onFechar={() => setCadastroAberto(false)} onSalvo={(novo) => { onSelecionar(novo); setBusca(novo.nome); setCadastroAberto(false); setResultados([]); }} />}
  </div>;
}
